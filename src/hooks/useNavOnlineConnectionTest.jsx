import { useCallback, useMemo, useRef, useState } from 'react'

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

export function useNavOnlineConnectionTest({ client, endpoint = '/navProxy/test-connection' }) {
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
