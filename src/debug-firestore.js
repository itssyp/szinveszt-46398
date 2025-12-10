import { firebaseApp, db } from './firebase'
import { doc, setDoc, getDoc, collection, query, limit, getDocs } from 'firebase/firestore'

function log(label, data) {
  console.log(`[DEBUG] ${label}`, data ?? '')
}

function logError(label, err) {
  console.error(`[DEBUG] ${label}`, err)
}

async function main() {
  log('start', new Date().toISOString())
  log('app', firebaseApp?.name)
  log('project', import.meta.env.VITE_FIREBASE_PROJECT_ID)
  log('location', window.location.href)

  try {
    const testRef = doc(db, 'clients', 'debug-check')
    log('write:start', 'clients/debug-check')
    const writePromise = setDoc(testRef, { ping: Date.now() }, { merge: true })
    await Promise.race([
      writePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('write timed out (5s)')), 15000)),
    ])
    const snap = await getDoc(testRef)
    log('write:ok', { exists: snap.exists(), data: snap.data() })
  } catch (err) {
    logError('write/read failed', err)
  }

  try {
    const q = query(collection(db, 'clients'), limit(5))
    log('list:start', 'clients first 5')
    const snap = await getDocs(q)
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    log('list:ok', { count: docs.length, docs })
  } catch (err) {
    logError('list failed', err)
  }
}

main().catch((err) => logError('unexpected', err))
