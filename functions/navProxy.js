const express = require('express')
const axios = require('axios')
const cors = require('cors')
const crypto = require('crypto')
const { ALLOWED_ORIGINS } = require('./billingoProxy')

const NAV_BASE_URL_PROD = process.env.NAV_BASE_URL_PROD || 'https://api.onlineszamla.nav.gov.hu/invoiceService/v3'
const NAV_BASE_URL_TEST = process.env.NAV_BASE_URL_TEST || ''

const NAV_SOFTWARE = {
  softwareId: process.env.NAV_SOFTWARE_ID || '12345678ABCDEFGH12',
  softwareName: process.env.NAV_SOFTWARE_NAME || 'NAV Proxy',
  softwareOperation: process.env.NAV_SOFTWARE_OPERATION || 'LOCAL_SOFTWARE',
  softwareMainVersion: process.env.NAV_SOFTWARE_MAIN_VERSION || '1.0',
  softwareDevName: process.env.NAV_SOFTWARE_DEV_NAME || 'Your Company',
  softwareDevContact: process.env.NAV_SOFTWARE_DEV_CONTACT || 'dev@example.com',
  softwareDevCountryCode: process.env.NAV_SOFTWARE_DEV_COUNTRY || 'HU',
  softwareDevTaxNumber: process.env.NAV_SOFTWARE_DEV_TAXNO || '12345678',
}

function sha512Upper(str) {
  return crypto.createHash('sha512').update(str, 'utf8').digest('hex').toUpperCase()
}

function sha3_512Upper(str) {
  return crypto.createHash('sha3-512').update(str, 'utf8').digest('hex').toUpperCase()
}

function isoTimestamp() {
  return new Date().toISOString()
}

function maskTimestampToYYYYMMDDhhmmss(iso) {
  return iso.replace(/[-:TZ.]/g, '').slice(0, 14)
}

function makeRequestId() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ts =
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  const rnd = crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()
  return `REQ${ts}_${rnd}`
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function extractNavError(xml) {
  const errorCode = xml.match(/<errorCode>([^<]+)<\/errorCode>/)?.[1] || null
  const message = xml.match(/<message>([^<]+)<\/message>/)?.[1] || null
  const funcCode = xml.match(/<funcCode>([^<]+)<\/funcCode>/)?.[1] || null
  return { funcCode, errorCode, message }
}

function extractAvailablePage(xml) {
  const m = xml.match(/<(?:\w+:)?availablePage>(\d+)<\/(?:\w+:)?availablePage>/)
  return m ? parseInt(m[1], 10) : 1
}

function extractTagValues(xml, tagName) {
  const re = new RegExp(`<((?:\\w+:)?${tagName})>([\\s\\S]*?)<\\/\\1>`, 'g')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) out.push(m[2])
  return out
}

function resolveNavBaseUrl(env) {
  if (env === 'test') {
    if (!NAV_BASE_URL_TEST) {
      throw new Error('NAV_BASE_URL_TEST is not configured in environment variables.')
    }
    return NAV_BASE_URL_TEST
  }
  return NAV_BASE_URL_PROD
}

function buildQueryInvoiceDigestXmlUsingInsDate({ nav, invoiceDirection = 'OUTBOUND', dateFrom, dateTo, page = 1 }) {
  const requestId = makeRequestId()
  const timestampIso = isoTimestamp()
  const tsMasked = maskTimestampToYYYYMMDDhhmmss(timestampIso)

  const passwordHash = sha512Upper(nav.navOnlinePassword)
  const requestSignature = sha3_512Upper(requestId + tsMasked + nav.navOnlineSignerKey)

  return `
<QueryInvoiceDigestRequest
  xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"
  xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common"
>
  <common:header>
    <common:requestId>${requestId}</common:requestId>
    <common:timestamp>${timestampIso}</common:timestamp>
    <common:requestVersion>3.0</common:requestVersion>
    <common:headerVersion>1.0</common:headerVersion>
  </common:header>

  <common:user>
    <common:login>${nav.navOnlineUser}</common:login>
    <common:passwordHash cryptoType="SHA-512">${passwordHash}</common:passwordHash>
    <common:taxNumber>${nav.taxNumber}</common:taxNumber>
    <common:requestSignature cryptoType="SHA3-512">${requestSignature}</common:requestSignature>
  </common:user>

  <software>
    <softwareId>${NAV_SOFTWARE.softwareId}</softwareId>
    <softwareName>${NAV_SOFTWARE.softwareName}</softwareName>
    <softwareOperation>${NAV_SOFTWARE.softwareOperation}</softwareOperation>
    <softwareMainVersion>${NAV_SOFTWARE.softwareMainVersion}</softwareMainVersion>
    <softwareDevName>${NAV_SOFTWARE.softwareDevName}</softwareDevName>
    <softwareDevContact>${NAV_SOFTWARE.softwareDevContact}</softwareDevContact>
    <softwareDevCountryCode>${NAV_SOFTWARE.softwareDevCountryCode}</softwareDevCountryCode>
    <softwareDevTaxNumber>${NAV_SOFTWARE.softwareDevTaxNumber}</softwareDevTaxNumber>
  </software>

  <page>${page}</page>
  <invoiceDirection>${invoiceDirection}</invoiceDirection>

  <invoiceQueryParams>
    <mandatoryQueryParams>
      <insDate>
        <dateTimeFrom>${dateFrom}T00:00:00.000Z</dateTimeFrom>
        <dateTimeTo>${dateTo}T23:59:59.999Z</dateTimeTo>
      </insDate>
    </mandatoryQueryParams>
  </invoiceQueryParams>
</QueryInvoiceDigestRequest>
`.trim()
}

