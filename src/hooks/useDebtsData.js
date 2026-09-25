import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDocument, getDocumentPayments, listDocumentsByStatus, getBillingoStatuses } from '../services/billingoClient'
import { addToDebtMap, extractPartnerFromDoc, formatAmount, toNumber } from '../utils/debtMapping'
import { persistDebtsToClients } from '../services/debtPersistence'

// Debug knobs (kept exportable for quick tuning)
export const DEBUG_LIMIT_PARTNERS = null // set null to show all partners
export const DEBUG_LIMIT_DOCS_PER_STATUS = null // cap downloaded docs per status in dev; null = no cap
export const CONCURRENCY_PAYMENTS = 2 // keep Billingo detail/payment fetches under rate limits
const DEBT_EXCLUDED_DOCUMENT_MARKERS = ['2025eveszaras', '2025szjaszamla']

const STATUSES = getBillingoStatuses()

export { formatAmount }

function normalizeIsoDate(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (directMatch) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizePaymentStatus(doc) {
  return String(doc?.payment_status || doc?.paymentStatus || '')
    .trim()
    .toLowerCase()
}

function getDocumentId(doc) {
  return doc?.id ?? doc?.document_id ?? doc?.documentId ?? null
}

function dedupeDocumentsById(docs) {
  const byId = new Map()
  docs.forEach((doc) => {
    const id = getDocumentId(doc)
    if (id === null || id === undefined || id === '') return
    if (!byId.has(id)) byId.set(id, doc)
  })
  return Array.from(byId.values())
}

function getPaidAmountFallback(doc) {
  const candidates = [
    doc?.paid_amount,
    doc?.paidAmount,
    doc?.paid_total,
    doc?.paidTotal,
    doc?.payment_total,
    doc?.paymentTotal,
  ]
  return candidates.reduce((max, value) => Math.max(max, toNumber(value)), 0)
}

function getDocumentDueDate(doc) {
  return normalizeIsoDate(
    doc?.due_date || doc?.payment_deadline || doc?.deadline_date || doc?.deadline || doc?.dueDate || ''
  )
}

function normalizeCommentText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
    .trim()
}

function getDebtDocumentTextCandidates(doc) {
  const candidates = []
  collectCommentLikeStrings(doc, candidates)
  return candidates
}

function collectCommentLikeStrings(value, bucket, depth = 0, keyName = '', seen = new Set()) {
  if (value === null || value === undefined || depth > 5) return
  if (typeof value === 'string') {
    if (!keyName || /(comment|note|megjegyzes|name|title|subject|description|megnevezes)/i.test(keyName)) bucket.push(value)
    return
  }
  if (typeof value !== 'object') return
  if (seen.has(value)) return
  seen.add(value)

  if (Array.isArray(value)) {
    value.forEach((entry) => collectCommentLikeStrings(entry, bucket, depth + 1, keyName, seen))
    return
  }

  Object.entries(value).forEach(([key, entry]) => {
    collectCommentLikeStrings(entry, bucket, depth + 1, key, seen)
  })
}

function shouldIgnoreDebtDocument(doc) {
  const candidates = getDebtDocumentTextCandidates(doc)
  if (!candidates.length) return false

  return candidates.some((entry) => {
    const normalized = normalizeCommentText(entry)
    return normalized && DEBT_EXCLUDED_DOCUMENT_MARKERS.some((marker) => normalized.includes(marker))
  })
}

function getDebtDocumentExclusionMatch(doc) {
  const candidates = getDebtDocumentTextCandidates(doc)
  for (const entry of candidates) {
    const normalized = normalizeCommentText(entry)
    const marker = DEBT_EXCLUDED_DOCUMENT_MARKERS.find((value) => normalized && normalized.includes(value))
    if (marker) {
      return { marker, entry: String(entry || '').trim() }
    }
  }
  return null
}

