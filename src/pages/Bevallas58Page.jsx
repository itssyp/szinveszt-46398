import React, { useEffect, useMemo, useState } from 'react'
import { TbArrowLeft } from 'react-icons/tb'
import { useNavigate } from 'react-router-dom'
import { useClientsCache } from '../hooks/useClientsCache'
import { generateBevallas58, subscribeBevallasJob } from '../services/bevallas'

const PERIOD_KEY = 'bevallas58:lastPeriod'

function Bevallas58Page() {
  const navigate = useNavigate()
  const { clients, loading, error } = useClientsCache()
  const [filter, setFilter] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [period, setPeriod] = useState(() => {
    const saved = localStorage.getItem(PERIOD_KEY)
    if (saved) return saved
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  })
  const [jobId, setJobId] = useState('')
  const [job, setJob] = useState(null)
  const [jobError, setJobError] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    localStorage.setItem(PERIOD_KEY, period)
  }, [period])

  useEffect(() => {
    if (!jobId) return undefined
    const unsub = subscribeBevallasJob(
      jobId,
      (data) => {
        setJob(data)
        setGenerating(data.status === 'running')
      },
      (err) => setJobError(err.message || 'Feliratkozási hiba')
    )
    return () => unsub()
  }, [jobId])

  const filteredClients = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return clients
    return clients.filter((c) => {
      const name = (c.nev || '').toLowerCase()
      const tax = (c.adoszam || '').toLowerCase()
      return name.includes(term) || tax.includes(term)
    })
  }, [clients, filter])

  const toggleClient = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredClients.map((c) => c.id)))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const targetClientIds = selectedIds.size ? Array.from(selectedIds) : filteredClients.map((c) => c.id)

  const handleGenerate = async () => {
    if (generating) return
    if (!period) {
      setJobError('Add meg a periódust (YYYY-MM).')
      return
    }
    if (!targetClientIds.length) {
      setJobError('Nincs kiválasztott ügyfél.')
      return
    }
    setJobError('')
    setGenerating(true)
    try {
      const res = await generateBevallas58({ period, clientIds: targetClientIds })
      setJobId(res.jobId)
    } catch (err) {
      setJobError(err.message || 'Generálási hiba.')
      setGenerating(false)
    }
  }

  return (
    <main className="page-container slide-in-right">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <button type="button" className="back-arrow" aria-label="Vissza" onClick={() => navigate('/clients')}>
            <TbArrowLeft />
          </button>
          <div className="section-header__intro">
            <p className="eyebrow">Bevallások</p>
            <h1 className="section-title">58 bevallás</h1>
            <p className="section-subtitle">XML generálás ügyfelek bevételei alapján</p>
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Beállítások</p>
            <h2 className="section-title">Periódus és ügyfelek</h2>
          </div>
          {job?.downloadUrl ? (
            <a className="btn" href={job.downloadUrl} target="_blank" rel="noreferrer">
              ZIP letöltés
            </a>
          ) : null}
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Periódus (YYYY-MM)</span>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </label>
          <label className="form-field">
            <span>Ügyfél szűrő (név vagy adószám)</span>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Keresés..."
            />
          </label>
        </div>

        <div className="details-actions inline" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="btn ghost" onClick={selectAllFiltered} disabled={!filteredClients.length}>
            Összes szűrt kijelölése ({filteredClients.length})
          </button>
          <button type="button" className="btn ghost" onClick={clearSelection} disabled={!selectedIds.size}>
            Kijelölések törlése ({selectedIds.size})
          </button>
          <button type="button" className="btn" onClick={handleGenerate} disabled={generating || loading}>
            {generating ? 'Generálás...' : 'XML generálása (ÁNYK)'}
          </button>
        </div>

        {jobError ? <div className="banner banner-error">Hiba: {jobError}</div> : null}
        {job ? (
          <div className="banner">
            Állapot: {job.status || 'ismeretlen'} • Sikeres: {job.successCount || 0} • Sikertelen:{' '}
            {job.failCount || 0}
          </div>
        ) : null}

        <div className="details-section">
          <div className="details-header">
            <h3>Kijelölt ügyfelek ({targetClientIds.length})</h3>
            {loading ? <span className="muted">Betöltés...</span> : null}
          </div>
          <div className="details-grid details-grid-spaced">
            {filteredClients.slice(0, 50).map((client) => {
              const isSelected = selectedIds.size ? selectedIds.has(client.id) : true
              return (
              <label key={client.id} className="meta-card checkbox-field">
                <div className="switch">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleClient(client.id)}
                  />
                  <span className="switch-slider" />
                </div>
                <div>
                  <div className="meta-label">{client.adoszam || 'adószám hiányzik'}</div>
                  <div className="meta-value emphasis">{client.nev || 'Név hiányzik'}</div>
                </div>
              </label>
            )})}
            {filteredClients.length > 50 ? <p className="muted">Csak az első 50 ügyfél látható.</p> : null}
            {!filteredClients.length ? <p className="muted">Nincs találat.</p> : null}
          </div>
        </div>

        {job?.results?.length ? (
          <div className="details-section">
            <div className="details-header">
              <h3>Eredmények</h3>
            </div>
            <div className="table">
              <div className="table-head">
                <div>Ügyfél</div>
                <div>Adószám</div>
                <div>Státusz</div>
                <div>Üzenetek</div>
              </div>
              {job.results.map((r) => (
                <div key={r.clientId} className="table-row">
                  <div>{r.clientName || '-'}</div>
                  <div>{r.taxNumber || '-'}</div>
                  <div>{r.status}</div>
                  <div>{Array.isArray(r.messages) ? r.messages.join('; ') : '-'}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default Bevallas58Page
