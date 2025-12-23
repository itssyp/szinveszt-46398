import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Subscribe to a Firestore collection (or query) and return { data, error }.
 * buildQuery receives the collection ref and should return either the same ref or a Query.
 */
function useCollectionSubscription(path, buildQuery) {
  const [data, setData] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const collRef = collection(db, path)
    // Keep buildQuery out of deps to avoid infinite re-subscribing when inline functions are passed.
    const q = typeof buildQuery === 'function' ? buildQuery(collRef) : collRef

    const unsub = onSnapshot(
      q,
      (snap) => {
        setData(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        )
        setError('')
      },
      (err) => setError(err.message || 'Snapshot error')
    )

    return () => unsub()
  }, [path])

  return { data, error }
}

export default useCollectionSubscription
