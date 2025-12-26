const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'szinveszt-46398'
const region = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west3'
const functionsEmulatorHost = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001'

const defaultBase = (() => {
  if (import.meta.env.VITE_EVNY_LOOKUP_URL) return import.meta.env.VITE_EVNY_LOOKUP_URL
  if (import.meta.env.DEV && functionsEmulatorHost) {
    const host = functionsEmulatorHost.startsWith('http') ? functionsEmulatorHost : `http://${functionsEmulatorHost}`
    return `${host}/${projectId}/${region}/evnyLookup`
  }
  return `https://${region}-${projectId}.cloudfunctions.net/evnyLookup`
})()

export async function evnyLookup({ type, value, clientId }) {
  const normType = String(type || '').toUpperCase()
  const body = { type: normType, value, clientId }
  const res = await fetch(defaultBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || 'EVNY lekérdezés hiba')
  }
  return data?.data || null
}
