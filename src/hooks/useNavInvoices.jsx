import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAuth } from 'firebase/auth'
import { firebaseApp } from '../firebase'
import { functionUrl } from '../config/firebaseTargets'

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

const pickNavPayload = (client) => ({
  navOnlineActive: !!client?.navOnlineActive,
  navOnlineUser: client?.navOnlineUser || '',
  navOnlinePassword: client?.navOnlinePassword || '',
  navOnlineSignerKey: client?.navOnlineSignerKey || '',
  navOnlineExchangeKey: client?.navOnlineExchangeKey || '',
  navOnlineStartDate: client?.navOnlineStartDate || null,
  taxNumber: client?.adoszam || '',
})

const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const minDate = (a, b) => (a <= b ? a : b)

export function useNavInvoices({
  client,
  direction = 'OUTBOUND',
  dateFrom,
  dateTo,
  enabled = false,
  endpoint = 'list-invoices',
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [invoices, setInvoices] = useState([])
  const abortRef = useRef(null)

  const payload = useMemo(() => pickNavPayload(client || {}), [client])

  const hasCreds = useMemo(() => {
    if (!client) return false
    if (!payload.navOnlineUser || !payload.navOnlinePassword || !payload.navOnlineSignerKey) return false
    return true
  }, [client, payload])

  const fetchInvoices = useCallback(async () => {
    if (!enabled) return
    if (!hasCreds) {
      setError('Hiányzó NAV adatok (felhasználónév, jelszó, aláírókulcs).')
      setInvoices([])
      return
    }

    abortRef.current?.abort?.()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError('')

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(await buildAuthHeaders()),
      }
      const url = buildUrl(endpoint)
      const collected = []

      // NAV allows max 35 days per query. Split silently for the user.
      let curFrom = dateFrom
      const finalTo = dateTo

      while (curFrom && finalTo && curFrom <= finalTo) {
        const curTo = minDate(addDays(curFrom, 34), finalTo)
        const res = await fetch(url.toString(), {
          method: 'POST',
          headers,
          signal: ac.signal,
          body: JSON.stringify({
            clientId: client?.id || client?.clientId || null,
            nav: payload,
            direction,
            dateFrom: curFrom,
            dateTo: curTo,
          }),
        })

        const text = await res.text()
        let data = null
        try {
          data = text ? JSON.parse(text) : null
        } catch (err) {
          data = { ok: false, message: text || err?.message || 'Ismeretlen hiba' }
        }

        if (!res.ok || !data?.ok) {
          setError(data?.message || `Hiba a számlák lekérdezésekor (HTTP ${res.status}).`)
          setInvoices([])
          return
        }

        collected.push(...(data.invoices || []))
        // move to next window
        curFrom = addDays(curTo, 1)
      }

      setInvoices(collected)
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError(err?.message || 'Hálózati hiba a számlák lekérdezésekor.')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }, [client?.clientId, client?.id, dateFrom, dateTo, direction, enabled, endpoint, hasCreds, payload])

  useEffect(() => {
    if (!enabled) return undefined
    fetchInvoices()
    return () => abortRef.current?.abort?.()
  }, [enabled, fetchInvoices])

  return {
    invoices,
    loading,
    error,
    hasCreds,
    refresh: fetchInvoices,
  }
}

export default useNavInvoices
