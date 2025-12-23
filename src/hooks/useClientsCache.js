import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'

let cachedClients = []
let cachedError = ''
let ready = false
let unsubscribe = null
const listeners = new Set()

const notify = () => {
  listeners.forEach((fn) => fn({ clients: cachedClients, error: cachedError, ready }))
}

function ensureSubscription() {
  if (unsubscribe) return
  const q = query(collection(db, 'clients'), orderBy('nev', 'asc'))
  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      cachedClients = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      cachedError = ''
      ready = true
      notify()
    },
    (err) => {
      cachedError = err.message || 'Firestore hiba.'
      ready = true
      notify()
    }
  )
}

export function useClientsCache() {
  const [state, setState] = useState({
    clients: cachedClients,
    error: cachedError,
    ready,
  })

  useEffect(() => {
    ensureSubscription()
    listeners.add(setState)
    return () => {
      listeners.delete(setState)
      // Keep subscription alive across navigations to avoid re-reads; no unsubscribe here.
    }
  }, [])

  return {
    clients: state.clients,
    error: state.error,
    loading: !state.ready,
  }
}
