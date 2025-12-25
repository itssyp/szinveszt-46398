import { collection, getDocs, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { normalizeEmail, normalizeTaxcode, toNumber } from '../utils/debtMapping'

export async function persistDebtsToClients({ debts, runIdRef, runId }) {
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
