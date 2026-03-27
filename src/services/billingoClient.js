import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase'

const STATUSES = ['expired', 'partially_paid']
const PER_PAGE = 100

// Proxy base
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'szinveszt-46398'
const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west3'
const EMULATOR_HOST = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || 'http://127.0.0.1:5001'

const defaultFunctionsBase = import.meta.env.DEV
  ? `${EMULATOR_HOST}/${PROJECT_ID}/${FUNCTIONS_REGION}/billingoProxy`
  : `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/billingoProxy`

const API_BASE = (import.meta.env.VITE_BILLINGO_BASE_URL || defaultFunctionsBase).replace(/\/$/, '')

const buildUrl = (endpoint) => {
  const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '')
  return API_BASE.startsWith('http')
    ? new URL(`${API_BASE}/${cleanEndpoint}`)
    : new URL(`${API_BASE}/${cleanEndpoint}`, window.location.origin)
}

async function buildAuthHeaders() {
  const auth = getAuth(firebaseApp)
  const user = auth.currentUser
  if (!user) {
    throw new Error('Nincs bejelentkezve')
  }
  const idToken = await user.getIdToken()
  return {
    Authorization: `Bearer ${idToken}`,
  }
}

export async function billingFetch(endpoint, params = {}, signal) {
  const url = buildUrl(endpoint)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v)
  })

  const headers = await buildAuthHeaders()

  const res = await fetch(url.toString(), {
    signal,
    headers,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(text || `Billingo válasz: ${res.status}`)
  return JSON.parse(text)
}

export async function listDocumentsByStatus(paymentStatus, signal, onPage) {
  let page = 1
  let lastPage = 1
  let out = []

  while (page <= lastPage) {
    const data = await billingFetch(
      'documents',
      {
        page,
        per_page: PER_PAGE,
        type: 'invoice',
        payment_status: paymentStatus,
      },
      signal
    )

    const items = data?.data || []
    out.push(...items)

    onPage?.({
      status: paymentStatus,
      page,
      lastPage: Number(data?.last_page ?? 1) || 1,
      got: items.length,
      totalSoFar: out.length,
    })

    lastPage = Number(data?.last_page ?? 1) || 1
    page++
  }

  return out
}

export async function getDocumentPayments(documentId, signal) {
  const data = await billingFetch(`documents/${documentId}/payments`, {}, signal)
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.data)) return data.data
  return []
}

export function getBillingoStatuses() {
  return STATUSES
}

export const BILLINGO_PAGE_SIZE = PER_PAGE
