import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'

// Debug knobs (kept exportable for quick tuning)
export const DEBUG_LIMIT_PARTNERS = null // set null to show all partners
export const DEBUG_LIMIT_DOCS_PER_STATUS = null // cap downloaded docs per status in dev; null = no cap
export const CONCURRENCY_PAYMENTS = 6 // payment history calls for partially_paid docs

const STATUSES = ['expired']
const PER_PAGE = 100

// Proxy base
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'szinveszt-46398'
const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west3'
const EMULATOR_HOST = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || 'http://127.0.0.1:5001'

const defaultFunctionsBase = import.meta.env.DEV
  ? `${EMULATOR_HOST}/${PROJECT_ID}/${FUNCTIONS_REGION}/billingoProxy`
  : `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/billingoProxy`

const API_BASE = (import.meta.env.VITE_BILLINGO_BASE_URL || defaultFunctionsBase).replace(/\/$/, '')

const buildUrl = (endpoint) => {
  const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '')
  return API_BASE.startsWith('http')
    ? new URL(`${API_BASE}/${cleanEndpoint}`)
    : new URL(`${API_BASE}/${cleanEndpoint}`, window.location.origin)
}

const toNumber = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

const normalizeTaxcode = (value) => (value || '').toString().replace(/\D/g, '')
const normalizeEmail = (value) => (value || '').toString().trim().toLowerCase()

export const formatAmount = (value) => `${Math.round(toNumber(value)).toLocaleString('en-US')} Ft`

const getLastPage = (payload) => Number(payload?.last_page ?? 1) || 1

async function billingFetch(endpoint, params = {}, signal) {
  const url = buildUrl(endpoint)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v)
  })

  const res = await fetch(url.toString(), { signal })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `Billingo válasz: ${res.status}`)
  return JSON.parse(text)
}

async function listDocumentsByStatus(payment_status, signal, onPage) {
  let page = 1
  let lastPage = 1
  let out = []

  while (page <= lastPage) {
    const data = await billingFetch(
      'documents',
      {
        page,
        per_page: PER_PAGE,
        type: 'invoice',
        payment_status,
      },
      signal
    )

    const items = data?.data || []
    out.push(...items)

    onPage?.({
      status: payment_status,
      page,
      lastPage: getLastPage(data),
      got: items.length,
      totalSoFar: out.length,
    })

    lastPage = getLastPage(data)
    page++

    if (DEBUG_LIMIT_DOCS_PER_STATUS && out.length >= DEBUG_LIMIT_DOCS_PER_STATUS) {
      out = out.slice(0, DEBUG_LIMIT_DOCS_PER_STATUS)
      break
    }
  }

  return out
}

