import { useState } from 'react'
import { evnyLookup } from '../services/evnyLookup'

export function useEvnyLookup(clientId) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const runLookup = async ({ type, value }) => {
    setLoading(true)
    setError('')
    try {
      const data = await evnyLookup({ type, value, clientId })
      setResult(data)
      return data
    } catch (err) {
      setError(err.message || 'EVNY lekérdezés hiba')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, result, runLookup, setResult }
}

export default useEvnyLookup
