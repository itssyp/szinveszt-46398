import { useCallback, useMemo, useRef, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase'
import { functionUrl } from '../config/firebaseTargets'

function pickNavPayload(client) {
  return {
    // keep naming aligned with your DB fields
    navOnlineActive: !!client.navOnlineActive,
    navOnlineUser: client.navOnlineUser || '',
    navOnlinePassword: client.navOnlinePassword || '',
    navOnlineSignerKey: client.navOnlineSignerKey || '',
    navOnlineExchangeKey: client.navOnlineExchangeKey || '',
    navOnlineStartDate: client.navOnlineStartDate || null,
    taxNumber: client.adoszam || '', // optional, if you store it
  }
}

const API_BASE = (import.meta.env.VITE_NAV_PROXY_BASE_URL || functionUrl('navProxy')).replace(/\/$/, '')

const buildUrl = (endpoint) => {
  const cleanEndpoint = String(endpoint || '').replace(/^\/+/, '')
  return API_BASE.startsWith('http')
    ? new URL(`${API_BASE}/${cleanEndpoint}`)
    : new URL(`${API_BASE}/${cleanEndpoint}`, window.location.origin)
}

async function buildAuthHeaders() {
  const auth = getAuth(firebaseApp)
  const user = auth.currentUser
  if (!user) return {}
  const idToken = await user.getIdToken()
  return {
    Authorization: `Bearer ${idToken}`,
  }
}

export function useNavOnlineConnectionTest({ client, endpoint = 'test-connection' }) {
  const [status, setStatus] = useState('idle') // idle | running | success | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const payload = useMemo(() => pickNavPayload(client || {}), [client])

  const canTest = useMemo(() => {
    if (!client) return false
    if (!payload.navOnlineUser || !payload.navOnlinePassword || !payload.navOnlineSignerKey) return false
    // Exchange key is optional if you only test querying; backend decides what to test.
    return true
  }, [client, payload])

  const run = useCallback(async () => {
    if (!canTest) {
      setStatus('error')
      setError({ message: 'Hiányzó NAV adatok: felhasználónév, jelszó, aláírókulcs kötelező.' })
      setResult(null)
      return
    }

    // cancel previous run if any
    abortRef.current?.abort?.()
    const ac = new AbortController()
    abortRef.current = ac

    setStatus('running')
    setError(null)
    setResult(null)

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await buildAuthHeaders()),
      }
      const url = buildUrl(endpoint)
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers,
        signal: ac.signal,
        body: JSON.stringify({
          clientId: client.id || client.clientId || null, // optional
          nav: payload,
        }),
      })

      const text = await res.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        // backend returned non-JSON (still show it)
        data = { ok: false, message: text || `HTTP ${res.status}` }
      }

      if (!res.ok || !data?.ok) {
        setStatus('error')
        setError({
          status: res.status,
          errorCode: data?.errorCode || data?.code || 'NAV_TEST_FAILED',
          message: data?.message || 'NAV teszt sikertelen.',
          raw: data,
        })
        setResult(data)
        return
      }

      setStatus('success')
      setResult(data)
    } catch (e) {
      if (e?.name === 'AbortError') return
      setStatus('error')
      setError({ message: e?.message || 'Hálózati hiba.', raw: e })
    }
  }, [canTest, client, endpoint, payload])

  const reset = useCallback(() => {
    abortRef.current?.abort?.()
    setStatus('idle')
    setResult(null)
    setError(null)
  }, [])

  return { status, result, error, canTest, run, reset }
}
