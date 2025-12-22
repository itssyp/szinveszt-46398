import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import ClientForm from '../components/ClientForm'
import StatusBadge from '../components/StatusBadge'
import BulkImport from '../components/BulkImport'
import Modal from '../components/Modal'
import ClientCards from '../components/ClientCards'
import ClientDetails from '../components/ClientDetails'
import TicketCreateModal from '../components/TicketCreateModal'
import { fieldDefinitions, emptyClient } from '../constants/clientFields'

function ClientsPage({ currentUser }) {
  const [clients, setClients] = useState([])
  const [formData, setFormData] = useState(emptyClient)
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState({ message: 'Kapcsolódás...', ok: false })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startYear, setStartYear] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState('cards')
  const [ticketCounts, setTicketCounts] = useState({})
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState(currentUser || '')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    setStatus({ message: 'Kapcsolódás Firestore-hoz...', ok: false })
    const clientsQuery = query(collection(db, 'clients'), orderBy('nev', 'asc'))
    const unsubscribe = onSnapshot(
      clientsQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setClients(rows)
        setStatus({ message: 'Kapcsolat aktív és adatok betöltve.', ok: true })
        setError('')
      },
      (err) => {
        setError(err.message)
        setStatus({ message: 'Hiba a Firestore kapcsolatban.', ok: false })
      }
    )
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const ticketsQuery = query(collection(db, 'tickets'))
    const unsubscribe = onSnapshot(
      ticketsQuery,
      (snap) => {
        const counts = {}
        snap.docs.forEach((d) => {
          const { clientId } = d.data()
          if (clientId) {
            counts[clientId] = (counts[clientId] || 0) + 1
          }
        })
        setTicketCounts(counts)
      },
      (err) => setError(err.message)
    )
    return () => unsubscribe()
  }, [])

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setFormData(emptyClient)
    setEditingId(null)
    setShowFormModal(false)
  }

  const handleEdit = (client) => {
    setEditingId(client.id)
    setFormData(
      fieldDefinitions.reduce((acc, field) => {
        const current = client[field.key]
        if (field.type === 'boolean') {
          const normalized =
            typeof current === 'boolean'
              ? current
              : typeof current === 'string'
                ? ['true', '1', 'active', 'aktiv', 'aktív'].includes(current.toLowerCase())
                : false
          acc[field.key] = normalized
        } else if (field.type === 'multiselect') {
          if (Array.isArray(current)) acc[field.key] = current
          else if (typeof current === 'string')
            acc[field.key] = current
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          else acc[field.key] = []
        } else if (field.type === 'date') {
          if (current && typeof current === 'object' && current.toDate) {
            acc[field.key] = current.toDate().toISOString().slice(0, 10)
          } else if (current instanceof Date) {
            acc[field.key] = current.toISOString().slice(0, 10)
          } else if (typeof current === 'string') {
            acc[field.key] = current.slice(0, 10)
          } else {
            acc[field.key] = ''
          }
        } else {
          acc[field.key] = current ?? ''
        }
        return acc
      }, {})
    )
    setShowFormModal(true)
    setSelectedClient(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
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

  const handleBulkImport = async (records) => {
    if (!records.length) return
    setImporting(true)
    setError('')
    setStatus({ message: 'Importálás folyamatban...', ok: false })
    try {
      const coll = collection(db, 'clients')
      const chunkSize = 450
      for (let i = 0; i < records.length; i += chunkSize) {
        const batch = writeBatch(db)
        const slice = records.slice(i, i + chunkSize)
        slice.forEach((record) => {
          const ref = doc(coll)
          batch.set(ref, record)
        })
        await batch.commit()
      }
      setStatus({ message: `Import sikeres és ${records.length} sor hozzáadva.`, ok: true })
    } catch (err) {
      setError(err.message || 'Import hiba')
      setStatus({ message: 'Import sikertelen.', ok: false })
      throw err
    } finally {
      setImporting(false)
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
            <BulkImport
              fields={fieldDefinitions}
              onImport={handleBulkImport}
              importing={importing}
              variant="inline"
            />
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
            placeholder="Kereses nev vagy adoszam alapjan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-bar">
          <label className="filter-control">
            <span>Statusz</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Mind</option>
              <option value="Aktiv">Aktiv</option>
              <option value="Szunetel">Szunetel</option>
              <option value="Megszunt">Megszunt</option>
            </select>
          </label>
          <label className="filter-control">
            <span>Kezdes eve</span>
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
            <span>Kezdes honapja</span>
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
            <span>Rendezes</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Nev (A-Z)</option>
              <option value="start-desc">Kezdes datuma (legujabb)</option>
              <option value="start-asc">Kezdes datuma (legregebbi)</option>
            </select>
          </label>
          <div className="view-toggle">
            <button
              type="button"
              className={`pill ${viewMode === 'cards' ? 'pill-active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              Kartya nezet
            </button>
            <button
              type="button"
              className={`pill ${viewMode === 'list' ? 'pill-active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              Lista nezet
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <section className="content-grid">
          <ClientCards
            clients={filteredClients}
            onSelect={setSelectedClient}
            ticketCounts={ticketCounts}
            onTicketClick={(clientId) => {
              const clientName = clients.find((c) => c.id === clientId)?.nev || ''
              const params = new URLSearchParams()
              params.set('clientId', clientId)
              if (clientName) params.set('clientName', clientName)
              navigate(`/tickets?${params.toString()}`)
            }}
          />
        </section>
      ) : (
        <section className="client-list">
          <div className="client-list__header">
            <span>Nev</span>
            <span>Adoszam</span>
            <span>Kezdes datuma</span>
          </div>
          {filteredClients.map((client) => (
            <button
              key={client.id}
              type="button"
              className="client-list__row"
              onClick={() => setSelectedClient(client)}
            >
              <span className="client-list__name">{client.nev || 'N/A'}</span>
              <span className="client-list__tax">{client.adoszam || '-'}</span>
              <span className="client-list__date">{formatStartDate(client)}</span>
            </button>
          ))}
          {!filteredClients.length ? (
            <div className="client-list__empty">Nincs megjelenitheto ugyfel.</div>
          ) : null}
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

      {selectedClient ? (
        <Modal onClose={() => setSelectedClient(null)} title={selectedClient.nev || 'Ügyfél részletek'}>
          <ClientDetails
            client={selectedClient}
            onEdit={() => handleEdit(selectedClient)}
            fields={fieldDefinitions}
            onCreateTicket={() => handleOpenTicketModal(selectedClient)}
          />
        </Modal>
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
