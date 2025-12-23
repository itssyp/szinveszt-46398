import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import {
  addDoc,
  collection,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { TbLayoutGrid, TbList } from 'react-icons/tb'
import ClientForm from '../components/ClientForm'
import StatusBadge from '../components/StatusBadge'
import Modal from '../components/Modal'
import ClientCards, { statusClass } from '../components/ClientCards'
import TicketCreateModal from '../components/TicketCreateModal'
import { fieldDefinitions, emptyClient } from '../constants/clientFields'
import { useClientsCache } from '../hooks/useClientsCache'
import ClientImportWizard from '../components/ClientImportWizard'

const normalizeId = (value) => (value || '').toString().replace(/\D/g, '')

function ClientsPage({ currentUser }) {
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [formData, setFormData] = useState(emptyClient)
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState({ message: 'Kapcsolódás...', ok: false })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startYear, setStartYear] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState('cards')
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState(currentUser || '')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [showImportWizard, setShowImportWizard] = useState(false)
  const navigate = useNavigate()

  const existingIds = useMemo(() => {
    const set = new Set()
    clients.forEach((c) => {
      const tax = normalizeId(c.adoszam)
      const pid = normalizeId(c.adoazonosito)
      if (tax) set.add(`tax:${tax}`)
      if (pid) set.add(`pid:${pid}`)
    })
    return set
  }, [clients])

  useEffect(() => {
    if (clientsError) {
      setError(clientsError)
      setStatus({ message: 'Hiba a Firestore kapcsolatban.', ok: false })
    } else if (!clientsLoading) {
      setStatus({ message: 'Kapcsolat aktív és adatok betöltve.', ok: true })
    }
  }, [clientsError, clientsLoading])

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setFormData(emptyClient)
    setEditingId(null)
    setShowFormModal(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const normalizedTax = normalizeId(formData.adoszam)
      const normalizedPid = normalizeId(formData.adoazonosito)
      if (!editingId) {
        if (normalizedTax && existingIds.has(`tax:${normalizedTax}`)) {
          throw new Error('Már létezik ügyfél ezzel az adószámmal.')
        }
        if (normalizedPid && existingIds.has(`pid:${normalizedPid}`)) {
          throw new Error('Már létezik ügyfél ezzel az adóazonosítóval.')
        }
      }

      if (editingId) {
        const ref = doc(db, 'clients', editingId)
        await updateDoc(ref, formData)
        setStatus({ message: 'Ügyfél frissítve.', ok: true })
      } else {
        await addDoc(collection(db, 'clients'), formData)
        setStatus({ message: 'Új ügyfél rögzítve.', ok: true })
      }
      resetForm()
    } catch (err) {
      setError(err.message || 'Mentési hiba')
      setStatus({ message: 'Mentés sikertelen.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleOpenTicketModal = (client) => {
    setTicketClient(client)
    setTicketDescription('')
    setTicketError('')
    setTicketAssignee(currentUser || '')
  }

  const handleCreateTicket = async () => {
    if (!ticketClient || !ticketDescription.trim() || !ticketAssignee) {
      setTicketError('Add meg a leírást és a felelőst.')
      return
    }
    try {
      setTicketSaving(true)
      setTicketError('')
      await addDoc(collection(db, 'tickets'), {
        clientId: ticketClient.id,
        clientName: ticketClient.nev || 'Ismeretlen ügyfél',
        description: ticketDescription.trim(),
        status: 'Nyitott',
        createdBy: currentUser || 'Ismeretlen',
        assignedTo: ticketAssignee,
        resolved: false,
        createdAt: serverTimestamp(),
        comments: [],
      })
      setTicketClient(null)
      setTicketDescription('')
      setStatus({ message: 'Ticket létrehozva.', ok: true })
    } catch (err) {
      setTicketError(err.message || 'Ticket létrehozása sikertelen')
      setStatus({ message: 'Hiba ticket létrehozásakor.', ok: false })
    } finally {
      setTicketSaving(false)
    }
  }

  const parseStartDate = (client) => {
    const raw = client.kezdesDatuma
    if (raw && typeof raw === 'object' && raw.toDate) return raw.toDate()
    if (raw instanceof Date) return raw
    if (typeof raw === 'string' && raw) return new Date(raw)
    return null
  }

  const formatStartDate = (client) => {
    const date = parseStartDate(client)
    if (!date) return '-'
    return date.toLocaleDateString('hu-HU')
  }

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return clients
      .filter((client) => {
        if (term) {
          const name = (client.nev || '').toLowerCase()
          const tax = (client.adoszam || '').toLowerCase()
          if (!name.includes(term) && !tax.includes(term)) return false
        }
        if (statusFilter && (client.statusz || '').toLowerCase() !== statusFilter.toLowerCase()) {
          return false
        }
        const start = parseStartDate(client)
        if (startYear && (!start || start.getFullYear().toString() !== startYear)) {
          return false
        }
        if (startMonth) {
          const monthVal = start ? String(start.getMonth() + 1).padStart(2, '0') : ''
          if (monthVal !== startMonth) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'start-desc' || sortBy === 'start-asc') {
          const dateA = parseStartDate(a)?.getTime() || 0
          const dateB = parseStartDate(b)?.getTime() || 0
          return sortBy === 'start-desc' ? dateB - dateA : dateA - dateB
        }
        const nameA = (a.nev || '').toLowerCase()
        const nameB = (b.nev || '').toLowerCase()
        return nameA.localeCompare(nameB, 'hu')
      })
  }, [clients, searchTerm, statusFilter, startYear, startMonth, sortBy])

  const availableYears = useMemo(() => {
    const years = new Set()
    clients.forEach((c) => {
      const date = parseStartDate(c)
      if (date) years.add(date.getFullYear().toString())
    })
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [clients])

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">Ügyfél törzsadatok</p>
            <h1 className="section-title">Szinveszt ügyfélkezelő</h1>
            <p className="section-subtitle">Keresés, importálás, szerkesztés egy helyen.</p>
          </div>
          <div className="section-header__actions">
            <button className="btn ghost" type="button" onClick={() => setShowImportWizard(true)}>
              Excel import (új)
            </button>
            <button className="btn" type="button" onClick={() => setShowFormModal(true)}>
              Új ügyfél
            </button>
          </div>
        </div>
        <div className="metric-bar">
          <div className="metric-card">
            <span className="metric-label">Összes ügyfél</span>
            <span className="metric-value">{clients.length}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Szűrt lista</span>
            <span className="metric-value">{filteredClients.length}</span>
          </div>
          <StatusBadge ok={status.ok} message={status.message} />
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <div className="panel filter-panel">
        <div className="input-shell search-field wide-search">
          <input
            type="search"
            placeholder="Keresés név vagy adószám alapján..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-bar">
          <label className="filter-control">
            <span>Státusz</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Mind</option>
              <option value="Aktiv">Aktív</option>
              <option value="Szunetel">Szünetel</option>
              <option value="Megszunt">Megszűnt</option>
            </select>
          </label>
          <label className="filter-control">
            <span>Kezdés éve</span>
            <select value={startYear} onChange={(e) => setStartYear(e.target.value)}>
              <option value="">Mind</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Kezdés hónapja</span>
            <select value={startMonth} onChange={(e) => setStartMonth(e.target.value)}>
              <option value="">Mind</option>
              {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Rendezés</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Név (A-Z)</option>
              <option value="start-desc">Kezdés dátuma (legújabb)</option>
              <option value="start-asc">Kezdés dátuma (legrégebbi)</option>
            </select>
          </label>
          <button
            type="button"
            className="view-toggle-btn"
            onClick={() => setViewMode(viewMode === 'cards' ? 'list' : 'cards')}
            title={viewMode === 'cards' ? 'Váltás listára' : 'Váltás kártyákra'}
          >
            <span className="view-toggle-icon" aria-hidden="true">
              {viewMode === 'cards' ? <TbList /> : <TbLayoutGrid />}
            </span>
          </button>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <section className="content-grid">
          <ClientCards
            clients={filteredClients}
            onSelect={(client) => {
              const tax = client.adoszam
              const shortTax = tax ? normalizeId(tax).slice(0, 8) : ''
              if (shortTax) navigate(`/clients/tax/${encodeURIComponent(shortTax)}`)
              else navigate(`/clients/id/${client.id}`)
            }}
          />
        </section>
      ) : (
        <section className="content-grid">
          <div className="client-list">
            <div className="client-list__toolbar">
              <div>
                <p className="eyebrow">Lista</p>
                <h2>Ügyfelek</h2>
              </div>
              <span className="pill">{filteredClients.length}</span>
            </div>
            <div className="client-list__header">
              <span>Név</span>
              <span>Adószám</span>
              <span>E-mail</span>
              <span>Kezdés dátuma</span>
            </div>
            {filteredClients.map((client) => (
              <button
                key={client.id}
                type="button"
                className="client-list__row"
                onClick={() => {
                  const tax = client.adoszam
                  const shortTax = tax ? normalizeId(tax).slice(0, 8) : ''
                  if (shortTax) navigate(`/clients/tax/${encodeURIComponent(shortTax)}`)
                  else navigate(`/clients/id/${client.id}`)
                }}
              >
                <span className="client-list__name">
                  <span className={statusClass(client.statusz)} aria-hidden="true" /> {client.nev || 'N/A'}
                </span>
                <span className="client-list__tax">{client.adoszam || '-'}</span>
                <span className="client-list__email">{client.email || '-'}</span>
                <span className="client-list__date">{formatStartDate(client)}</span>
              </button>
            ))}
            {!filteredClients.length ? (
              <div className="client-list__empty">Nincs megjeleníthető ügyfél.</div>
            ) : null}
          </div>
        </section>
      )}

      {showFormModal ? (
        <Modal onClose={resetForm} title={editingId ? 'Ügyfél szerkesztése' : 'Új ügyfél'}>
          <ClientForm
            fields={fieldDefinitions}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onReset={resetForm}
            editingId={editingId}
            saving={saving}
          />
        </Modal>
      ) : null}

      {showImportWizard ? (
        <ClientImportWizard
          onClose={() => setShowImportWizard(false)}
          clients={clients}
          onComplete={(result) =>
            setStatus({
              message: `Import kész. Új: ${result.created}, frissített: ${result.updated}, kihagyva: ${result.skipped}.`,
              ok: true,
            })
          }
        />
      ) : null}

      {ticketClient ? (
        <TicketCreateModal
          client={ticketClient}
          description={ticketDescription}
          onChangeDescription={setTicketDescription}
          assignedTo={ticketAssignee}
          onChangeAssignedTo={setTicketAssignee}
          currentUser={currentUser}
          saving={ticketSaving}
          error={ticketError}
          onCancel={() => setTicketClient(null)}
          onSubmit={handleCreateTicket}
        />
      ) : null}
    </main>
  )
}

export default ClientsPage
