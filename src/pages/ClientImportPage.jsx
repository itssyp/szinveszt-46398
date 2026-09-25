import React from 'react'
import { useNavigate } from 'react-router-dom'
import ClientImportWizard from '../components/ClientImportWizard'
import { useClientsCache } from '../hooks/useClientsCache'

function ClientImportPage() {
  const navigate = useNavigate()
  const { clients, loading, error } = useClientsCache()

  return (
    <main className="page-container">
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {loading && !clients.length ? <div className="panel">Ügyfelek betöltése...</div> : null}

      <ClientImportWizard
        variant="page"
        clients={clients}
        onClose={() => navigate('/clients')}
      />
    </main>
  )
}

export default ClientImportPage