function logDebtDocumentExclusion(doc, source) {
  const match = getDebtDocumentExclusionMatch(doc)
  if (!match) return

  const documentId = getDocumentId(doc) || 'unknown'
  const invoiceNumber = doc?.invoice_number || doc?.invoiceNumber || doc?.number || ''
  console.info('[billingo][debts] Excluding invoice from debt sync', {
    source,
    documentId,
    invoiceNumber,
    matchedMarker: match.marker,
    matchedText: match.entry,
  })
}

async function resolveDebtDocument(doc, signal, detailCache) {
  const documentId = getDocumentId(doc)
  if (!documentId) return doc

  const cached = detailCache.get(documentId)
  if (cached) return cached

  const request = (async () => {
    try {
      const detailed = await getDocument(documentId, signal)
      return detailed && typeof detailed === 'object' ? { ...doc, ...detailed } : doc
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      return doc
    }
  })()

  detailCache.set(documentId, request)
  return request
}

export function useDebtsData({ autoLoad = true } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [progress, setProgress] = useState({
    phase: 'idle',
    note: '',
    docsByStatus: { expired: 0, partially_paid: 0 },
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
      docsByStatus: { expired: 0, partially_paid: 0 },
      paymentsDone: 0,
      paymentsTotal: 0,
    })

    try {
      const docsByStatus = {}
      const documentDetailCache = new Map()

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

        const limitedDocs =
          DEBUG_LIMIT_DOCS_PER_STATUS && docs.length > DEBUG_LIMIT_DOCS_PER_STATUS
            ? docs.slice(0, DEBUG_LIMIT_DOCS_PER_STATUS)
            : docs

        docsByStatus[status] = limitedDocs
      }

      if (runIdRef.current !== myRunId) return

      const debtMap = new Map()
      const partialDocsFromAnyStatus = []

      for (const status of ['expired']) {
        const docs = docsByStatus[status] || []
        for (const doc of docs) {
          const resolvedDoc = await resolveDebtDocument(doc, controller.signal, documentDetailCache)
          if (shouldIgnoreDebtDocument(resolvedDoc)) {
            logDebtDocumentExclusion(resolvedDoc, 'expired')
            continue
          }
          const paymentStatus = normalizePaymentStatus(resolvedDoc)
          if (paymentStatus === 'partially_paid') {
            partialDocsFromAnyStatus.push(resolvedDoc)
            continue
          }

          const partner = extractPartnerFromDoc(resolvedDoc)
          if (!partner) continue
          addToDebtMap(debtMap, partner, resolvedDoc?.gross_total, 1, getDocumentDueDate(resolvedDoc))
        }
      }

      const partialDocs = dedupeDocumentsById([...(docsByStatus.partially_paid || []), ...partialDocsFromAnyStatus])
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
          const resolvedDoc = await resolveDebtDocument(doc, controller.signal, documentDetailCache)
          if (shouldIgnoreDebtDocument(resolvedDoc)) {
            logDebtDocumentExclusion(resolvedDoc, 'partially_paid')
            paymentsDoneLocal++
            if (runIdRef.current === myRunId) {
              setProgress((p) => ({ ...p, paymentsDone: paymentsDoneLocal }))
            }
            continue
          }

          const partner = extractPartnerFromDoc(resolvedDoc)
          if (!partner) {
            paymentsDoneLocal++
            if (runIdRef.current === myRunId) {
              setProgress((p) => ({ ...p, paymentsDone: paymentsDoneLocal }))
            }
            continue
          }

          const gross = toNumber(resolvedDoc?.gross_total)
          let paidSum = getPaidAmountFallback(resolvedDoc)

          try {
            const paymentDocId = getDocumentId(doc)
            if (paymentDocId) {
              const payments = await getDocumentPayments(paymentDocId, controller.signal)
              paidSum = payments.reduce((s, pay) => s + toNumber(pay?.price), 0)
            }
          } catch (_e) {
            // Fall back to document-level paid totals if payment history is unavailable.
          }

          const remaining = Math.max(0, gross - paidSum)
          if (remaining > 0) addToDebtMap(debtMap, partner, remaining, 1, getDocumentDueDate(resolvedDoc))

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
