import { functionUrl } from '../config/firebaseTargets'

const defaultBase = (() => {
  if (import.meta.env.VITE_EVNY_LOOKUP_URL) return import.meta.env.VITE_EVNY_LOOKUP_URL
  return functionUrl('evnyLookup')
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
