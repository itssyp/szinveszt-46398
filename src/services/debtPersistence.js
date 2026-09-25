import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { normalizeEmail, normalizeTaxcode, toNumber } from '../utils/debtMapping'

export async function persistDebtsToClients({ debts, runIdRef, runId }) {
  if (runIdRef.current !== runId) return 0
  try {
    const snap = await getDocs(collection(db, 'clients'))
    const byTax = new Map()
    const byEmail = new Map()
    const allClientDocs = []

    snap.forEach((docSnap) => {
      allClientDocs.push(docSnap)
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
    const touchedClientIds = new Set()

    const queueUpdate = (ref, payload) => {
      batch.update(ref, payload)
      batchCount++
      totalUpdates++

      if (batchCount >= MAX_PER_BATCH) {
        commits.push(batch.commit())
        batch = writeBatch(db)
        batchCount = 0
      }
    }

    debts.forEach((row) => {
      if (runIdRef.current !== runId) return
      const tax = normalizeTaxcode(row.taxcode)
      const email = normalizeEmail(row.email)
      const ref = (tax && byTax.get(tax)) || (email && byEmail.get(email))
      if (!ref) return
      touchedClientIds.add(ref.id)

      queueUpdate(ref, {
        billingoDebt: toNumber(row.debt),
        billingoDebtInvoices: row.invoiceCount || 0,
        billingoDebtPartnerId: row.id || '',
        billingoDebtEarliestDueDate: row.earliestDueDate || '',
        billingoDebtLatestDueDate: row.latestDueDate || '',
        billingoDebtUpdatedAt: now,
      })
    })

    allClientDocs.forEach((docSnap) => {
      if (runIdRef.current !== runId) return
      if (touchedClientIds.has(docSnap.id)) return

      const data = docSnap.data() || {}
      const hasPersistedDebtState =
        toNumber(data.billingoDebt) > 0 ||
        toNumber(data.billingoDebtInvoices) > 0 ||
        Boolean(data.billingoDebtPartnerId) ||
        Boolean(data.billingoDebtEarliestDueDate) ||
        Boolean(data.billingoDebtLatestDueDate) ||
        Boolean(data.billingoDebtUpdatedAt)

      if (!hasPersistedDebtState) return

      queueUpdate(docSnap.ref, {
        billingoDebt: 0,
        billingoDebtInvoices: 0,
        billingoDebtPartnerId: '',
        billingoDebtEarliestDueDate: '',
        billingoDebtLatestDueDate: '',
        billingoDebtUpdatedAt: now,
      })
    })

    if (batchCount > 0) commits.push(batch.commit())
    if (commits.length) await Promise.all(commits)
    return totalUpdates
  } catch (_e) {
    // Persistence is best-effort; don't fail the UI if caching fails.
    return 0
  }
}
