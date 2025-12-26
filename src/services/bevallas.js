import { httpsCallable } from 'firebase/functions'
import { doc, onSnapshot } from 'firebase/firestore'
import { db, functions } from '../firebase'

export async function generateBevallas58({ period, clientIds }) {
  const callable = httpsCallable(functions, 'generateBevallas58')
  const res = await callable({ period, clientIds })
  return res.data
}

export async function fetchBevallasJob(jobId) {
  const callable = httpsCallable(functions, 'getBevallasJob')
  const res = await callable({ jobId })
  return res.data
}

export function subscribeBevallasJob(jobId, onData, onError) {
  if (!jobId) return () => {}
  const ref = doc(db, 'bevallasJobs', jobId)
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      onData({ id: snap.id, ...snap.data() })
    }
  }, onError)
}
