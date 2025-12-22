// DebtsPage.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Cleaned-up “bulk documents → aggregate debt” version.
 *
 * Debt logic:
 * - expired + outstanding: sum gross_total
 * - partially_paid: remaining = gross_total - sum(payments.price) (via /documents/{id}/payments)
 */

// ------------------------- Debug knobs -------------------------
const DEBUG_LIMIT_PARTNERS = 50 // set null to show all partners
const DEBUG_LIMIT_DOCS_PER_STATUS = null // set e.g. 300 to cap downloaded docs per status in dev; null = no cap
const CONCURRENCY_PAYMENTS = 6 // payment history calls for partially_paid docs

// These are the statuses we treat as “debt sources”
const STATUSES = ['expired']
const PER_PAGE = 100

// ------------------------- Proxy base -------------------------
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

const formatAmount = (value) => `${Math.round(toNumber(value)).toLocaleString('en-US')} Ft`

// Billingo paging shape you showed: { total, per_page, current_page, last_page, data }
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

// ------------------------- Billingo pulls -------------------------

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
  // Billingo: GET /documents/{id}/payments
  // Proxy: /documents/<id>/payments
  const data = await billingFetch(`documents/${documentId}/payments`, {}, signal)
  // Sometimes this endpoint returns an array directly; sometimes wrapped.
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

// ------------------------- Aggregation -------------------------

function extractPartnerFromDoc(doc) {
  // Billingo document typically has document_partner with {id, name, emails, ...}
  // Fallback to partner if needed.
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
    // prefer keeping an existing email, but fill if missing
    email: prev.email || partner.email || '',
    name: prev.name || partner.name || '',
    taxcode: prev.taxcode || partner.taxcode || '',
    debt: toNumber(prev.debt) + toNumber(amount),
    invoiceCount: (prev.invoiceCount || 0) + invoiceCountInc,
  })
}

// ------------------------- UI Page -------------------------

export default function DebtsPage() {
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('')
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

  // StrictMode-safe run control
  const runIdRef = useRef(0)
  const abortRef = useRef(null)
  const hasAutoLoadedRef = useRef(false)

  useEffect(() => {
    return () => {
      abortRef.current?.abort?.()
    }
  }, [])

  const loadDebts = useCallback(async () => {
    const myRunId = ++runIdRef.current

    // cancel previous run
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
      // 1) Download documents (paged) for each status
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

      // 2) Aggregate expired + outstanding immediately
      const debtMap = new Map()

      for (const status of ['expired', 'outstanding']) {
        const docs = docsByStatus[status] || []
        for (const doc of docs) {
          const partner = extractPartnerFromDoc(doc)
          if (!partner) continue
          addToDebtMap(debtMap, partner, doc?.gross_total, 1)
        }
      }

      // 3) Partially paid: fetch payments to compute remaining
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
          } catch (e) {
            // Fallback: if payments fetch fails, treat as full gross (won’t miss debt, might overestimate)
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

      // 4) Convert to rows and sort
      const allRows = Array.from(debtMap.values())
        .filter((r) => toNumber(r.debt) > 0)
        .sort((a, b) => toNumber(b.debt) - toNumber(a.debt))

      const finalRows = DEBUG_LIMIT_PARTNERS ? allRows.slice(0, DEBUG_LIMIT_PARTNERS) : allRows

      setRows(finalRows)
      setLastUpdated(new Date())
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
    if (hasAutoLoadedRef.current) return
    hasAutoLoadedRef.current = true
    loadDebts()
  }, [loadDebts])

  const visibleRows = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return rows.filter((row) => {
      if (!term) return true
      const name = (row.name || '').toLowerCase()
      const idMatch = String(row.id || '').includes(term)
      const email = (row.email || '').toLowerCase()
      return name.includes(term) || idMatch || email.includes(term)
    })
  }, [rows, filter])

  const totalDebt = useMemo(() => rows.reduce((sum, r) => sum + toNumber(r.debt), 0), [rows])

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">Billingo</p>
            <h1 className="section-title">Kintlévőségek</h1>
            <p className="section-subtitle">
              Aggregálás: documents (expired + outstanding + partially_paid) → partnerenkénti összegzés.
              {DEBUG_LIMIT_PARTNERS ? ` • DEBUG: top ${DEBUG_LIMIT_PARTNERS} partner` : ''}
              {DEBUG_LIMIT_DOCS_PER_STATUS ? ` • DEBUG: max ${DEBUG_LIMIT_DOCS_PER_STATUS} doc / státusz` : ''}
            </p>
          </div>
          <div className="section-actions">
            <button className="btn ghost" onClick={loadDebts} disabled={loading}>
              {loading ? 'Frissítés...' : 'Frissítés'}
            </button>
          </div>
        </div>

        <div className="section-meta">
          <span className="pill">{rows.length} partner</span>
          <span className="pill pill-quiet">Összesen {formatAmount(totalDebt)}</span>
          {loading ? <span className="muted">{progress.note}</span> : null}
          {lastUpdated ? (
            <span className="muted">Utolsó frissítés: {lastUpdated.toLocaleString('hu-HU')}</span>
          ) : null}
        </div>

        <div className="section-meta">
          <span className="pill pill-quiet">expired docs: {progress.docsByStatus.expired}</span>
          <span className="pill pill-quiet">outstanding docs: {progress.docsByStatus.outstanding}</span>
          <span className="pill pill-quiet">partially_paid docs: {progress.docsByStatus.partially_paid}</span>
          <span className="pill pill-quiet">
            payments: {progress.paymentsDone}/{progress.paymentsTotal}
          </span>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <section className="content-grid">
        <div className="panel tickets-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Keresés</p>
              <h2>Partnerek tartozása</h2>
            </div>
            <div className="filter-bar">
              <div className="input-shell search-field">
                <input
                  type="search"
                  placeholder="Keresés név / email / partner ID alapján..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  disabled={loading}
                />
              </div>
              <span className="pill">{visibleRows.length}</span>
            </div>
          </div>

          <div className="ticket-list">
            {loading ? <p className="muted">Számítás folyamatban...</p> : null}
            {!loading && !visibleRows.length ? <p className="muted">Nincs találat.</p> : null}

            {visibleRows.map((row) => (
              <div key={row.id} className="ticket-row debt-row">
                <div className="ticket-head">
                  <div className="ticket-client">{row.name || 'Ismeretlen partner'}</div>
                  <div className="ticket-status is-open">{formatAmount(row.debt || 0)}</div>
                </div>
                <div className="ticket-meta">
                  <span className="muted">Partner ID: {row.id}</span>
                  {row.taxcode ? <span className="muted">Adószám: {row.taxcode}</span> : null}
                  {row.email ? <span className="muted">Email: {row.email}</span> : null}
                  <span className="muted">Számlák: {row.invoiceCount || 0}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>
            Tipp: Ez a megközelítés sokkal kevesebb Billingo hívás, mint partnerenként dokumentumot kérni.
            A legdrágább rész a partially_paid → payments lekérések száma.
          </div>
        </div>
      </section>
    </main>
  )
}
