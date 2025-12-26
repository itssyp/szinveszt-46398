import React from 'react'
import { useNavigate } from 'react-router-dom'
import IncomesImportModal from '../components/IncomesImportModal'
import { useClientsCache } from '../hooks/useClientsCache'

function IncomeImportPage() {
  const navigate = useNavigate()
  const { clients, loading, error } = useClientsCache()

  return (
    <main className="page-container">
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {loading && !clients.length ? <div className="panel">Ügyfelek betöltése...</div> : null}
      <IncomesImportModal variant="page" clients={clients} onClose={() => navigate('/clients')} />
    </main>
  )
}

export default IncomeImportPage
