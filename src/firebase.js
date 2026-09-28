import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { functionsRegion, useFirebaseEmulators } from './config/firebaseTargets'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

function assertFirebaseConfig(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length) {
    throw new Error(
      `Missing Firebase configuration values: ${missing.join(
        ', '
      )}. Set the VITE_FIREBASE_* environment variables.`
    )
  }
}

export function createFirebaseApp() {
  if (!getApps().length) {
    assertFirebaseConfig(firebaseConfig)
    return initializeApp(firebaseConfig)
  }

  return getApps()[0]
}

export const firebaseApp = createFirebaseApp()
export const db = getFirestore(firebaseApp)
export const storage = getStorage(firebaseApp)
// Use the deployed region to avoid defaulting to us-central1.
export const functions = getFunctions(firebaseApp, functionsRegion)

if (useFirebaseEmulators) {
  const host = import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1'
  const port = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080)
  try {
    connectFirestoreEmulator(db, host, port)
    // eslint-disable-next-line no-console
    console.info(`Firestore emulator connected at ${host}:${port}`)
  } catch (_e) {
    // ignore emulator connection errors to avoid breaking prod builds
  }

  const fnHost = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || host
  const fnPort = Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)
  try {
    connectFunctionsEmulator(functions, fnHost, fnPort)
    // eslint-disable-next-line no-console
    console.info(`Functions emulator connected at ${fnHost}:${fnPort}`)
  } catch (_e) {
    // ignore emulator connection errors to avoid breaking prod builds
  }

  try {
    const storagePort = Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 9199)
    connectStorageEmulator(storage, host, storagePort)
    // eslint-disable-next-line no-console
    console.info(`Storage emulator connected at ${host}:${storagePort}`)
  } catch (_e) {
    // ignore emulator connection errors to avoid breaking prod builds
  }
}
