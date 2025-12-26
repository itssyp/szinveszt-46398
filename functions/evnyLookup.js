const express = require('express')
const axios = require('axios')
const cors = require('cors')
const crypto = require('crypto')
const cheerio = require('cheerio')
const { admin } = require('./utils')

const EVNY_BASE_URL =
  process.env.EVNY_BASE_URL ||
  'https://nav.gov.hu/adatbazisok/adatbleker/egyeni-vallalkozok-nyilvantartasa'

const EVNY_CACHE_HOURS = 24

function rateLimitedFactory() {
  const evnyRate = new Map() // ip -> { count, ts }
  return function rateLimited(ip) {
    const now = Date.now()
    const windowMs = 60 * 1000
    const max = 5
    const entry = evnyRate.get(ip) || { count: 0, ts: now }
    if (now - entry.ts > windowMs) {
      evnyRate.set(ip, { count: 1, ts: now })
      return false
    }
    if (entry.count >= max) return true
    evnyRate.set(ip, { count: entry.count + 1, ts: entry.ts })
    return false
  }
}

function hashText(str) {
  return crypto.createHash('sha256').update(str || '', 'utf8').digest('hex')
}

function normalizeWhitespace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
}

function normalizeHuDateToIso(s) {
  // "2022.11.16" -> "2022-11-16"
  const t = normalizeWhitespace(s)
  const m = t.match(/^(\d{4})\.(\d{2})\.(\d{2})$/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function pickEvnyStatusFromHuText(huStatusOrBodyText) {
  const t = String(huStatusOrBodyText || '').toLowerCase()
  if (t.includes('szünet')) return 'SUSPENDED'
  if (t.includes('megszűnt')) return 'ENDED'
  if (t.includes('működő')) return 'ACTIVE'
  return 'UNKNOWN'
}

/**
 * Extracts a label->value map from the "show record" EVNY page
 * structure (label.evny-label followed by span.dotted-line).
 *
 * This is what your downloaded HTML uses.
 */
function extractLabelValueMap($) {
  const map = {}

  // Primary selector found in the downloaded page:
  // .show-record .evny-container .evny-label + .dotted-line
  const labels = $('.show-record .evny-container .evny-label')
  if (labels.length === 0) return map

  labels.each((_, el) => {
    const label = normalizeWhitespace($(el).text())
    const value = normalizeWhitespace($(el).next('.dotted-line').text())
    if (label) map[label] = value || ''
  })

  return map
}

function parseEvnyHtmlStrict(rawHtml) {
  const $ = cheerio.load(rawHtml)

  const lv = {}
  const labels = $('.show-record .evny-container .evny-label')
  labels.each((_, el) => {
    const label = normalizeWhitespace($(el).text())
    const value = normalizeWhitespace($(el).next('.dotted-line').text())
    if (label) lv[label] = value || ''
  })

  // If the structured page isn't present, DON'T guess.
  if (!lv['Állapot'] && labels.length === 0) {
    return {
      ok: false,
      error: 'EVNY_PARSE_FAILED_NO_SHOW_RECORD',
      status: 'UNKNOWN',
      statusHu: null,
      startDate: null,
      suspensionStartDate: null,
      suspensionEndDate: null,
      name: null,
      address: null,
      registryNumber: null,
      taxNumber: null,
    }
  }

  const statusHu = lv['Állapot'] || ''
  const status = pickEvnyStatusFromHuText(statusHu)

  const startDate = normalizeHuDateToIso(lv['Nyilvántartásba történő felvétel napja'] || '')
  const suspensionStartDate = normalizeHuDateToIso(lv['Szünetelés kezdő napja'] || '')

  return {
    ok: true,
    error: null,
    status,
    statusHu: statusHu || null,
    startDate,
    suspensionStartDate,
    suspensionEndDate: null, // not on this page reliably
    name: lv['Vállalkozó neve'] || null,
    address: lv['Cím'] || null,
    registryNumber: lv['Nyilvántartási szám'] || null,
    taxNumber: lv['Adószám'] || null,
  }
}

async function fetchEvny(type, value) {
  if (!EVNY_BASE_URL) {
    return { error: 'EVNY_BASE_URL is not configured.' }
  }

  // IMPORTANT:
  // This assumes the endpoint supports query params ?type=...&value=...
  // If NAV changes it to a form POST, you'll need to adapt here.
  const url = `${EVNY_BASE_URL}?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`
  const res = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; evny-check/1.0)' },
    validateStatus: () => true,
  })
  if (res.status >= 400) {
    throw new Error(`EVNY HTTP ${res.status}`)
  }
  return res.data
}

async function readCache(key) {
  const snap = await admin.firestore().collection('evnyCache').doc(key).get()
  if (!snap.exists) return null
  const data = snap.data()
  const ageMs = Date.now() - (data.cachedAt?.toMillis?.() || 0)
  if (ageMs > EVNY_CACHE_HOURS * 3600 * 1000) return null
  return data
}

async function writeCache(key, record) {
  const cachedAt =
    admin.firestore?.FieldValue?.serverTimestamp?.() ||
    admin.firestore?.Timestamp?.fromDate?.(new Date()) ||
    new Date()

  await admin.firestore().collection('evnyCache').doc(key).set({
    ...record,
    cachedAt,
  })
}

function buildEvnyApp(requireFirebaseAuthOrAppCheck, allowedOrigins) {
  const evnyApp = express()
  const rateLimited = rateLimitedFactory()

  evnyApp.use(
    cors({
      origin: allowedOrigins,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Firebase-AppCheck'],
    })
  )
  evnyApp.options('*', cors({ origin: allowedOrigins }))
  evnyApp.use(express.json())
  evnyApp.use(requireFirebaseAuthOrAppCheck)

  evnyApp.post('*', async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown'
    if (rateLimited(ip)) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again soon.' })
      return
    }

    const { type, value, clientId } = req.body || {}
    const normType = String(type || '').toUpperCase()
    const normValue = String(value || '').trim()

    if (!normValue || !['TORZSSZAM', 'NYILVANTARTASI_SZAM'].includes(normType)) {
      res.status(400).json({ error: 'Invalid type or value.' })
      return
    }

    const cacheKey = `${normType}_${normValue}`

    try {
      const cached = await readCache(cacheKey)
      if (cached?.parsed) {
        res.json({ ok: true, cached: true, data: cached.parsed })
        return
      }

      const html = await fetchEvny(normType, normValue)
      if (html?.error) {
        res.status(500).json({ ok: false, error: html.error })
        return
      }

      const raw = typeof html === 'string' ? html : JSON.stringify(html || {})
      const parsedCore = parseEvnyHtmlStrict(raw)

      const parsed = {
        ...parsedCore,
        hash: hashText(raw),
        fetchedAt: new Date().toISOString(),
      }


      await writeCache(cacheKey, { parsed })

      if (clientId) {
        const db = admin.firestore()
        const lookupRef = db.collection(`clients/${clientId}/evnyLookups`).doc()

        await lookupRef.set({
          query: { type: normType, value: normValue },
          parsed,
          fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        })

        await db.doc(`clients/${clientId}`).set({ evnyLastLookup: parsed }, { merge: true })
      }

      res.json({ ok: true, cached: false, data: parsed })
    } catch (err) {
      console.error('EVNY lookup error', err)
      res.status(500).json({ ok: false, error: err?.message || 'EVNY lookup failed' })
    }
  })

  return evnyApp
}

module.exports = {
  buildEvnyApp,
}