async function getDocumentPayments(documentId, signal) {
  const data = await billingFetch(`documents/${documentId}/payments`, {}, signal)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

function extractPartnerFromDoc(doc) {
  const p = doc?.document_partner || doc?.partner || null
  if (!p?.id) return null
  const emails = Array.isArray(p.emails) ? p.emails : []
  return {
    id: p.id,
    name: p.name || '',
    email: emails[0] || '',
    taxcode: p.taxcode || p.tax_code || '',
  }
}

function addToDebtMap(map, partner, amount, invoiceCountInc = 1) {
  if (!partner?.id) return
  const prev = map.get(partner.id) || {
    id: partner.id,
    name: partner.name || '',
    email: partner.email || '',
    taxcode: partner.taxcode || '',
    debt: 0,
    invoiceCount: 0,
  }

  map.set(partner.id, {
    ...prev,
    email: prev.email || partner.email || '',
    name: prev.name || partner.name || '',
    taxcode: prev.taxcode || partner.taxcode || '',
    debt: toNumber(prev.debt) + toNumber(amount),
    invoiceCount: (prev.invoiceCount || 0) + invoiceCountInc,
  })
}

async function persistDebtsToClients({ debts, runIdRef, runId }) {
  if (runIdRef.current !== runId) return 0
  try {
    const snap = await getDocs(collection(db, 'clients'))
    const byTax = new Map()
    const byEmail = new Map()

    snap.forEach((docSnap) => {
      const tax = normalizeTaxcode(docSnap.data()?.adoszam)
      if (tax) byTax.set(tax, docSnap.ref)
      const email = normalizeEmail(docSnap.data()?.email)
      if (email) byEmail.set(email, docSnap.ref)
    })

    const now = new Date()
    const MAX_PER_BATCH = 450
    let batch = writeBatch(db)
    let batchCount = 0
    let totalUpdates = 0
    const commits = []

    debts.forEach((row) => {
      if (runIdRef.current !== runId) return
      const tax = normalizeTaxcode(row.taxcode)
      const email = normalizeEmail(row.email)
      const ref = (tax && byTax.get(tax)) || (email && byEmail.get(email))
      if (!ref) return

      batch.update(ref, {
        billingoDebt: toNumber(row.debt),
        billingoDebtInvoices: row.invoiceCount || 0,
        billingoDebtPartnerId: row.id || '',
        billingoDebtUpdatedAt: now,
      })

      batchCount++
      totalUpdates++

      if (batchCount >= MAX_PER_BATCH) {
        commits.push(batch.commit())
        batch = writeBatch(db)
        batchCount = 0
      }
    })

    if (batchCount > 0) commits.push(batch.commit())
    if (commits.length) await Promise.all(commits)
    return totalUpdates
  } catch (_e) {
    // Persistence is best-effort; don't fail the UI if caching fails.
    return 0
  }
}

export function useDebtsData({ autoLoad = true } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [progress, setProgress] = useState({
    phase: 'idle',
    note: '',
    docsByStatus: { expired: 0, outstanding: 0, partially_paid: 0 },
    paymentsDone: 0,
    paymentsTotal: 0,
  })

  const runIdRef = useRef(0)
  const abortRef = useRef(null)
  const hasAutoLoadedRef = useRef(false)

  useEffect(() => () => abortRef.current?.abort?.(), [])

  const loadDebts = useCallback(async () => {
    const myRunId = ++runIdRef.current

    abortRef.current?.abort?.()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError('')
    setRows([])
    setLastUpdated(null)
    setProgress({
      phase: 'documents',
      note: 'Dokumentumok letöltése...',
      docsByStatus: { expired: 0, outstanding: 0, partially_paid: 0 },
      paymentsDone: 0,
      paymentsTotal: 0,
    })

    try {
      const docsByStatus = {}

      for (const status of STATUSES) {
        if (runIdRef.current !== myRunId) return

        const docs = await listDocumentsByStatus(
          status,
          controller.signal,
          ({ status: s, totalSoFar }) => {
            if (runIdRef.current !== myRunId) return
            setProgress((p) => ({
              ...p,
              phase: 'documents',
              note: `Dokumentumok letöltése... (${s}: ${totalSoFar})`,
              docsByStatus: { ...p.docsByStatus, [s]: totalSoFar },
            }))
          }
        )

        docsByStatus[status] = docs
      }

      if (runIdRef.current !== myRunId) return

      const debtMap = new Map()

      for (const status of ['expired', 'outstanding']) {
        const docs = docsByStatus[status] || []
        for (const doc of docs) {
          const partner = extractPartnerFromDoc(doc)
          if (!partner) continue
          addToDebtMap(debtMap, partner, doc?.gross_total, 1)
        }
      }

      const partialDocs = docsByStatus.partially_paid || []
      setProgress((p) => ({
        ...p,
        phase: 'payments',
        note: 'Részben fizetett számlák feldolgozása...',
        paymentsDone: 0,
        paymentsTotal: partialDocs.length,
      }))

      let next = 0
      let paymentsDoneLocal = 0

      const worker = async () => {
        while (true) {
          const i = next++
          if (i >= partialDocs.length) return
          if (runIdRef.current !== myRunId) return

          const doc = partialDocs[i]
          const partner = extractPartnerFromDoc(doc)
          if (!partner) {
            paymentsDoneLocal++
            if (runIdRef.current === myRunId) {
              setProgress((p) => ({ ...p, paymentsDone: paymentsDoneLocal }))
            }
            continue
          }

          const gross = toNumber(doc?.gross_total)
          let paidSum = 0

          try {
            const payments = await getDocumentPayments(doc.id, controller.signal)
            paidSum = payments.reduce((s, pay) => s + toNumber(pay?.price), 0)
          } catch (_e) {
            paidSum = 0
          }

          const remaining = Math.max(0, gross - paidSum)
          if (remaining > 0) addToDebtMap(debtMap, partner, remaining, 1)

          paymentsDoneLocal++
          if (runIdRef.current === myRunId) {
            setProgress((p) => ({
              ...p,
              paymentsDone: paymentsDoneLocal,
              note: `Részben fizetett számlák feldolgozása... (${paymentsDoneLocal}/${partialDocs.length})`,
            }))
          }
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY_PAYMENTS }, () => worker()))
      if (runIdRef.current !== myRunId) return

      const allRows = Array.from(debtMap.values())
        .filter((r) => toNumber(r.debt) > 0)
        .sort((a, b) => toNumber(b.debt) - toNumber(a.debt))

      const finalRows = DEBUG_LIMIT_PARTNERS ? allRows.slice(0, DEBUG_LIMIT_PARTNERS) : allRows

      setRows(finalRows)
      setLastUpdated(new Date())
      await persistDebtsToClients({ debts: allRows, runIdRef, runId: myRunId })
      setProgress((p) => ({ ...p, phase: 'done', note: 'Kész.' }))
    } catch (e) {
      if (e?.name === 'AbortError') return
      if (runIdRef.current === myRunId) setError(e?.message || 'Nem sikerült lekérni a Billingo adatokat.')
      setProgress((p) => ({ ...p, phase: 'error', note: 'Hiba.' }))
    } finally {
      if (runIdRef.current === myRunId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!autoLoad) return undefined
    if (hasAutoLoadedRef.current) return undefined
    hasAutoLoadedRef.current = true
    loadDebts()
  }, [autoLoad, loadDebts])

  const totalDebt = useMemo(() => rows.reduce((sum, r) => sum + toNumber(r.debt), 0), [rows])

  return {
    rows,
    loading,
    error,
    progress,
    lastUpdated,
    loadDebts,
    totalDebt,
  }
}

export default useDebtsData
