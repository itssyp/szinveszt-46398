import React from 'react'
import { TbUpload, TbUserPlus } from 'react-icons/tb'
import StatusBadge from '../../../components/StatusBadge'

function ClientsHeader({ clientsCount, filteredCount, status, onOpenImportWizard, onOpenIncomeImport, onAddClient }) {
  return (
    <header className="section-header">
      <div className="section-header__top">
        <div>
          <p className="eyebrow">よgyfゼl tзrzsadatok</p>
          <h1 className="section-title">Szinveszt グgyfゼlkezelЪ</h1>
          <p className="section-subtitle">KeresЪs, importбlбs, szerkesztЪs egy helyen.</p>
        </div>
        <div className="section-header__actions">
          <button className="btn ghost" type="button" onClick={onOpenImportWizard}>
            <TbUpload /> Excel import (ъj)
          </button>
          <button className="btn ghost" type="button" onClick={onOpenIncomeImport}>
            <TbUpload /> Bevйtelek import
          </button>
          <button className="btn" type="button" onClick={onAddClient}>
            <TbUserPlus /> ъj Гgyfйl
          </button>
        </div>
      </div>
      <div className="metric-bar">
        <div className="metric-card">
          <span className="metric-label">Цsszes Гgyfйl</span>
          <span className="metric-value">{clientsCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Szыrt lista</span>
          <span className="metric-value">{filteredCount}</span>
        </div>
        <StatusBadge ok={status.ok} message={status.message} />
      </div>
    </header>
  )
}

export default ClientsHeader