function buildTokenExchangeXml({ nav }) {
  const requestId = makeRequestId()
  const timestampIso = isoTimestamp()
  const tsMasked = maskTimestampToYYYYMMDDhhmmss(timestampIso)

  const passwordHash = sha512Upper(nav.navOnlinePassword)
  const requestSignature = sha3_512Upper(requestId + tsMasked + nav.navOnlineSignerKey)

  return `
<TokenExchangeRequest
  xmlns="http://schemas.nav.gov.hu/OSA/3.0/api"
  xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common"
>
  <common:header>
    <common:requestId>${requestId}</common:requestId>
    <common:timestamp>${timestampIso}</common:timestamp>
    <common:requestVersion>3.0</common:requestVersion>
    <common:headerVersion>1.0</common:headerVersion>
  </common:header>

  <common:user>
    <common:login>${nav.navOnlineUser}</common:login>
    <common:passwordHash cryptoType="SHA-512">${passwordHash}</common:passwordHash>
    <common:taxNumber>${nav.taxNumber}</common:taxNumber>
    <common:requestSignature cryptoType="SHA3-512">${requestSignature}</common:requestSignature>
  </common:user>

  <software>
    <softwareId>${NAV_SOFTWARE.softwareId}</softwareId>
    <softwareName>${NAV_SOFTWARE.softwareName}</softwareName>
    <softwareOperation>${NAV_SOFTWARE.softwareOperation}</softwareOperation>
    <softwareMainVersion>${NAV_SOFTWARE.softwareMainVersion}</softwareMainVersion>
    <softwareDevName>${NAV_SOFTWARE.softwareDevName}</softwareDevName>
    <softwareDevContact>${NAV_SOFTWARE.softwareDevContact}</softwareDevContact>
    <softwareDevCountryCode>${NAV_SOFTWARE.softwareDevCountryCode}</softwareDevCountryCode>
    <softwareDevTaxNumber>${NAV_SOFTWARE.softwareDevTaxNumber}</softwareDevTaxNumber>
  </software>
</TokenExchangeRequest>
`.trim()
}

async function navPostXml(baseUrl, path, xml) {
  const url = `${baseUrl}${path}`
  const response = await axios({
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'application/xml; charset=UTF-8',
      Accept: 'application/xml',
      'User-Agent': 'Mozilla/5.0 (compatible; Firebase-Cloud-Functions/1.0)',
    },
    data: xml,
    timeout: 30000,
    validateStatus: () => true,
  })
  return response
}

