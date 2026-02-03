import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientsCache } from '../hooks/useClientsCache'
import { exportClientsToExcel } from '../utils/clientExport'

function ClientExportPage() {
  const navigate = useNavigate()
  const { clients, loading, error } = useClientsCache()
  const [status, setStatus] = useState('')

  const handleExport = () => {
    if (error) {
      setStatus('Export failed: could not load clients.')
      return
    }
    if (!clients.length) {
      setStatus('No clients available for export.')
      return
    }
    exportClientsToExcel(clients)
    setStatus('Export ready. The download should start now.')
  }

  return (
    <main className="page-container">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Export</p>
            <h1 className="section-title">Ügyfelek exportálása</h1>
            <p className="section-subtitle">Ügyfelek exportálása Excel fájlként</p>
          </div>
        </div>
        {error ? <div className="banner banner-error">Error: {error}</div> : null}
        {status ? <div className="banner banner-info">{status}</div> : null}
        <div className="section-actions">
          <button className="btn" type="button" onClick={handleExport} disabled={loading || !clients.length}>
            {loading ? 'Loading...' : 'Excel export'}
          </button>
        </div>
      </section>
    </main>
  )
}

export default ClientExportPage
