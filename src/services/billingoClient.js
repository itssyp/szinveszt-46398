import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase'

const STATUSES = ['expired', 'partially_paid']
const PER_PAGE = 100
const REQUEST_GAP_MS = 220
const MAX_RETRIES = 4
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const DEFAULT_RETRY_MS = 1200

// Proxy base
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'szinveszt-46398'
const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west3'
const EMULATOR_HOST = import.meta.env.VITE_FUNCTIONS_EMULATOR_HOST || 'http://127.0.0.1:5001'

const defaultFunctionsBase = import.meta.env.DEV
  ? `${EMULATOR_HOST}/${PROJECT_ID}/${FUNCTIONS_REGION}/billingoProxy`
  : `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/billingoProxy`

const API_BASE = (import.meta.env.VITE_BILLINGO_BASE_URL || defaultFunctionsBase).replace(/\/$/, '')
let requestTurn = Promise.resolve()
let nextRequestAt = 0

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

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener?.('abort', onAbort, { once: true })
  })
}

async function awaitRequestSlot(signal) {
  let release = () => {}
  const previousTurn = requestTurn.catch(() => {})
  requestTurn = new Promise((resolve) => {
    release = resolve
  })

  await previousTurn
  try {
    const delay = Math.max(0, nextRequestAt - Date.now())
    await sleep(delay, signal)
    nextRequestAt = Date.now() + REQUEST_GAP_MS
  } finally {
    release()
  }
}

function getRetryDelayMs(res, attempt) {
  const retryAfterHeader = res.headers.get('retry-after')
  const retryAfterSeconds = Number(retryAfterHeader)
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000
  }
  return DEFAULT_RETRY_MS * 2 ** attempt
}

export async function billingFetch(endpoint, params = {}, signal) {
  const url = buildUrl(endpoint)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, v)
  })

  const headers = await buildAuthHeaders()

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await awaitRequestSlot(signal)

    const res = await fetch(url.toString(), {
      signal,
      headers,
    })
    const text = await res.text()
    if (res.ok) return JSON.parse(text)

    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
      const delayMs = getRetryDelayMs(res, attempt)
      console.warn('[billingo] Retrying request after rate/server limit', {
        endpoint: url.pathname,
        status: res.status,
        attempt: attempt + 1,
        delayMs,
      })
      await sleep(delayMs, signal)
      continue
    }

    throw new Error(text || `Billingo válasz: ${res.status}`)
  }

  throw new Error('Billingo kérés sikertelen')
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

export async function getDocument(documentId, signal) {
  return billingFetch(`documents/${documentId}`, {}, signal)
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
