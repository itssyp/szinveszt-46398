import React from 'react'
import StatusBadge from '../../../components/StatusBadge'

function ClientsHeader({ clientsCount, filteredCount, status }) {
  return (
    <header className="section-header">
      <div className="section-header__top">
        <div>
          <p className="eyebrow">Ügyfél törzsadatok</p>
          <h1 className="section-title">Szinveszt ügyfélkezelés</h1>
          <p className="section-subtitle">Keresés, importálás, szerkesztés egy helyen.</p>
        </div>
      </div>
      <div className="metric-bar">
        <div className="metric-card">
          <span className="metric-label">Összes ügyfél</span>
          <span className="metric-value">{clientsCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Szűrt lista</span>
          <span className="metric-value">{filteredCount}</span>
        </div>
        <StatusBadge ok={status.ok} message={status.message} />
      </div>
    </header>
  )
}

export default ClientsHeader
