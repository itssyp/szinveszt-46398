import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

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