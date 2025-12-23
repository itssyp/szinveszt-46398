import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'

export async function logClientActivity({ clientId, type, message, meta = {}, actor = 'Rendszer' }) {
  if (!clientId) return
  try {
    await addDoc(collection(db, 'clientActivities'), {
      clientId,
      type,
      message,
      meta,
      actor,
      createdAt: serverTimestamp(),
    })
  } catch (_e) {
    // best-effort; ignore logging failures
  }
}

