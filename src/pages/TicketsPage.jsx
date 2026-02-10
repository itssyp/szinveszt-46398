import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { orderBy, query } from 'firebase/firestore'
import useCollectionSubscription from '../hooks/useCollectionSubscription'
import Modal from '../components/Modal'
import TicketModal from '../components/TicketModal'
import { useUserProfile } from '../hooks/useUserProfile.jsx'

function TicketsPage({ currentUser }) {
  const { data: tickets, error, loading } = useCollectionSubscription('tickets', (coll) =>
    query(coll, orderBy('createdAt', 'desc'))
  )
  const { profiles, profilesError } = useUserProfile()
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [clientFilter, setClientFilter] = useState({ id: '', name: '' })
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => t.id === selectedTicket.id)
      if (updated) setSelectedTicket(updated)
    }
  }, [tickets])

  useEffect(() => {
    const clientId = searchParams.get('clientId') || ''
    const clientName = searchParams.get('clientName') || ''
    if (clientId) {
      setClientFilter({ id: clientId, name: clientName })
    } else {
      setClientFilter({ id: '', name: '' })
    }
  }, [searchParams])

  const assigneeColors = useMemo(() => {
    const map = {}
    profiles.forEach((p) => {
      const key = (p.username || p.email || '').trim().toLowerCase()
      if (key) map[key] = p.themeColor || map[key]
    })
    return map
  }, [profiles])

  const assigneeOptions = useMemo(() => {
    const names = profiles
      .map((p) => (p.username || p.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])

  const filteredTickets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return tickets.filter((t) => {
      const name = (t.clientName || '').toLowerCase()
      const desc = (t.description || '').toLowerCase()
      const statusText = t.resolved ? 'megoldva' : 'nyitott'
      const assignee = (t.assignedTo || '').toLowerCase()

      const matchesSearch =
        !term || name.includes(term) || desc.includes(term) || statusText.includes(term)
      const matchesAssignee = assigneeFilter
        ? assignee === assigneeFilter.toLowerCase()
        : true
      const matchesStatus =
        statusFilter === ''
          ? true
          : statusFilter === 'open'
            ? !t.resolved
            : t.resolved
      const matchesClient = clientFilter.id
        ? String(t.clientId || '') === String(clientFilter.id)
        : true

      return matchesSearch && matchesAssignee && matchesStatus && matchesClient
    })
  }, [tickets, searchTerm, assigneeFilter, statusFilter, clientFilter])

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">Ticketek</p>
            <h1 className="section-title">Ügyfél ticketkezelő</h1>
            <p className="section-subtitle">Jegyek rögzítése, állapotuk áttekintése.</p>
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {profilesError ? <div className="banner banner-error">Hiba: {profilesError}</div> : null}

      <section className="content-grid">
        <div className="panel tickets-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Keresés</p>
              <h2>Összes ticket</h2>
            </div>
            <div className="filter-bar">
              {clientFilter.id ? (
                <button
                  type="button"
                  className="pill pill-clear"
                  onClick={() => {
                    setClientFilter({ id: '', name: '' })
                    const next = new URLSearchParams(searchParams)
                    next.delete('clientId')
                    next.delete('clientName')
                    setSearchParams(next)
                  }}
                  title="Ügyfél szűrő törlése"
                >
                  {clientFilter.name || 'Kijelölt ügyfél'} ×
                </button>
              ) : null}
              <div className="input-shell search-field">
                <input
                  type="search"
                  placeholder="Keresés ügyfél, leírás vagy státusz alapján..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <label className="filter-control">
                <span>Felelős</span>
                <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="">Mind</option>
                  {assigneeOptions.map((u) => {
                    const value = u.toLowerCase()
                    return (
                      <option key={u} value={value}>
                        {u}
                      </option>
                    )
                  })}
                </select>
              </label>
              <label className="filter-control">
                <span>Állapot</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">Mind</option>
                  <option value="open">Nyitott</option>
                  <option value="closed">Megoldva</option>
                </select>
              </label>
              <span className="pill">{filteredTickets.length}</span>
            </div>
          </div>
          <div className="ticket-list">
            {loading ? (
              <div className="skeleton-ticket-grid">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div className="ticket-row skeleton-card" key={idx}>
                    <div className="ticket-head">
                      <div className="skeleton lg wide" style={{ width: '38%' }} />
                      <div className="skeleton skeleton-pill" />
                    </div>
                    <div className="skeleton md wide" style={{ width: '72%' }} />
                    <div className="ticket-meta">
                      <span className="skeleton sm" style={{ width: '30%' }} />
                      <span className="skeleton sm" style={{ width: '20%' }} />
                      <span className="skeleton sm" style={{ width: '24%' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {filteredTickets.map((t) => {
                  const accent = assigneeColors[(t.assignedTo || '').trim().toLowerCase()]
                  return (
                    <div
                      key={t.id}
                      className="ticket-row clickable"
                      style={accent ? { '--ticket-accent': accent } : undefined}
                      onClick={() => setSelectedTicket(t)}
                    >
                      <div className="ticket-head">
                        <div className="ticket-client">{t.clientName || 'Ismeretlen ügyfél'}</div>
                        <div className={`ticket-status ${t.resolved ? 'is-resolved' : 'is-open'}`}>
                          {t.resolved ? 'Megoldva' : 'Nyitott'}
                        </div>
                      </div>
                      <div className="ticket-desc">{t.description || 'Nincs leírás'}</div>
                      <div className="ticket-meta">
                        <span>
                          {t.createdAt?.toDate
                            ? t.createdAt.toDate().toLocaleString()
                            : 'Nincs dátum'}
                        </span>
                        {t.clientId ? <span className="muted">ID: {t.clientId}</span> : null}
                        {t.assignedTo ? <span className="muted">Felelős: {t.assignedTo}</span> : null}
                      </div>
                    </div>
                  )
                })}
                {!filteredTickets.length ? <p className="muted">Nincsenek ticketek.</p> : null}
              </>
            )}
          </div>
        </div>
      </section>

      {selectedTicket ? (
        <Modal onClose={() => setSelectedTicket(null)} title="Ticket részletek">
          <TicketModal
            ticket={selectedTicket}
            onClose={() => setSelectedTicket(null)}
            currentUser={currentUser}
            assigneeOptions={assigneeOptions}
          />
        </Modal>
      ) : null}
    </main>
  )
}

export default TicketsPage