function buildNavApp(requireFirebaseAuthOrAppCheck) {
  const navApp = express()

  navApp.use(
    cors({
      origin: ALLOWED_ORIGINS,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Firebase-AppCheck'],
    })
  )
  navApp.options('*', cors({ origin: ALLOWED_ORIGINS }))
  navApp.use(express.json())
  navApp.use(requireFirebaseAuthOrAppCheck)

  navApp.use((req, _res, next) => {
    console.log('[nav]', req.method, req.originalUrl)
    next()
  })

  navApp.post('/test-connection', async (req, res) => {
    try {
      const nav = req.body?.nav || {}
      const env = (req.body?.env || 'prod').toLowerCase()

      if (!nav.navOnlineUser || !nav.navOnlinePassword || !nav.navOnlineSignerKey) {
        res.status(400).json({
          ok: false,
          errorCode: 'MISSING_FIELDS',
          message: 'Hiányzó NAV adatok: felhasználónév, jelszó, aláírókulcs kötelező.',
        })
        return
      }
      if (!nav.taxNumber || !/^\d{8}$/.test(String(nav.taxNumber))) {
        res.status(400).json({
          ok: false,
          errorCode: 'INVALID_TAXNUMBER',
          message: 'A taxNumber mezőnek pontosan 8 számjegynek kell lennie (adószám első 8 jegye).',
        })
        return
      }

      const baseUrl = resolveNavBaseUrl(env)
      const today = new Date().toISOString().slice(0, 10)
      const twoDaysAgo = addDays(today, -2)

      const checks = {
        query: { ok: false },
        tokenExchange: { ok: null },
      }

      const directions = ['OUTBOUND', 'INBOUND']
      let queryOk = false
      let lastQueryErr = null

      for (const dir of directions) {
        const xml = buildQueryInvoiceDigestXmlUsingInsDate({
          nav,
          invoiceDirection: dir,
          dateFrom: twoDaysAgo,
          dateTo: today,
          page: 1,
        })

        const r = await navPostXml(baseUrl, '/queryInvoiceDigest', xml)

        if (r.status === 200) {
          checks.query = { ok: true, direction: dir }
          queryOk = true
          break
        } else {
          const err = extractNavError(typeof r.data === 'string' ? r.data : JSON.stringify(r.data))
          lastQueryErr = { status: r.status, ...err, direction: dir }
        }
      }

      if (!queryOk) {
        res.status(200).json({
          ok: false,
          errorCode: lastQueryErr?.errorCode || 'NAV_QUERY_TEST_FAILED',
          message: lastQueryErr?.message || 'NAV lekérdezési teszt sikertelen.',
          details: lastQueryErr,
          checks,
        })
        return
      }

      if (nav.navOnlineExchangeKey) {
        try {
          const tokenXml = buildTokenExchangeXml({ nav })
          const tr = await navPostXml(baseUrl, '/tokenExchange', tokenXml)

          if (tr.status === 200) {
            checks.tokenExchange = { ok: true }
          } else {
            const err = extractNavError(typeof tr.data === 'string' ? tr.data : JSON.stringify(tr.data))
            checks.tokenExchange = { ok: false, status: tr.status, ...err }
          }
        } catch (e) {
          checks.tokenExchange = { ok: false, message: e.message || 'TokenExchange teszt hiba.' }
        }
      }

      res.status(200).json({
        ok: true,
        checks,
      })
    } catch (err) {
      console.error('[nav] test-connection error:', err?.message || err)
      res.status(500).json({
        ok: false,
        errorCode: 'NAV_PROXY_ERROR',
        message: err?.message || 'NAV proxy hiba',
      })
    }
  })

  navApp.post('/list-invoices', async (req, res) => {
    try {
      const nav = req.body?.nav || {}
      const env = (req.body?.env || 'prod').toLowerCase()
      const invoiceDirection = (req.body?.direction || 'OUTBOUND').toUpperCase()
      const dateFrom = req.body?.dateFrom
      const dateTo = req.body?.dateTo

      if (!nav.navOnlineUser || !nav.navOnlinePassword || !nav.navOnlineSignerKey) {
        res.status(400).json({
          ok: false,
          errorCode: 'MISSING_FIELDS',
          message: 'Hiányzó NAV adatok: felhasználónév, jelszó, aláírókulcs kötelező.',
        })
        return
      }
      if (!nav.taxNumber || !/^\d{8}$/.test(String(nav.taxNumber))) {
        res.status(400).json({
          ok: false,
          errorCode: 'INVALID_TAXNUMBER',
          message: 'A taxNumber mezőnek pontosan 8 számjegynek kell lennie (adószám első 8 jegye).',
        })
        return
      }
      if (!dateFrom || !dateTo) {
        res.status(400).json({
          ok: false,
          errorCode: 'MISSING_DATES',
          message: 'dateFrom és dateTo kötelező.',
        })
        return
      }

      const baseUrl = resolveNavBaseUrl(env)

      const invoices = []
      let page = 1
      let availablePage = 1

      while (page <= availablePage) {
        const xml = buildQueryInvoiceDigestXmlUsingInsDate({
          nav,
          invoiceDirection,
          dateFrom,
          dateTo,
          page,
        })

        const r = await navPostXml(baseUrl, '/queryInvoiceDigest', xml)
        const xmlBody = typeof r.data === 'string' ? r.data : JSON.stringify(r.data)

        if (page === 1) {
          availablePage = extractAvailablePage(xmlBody)
        }

        if (r.status !== 200) {
          const err = extractNavError(xmlBody)
          res.status(200).json({
            ok: false,
            errorCode: err?.errorCode || 'NAV_QUERY_FAILED',
            message: err?.message || `NAV hiba (HTTP ${r.status})`,
            details: { status: r.status, ...err },
          })
          return
        }

        const invoiceNumbers = extractTagValues(xmlBody, 'invoiceNumber')
        const issueDates = extractTagValues(xmlBody, 'invoiceIssueDate')
        const customerTaxNumbers = extractTagValues(xmlBody, 'customerTaxNumber')
        const supplierTaxNumbers = extractTagValues(xmlBody, 'supplierTaxNumber')
        const grossAmounts = extractTagValues(xmlBody, 'invoiceGrossAmountHUF')
        const currencies = extractTagValues(xmlBody, 'invoiceCurrency')

        invoiceNumbers.forEach((num, idx) => {
          invoices.push({
            invoiceNumber: num,
            invoiceIssueDate: issueDates[idx] || null,
            customerTaxNumber: customerTaxNumbers[idx] || null,
            supplierTaxNumber: supplierTaxNumbers[idx] || null,
            grossAmountHUF: Number(grossAmounts[idx]) || null,
            currency: currencies[idx] || 'HUF',
            direction: invoiceDirection,
          })
        })

        page += 1
      }

      res.status(200).json({ ok: true, invoices })
    } catch (err) {
      console.error('[nav] list-invoices error:', err?.message || err)
      res.status(500).json({
        ok: false,
        errorCode: 'NAV_PROXY_ERROR',
        message: err?.message || 'NAV proxy hiba',
      })
    }
  })

  return navApp
}

module.exports = {
  buildNavApp,
}
