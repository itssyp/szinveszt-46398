import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDocumentPayments, listDocumentsByStatus, getBillingoStatuses } from '../services/billingoClient'
import { addToDebtMap, extractPartnerFromDoc, formatAmount, toNumber } from '../utils/debtMapping'
import { persistDebtsToClients } from '../services/debtPersistence'

// Debug knobs (kept exportable for quick tuning)
export const DEBUG_LIMIT_PARTNERS = null // set null to show all partners
export const DEBUG_LIMIT_DOCS_PER_STATUS = null // cap downloaded docs per status in dev; null = no cap
export const CONCURRENCY_PAYMENTS = 6 // payment history calls for partially_paid docs

const STATUSES = getBillingoStatuses()

export { formatAmount }

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

        const limitedDocs =
          DEBUG_LIMIT_DOCS_PER_STATUS && docs.length > DEBUG_LIMIT_DOCS_PER_STATUS
            ? docs.slice(0, DEBUG_LIMIT_DOCS_PER_STATUS)
            : docs

        docsByStatus[status] = limitedDocs
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
