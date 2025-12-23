import React, { useMemo, useState } from 'react'
import useDebtsData, { formatAmount } from '../hooks/useDebtsData'

export default function DebtsPage() {
  const [filter, setFilter] = useState('')
  const { rows, loading, error, progress, lastUpdated, loadDebts, totalDebt } = useDebtsData()

  const visibleRows = useMemo(() => {
    const term = filter.trim().toLowerCase()
    return rows.filter((row) => {
      if (!term) return true
      const name = (row.name || '').toLowerCase()
      const idMatch = String(row.id || '').includes(term)
      const email = (row.email || '').toLowerCase()
      return name.includes(term) || idMatch || email.includes(term)
    })
  }, [rows, filter])

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">Billingo</p>
            <h1 className="section-title">Kintlévőségek</h1>
            <p className="section-subtitle">
              Aggregálás: documents (expired + outstanding + partially_paid) – partnerenkénti összegzés.
            </p>
          </div>
          <div className="section-actions">
            <button className="btn ghost" onClick={loadDebts} disabled={loading}>
              {loading ? 'Frissítés...' : 'Frissítés'}
            </button>
          </div>
        </div>

        <div className="section-meta">
          <span className="pill">{rows.length} partner</span>
          <span className="pill pill-quiet">Összesen {formatAmount(totalDebt)}</span>
          {loading ? <span className="muted">{progress.note}</span> : null}
          {lastUpdated ? (
            <span className="muted">Utolsó frissítés: {lastUpdated.toLocaleString('hu-HU')}</span>
          ) : null}
        </div>

        <div className="section-meta">
          <span className="pill pill-quiet">expired docs: {progress.docsByStatus.expired}</span>
          <span className="pill pill-quiet">outstanding docs: {progress.docsByStatus.outstanding}</span>
          <span className="pill pill-quiet">partially_paid docs: {progress.docsByStatus.partially_paid}</span>
          <span className="pill pill-quiet">
            payments: {progress.paymentsDone}/{progress.paymentsTotal}
          </span>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <section className="content-grid">
        <div className="panel tickets-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Keresés</p>
              <h2>Partnerek tartozása</h2>
            </div>
            <div className="filter-bar">
              <div className="input-shell search-field">
                <input
                  type="search"
                  placeholder="Keresés név / email / partner ID alapján..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  disabled={loading}
                />
              </div>
              <span className="pill">{visibleRows.length}</span>
            </div>
          </div>

          <div className="ticket-list">
            {loading ? <p className="muted">Számítás folyamatban...</p> : null}
            {!loading && !visibleRows.length ? <p className="muted">Nincs találat.</p> : null}

            {visibleRows.map((row) => (
              <div key={row.id} className="ticket-row debt-row">
                <div className="ticket-head">
                  <div className="ticket-client">{row.name || 'Ismeretlen partner'}</div>
                  <div className="ticket-status is-open">{formatAmount(row.debt || 0)}</div>
                </div>
                <div className="ticket-meta">
                  <span className="muted">Partner ID: {row.id}</span>
                  {row.taxcode ? <span className="muted">Adószám: {row.taxcode}</span> : null}
                  {row.email ? <span className="muted">Email: {row.email}</span> : null}
                  <span className="muted">Számlák: {row.invoiceCount || 0}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="muted helper-text">
            Tipp: Ez a megközelítés sokkal kevesebb Billingo hívás, mint partnerenként dokumentumot kérni.
            A legdrágább rész a partially_paid → payments lekérések száma.
          </div>
        </div>
      </section>
    </main>
  )
}
