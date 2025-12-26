import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ClientImportWizard from '../components/ClientImportWizard'
import { useClientsCache } from '../hooks/useClientsCache'

function ClientImportPage() {
  const navigate = useNavigate()
  const { clients, loading, error } = useClientsCache()
  const [lastResult, setLastResult] = useState(null)

  return (
    <main className="page-container">
      {lastResult ? (
        <div className="banner banner-info">
          Import kész. Új: {lastResult.created}, frissítve: {lastResult.updated}, kihagyva: {lastResult.skipped}.
        </div>
      ) : null}
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {loading && !clients.length ? <div className="panel">Ügyfelek betöltése...</div> : null}

      <ClientImportWizard
        variant="page"
        clients={clients}
        onClose={() => navigate('/clients')}
        onComplete={setLastResult}
      />
    </main>
  )
}

export default ClientImportPage
