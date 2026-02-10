import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

let cachedClients = []
let cachedError = ''
let ready = false
let unsubscribe = null
const listeners = new Set()
let seedInFlight = null

const DEV_PERSIST_DUMMY =
  import.meta.env.DEV && String(import.meta.env.VITE_DEV_PERSIST_DUMMY_DATA || 'true') !== 'false'
const DEV_CLIENTS_SNAPSHOT_KEY = 'dev.clients.snapshot.v1'

const notify = () => {
  listeners.forEach((fn) => fn({ clients: cachedClients, error: cachedError, ready }))
}

const readDevSnapshot = () => {
  if (!DEV_PERSIST_DUMMY) return []
  try {
    const raw = localStorage.getItem(DEV_CLIENTS_SNAPSHOT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) => item && typeof item === 'object' && item.id)
      .map((item) => ({ ...item }))
  } catch (_err) {
    return []
  }
}

const writeDevSnapshot = (clients) => {
  if (!DEV_PERSIST_DUMMY) return
  try {
    localStorage.setItem(DEV_CLIENTS_SNAPSHOT_KEY, JSON.stringify(clients))
  } catch (_err) {
    // ignore localStorage errors in dev tooling path
  }
}

async function seedClientsFromDevSnapshot(snapshotClients) {
  if (!DEV_PERSIST_DUMMY || !snapshotClients.length) return false
  if (seedInFlight) return seedInFlight

  seedInFlight = (async () => {
    for (const item of snapshotClients) {
      const { id, ...payload } = item
      if (!id) continue
      await setDoc(doc(db, 'clients', id), payload, { merge: true })
    }
    return true
  })()

  try {
    return await seedInFlight
  } finally {
    seedInFlight = null
  }
}

function ensureSubscription() {
  if (unsubscribe) return
  const q = query(collection(db, 'clients'), orderBy('nev', 'asc'))
  unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      cachedClients = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))

      let nextError = ''

      if (cachedClients.length) {
        writeDevSnapshot(cachedClients)
      } else if (DEV_PERSIST_DUMMY) {
        const stored = readDevSnapshot()
        if (stored.length) {
          try {
            await seedClientsFromDevSnapshot(stored)
          } catch (seedErr) {
            nextError = seedErr.message || 'Dev snapshot seeding failed.'
          }
        }
      }

      cachedError = nextError
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
