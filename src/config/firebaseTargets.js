export const useFirebaseEmulators =
  import.meta.env.DEV && import.meta.env.MODE !== 'staging' &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false'

export const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
export const functionsRegion = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west3'

export function functionUrl(name) {
  if (useFirebaseEmulators) {
    const configuredHost = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || 'http://127.0.0.1:5001'
    const host = configuredHost.startsWith('http') ? configuredHost : `http://${configuredHost}`
    return `${host.replace(/\/$/, '')}/${firebaseProjectId}/${functionsRegion}/${name}`
  }
  return `https://${functionsRegion}-${firebaseProjectId}.cloudfunctions.net/${name}`
}
