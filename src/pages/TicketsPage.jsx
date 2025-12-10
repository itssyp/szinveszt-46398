import React, { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import Modal from '../components/Modal'
import TicketModal from '../components/TicketModal'

function TicketsPage({ currentUser }) {
  const [tickets, setTickets] = useState([])
  const [error, setError] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTickets(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        )
        setError('')
      },
      (err) => setError(err.message)
    )
    return () => unsub()
  }, [])

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((t) => t.id === selectedTicket.id)
      if (updated) setSelectedTicket(updated)
    }
  }, [tickets]) // keep modal data live

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

      return matchesSearch && matchesAssignee && matchesStatus
    })
  }, [tickets, searchTerm, assigneeFilter, statusFilter])

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

      <section className="content-grid">
        <div className="panel tickets-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Keresés</p>
              <h2>Összes ticket</h2>
            </div>
            <div className="filter-bar">
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
                  {['Szindi', 'Fanni', 'Szilveszter'].map((u) => (
                    <option key={u} value={u.toLowerCase()}>
                      {u}
                    </option>
                  ))}
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
            {filteredTickets.map((t) => (
              <div
                key={t.id}
                className={`ticket-row clickable ${t.assignedTo ? `assignee-${t.assignedTo.toLowerCase()}` : ''}`}
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
            ))}
            {!filteredTickets.length ? <p className="muted">Nincsenek ticketek.</p> : null}
          </div>
        </div>
      </section>

      {selectedTicket ? (
        <Modal onClose={() => setSelectedTicket(null)} title="Ticket részletek">
          <TicketModal
            ticket={selectedTicket}
            onClose={() => setSelectedTicket(null)}
            currentUser={currentUser}
          />
        </Modal>
      ) : null}
    </main>
  )
}

export default TicketsPage
