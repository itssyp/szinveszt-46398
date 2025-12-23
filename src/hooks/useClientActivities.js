import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where, limit as fbLimit } from 'firebase/firestore'
import { db } from '../firebase'

export function useClientActivities(clientId, { limit = 50 } = {}) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(!!clientId)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clientId) return undefined
    const q = query(
      collection(db, 'clientActivities'),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'desc'),
      fbLimit(limit)
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setActivities(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'Aktivitás hiba')
        setLoading(false)
      }
    )
    return () => unsub()
  }, [clientId, limit])

  return { activities, loading, error }
}

