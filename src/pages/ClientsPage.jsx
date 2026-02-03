import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { TbTrash } from 'react-icons/tb'
import { db } from '../firebase'
import ClientCards from '../components/ClientCards'
import TicketCreateModal from '../components/TicketCreateModal'
import { useClientsCache } from '../hooks/useClientsCache'
import { logClientActivity } from '../utils/clientActivity'
import { normalizeTaxId } from '../utils/id'
import { useClientFilters } from '../features/clients/hooks/useClientFilters'
import ClientsHeader from '../features/clients/components/ClientsHeader'
import ClientsFilterBar from '../features/clients/components/ClientsFilterBar'
import ClientListView from '../features/clients/components/ClientListView'
import ClientSkeletons from '../features/clients/components/ClientSkeletons'

function ClientsPage({ currentUser, userProfiles = [] }) {
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [status, setStatus] = useState({ message: 'Kapcsolodas...', ok: false })
  const [error, setError] = useState('')
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState(currentUser || '')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [deleting, setDeleting] = useState(false)
  const selectAllRef = useRef(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const assigneeOptions = useMemo(
    () => Array.from(new Set((userProfiles || []).map((p) => p.username).filter(Boolean))),
    [userProfiles]
  )

  const {
    filters: { searchTerm, statusFilter, debtFilter, startYear, startMonth, sortBy, viewMode },
    setters: { setSearchTerm, setStatusFilter, setDebtFilter, setStartYear, setStartMonth, setSortBy },
    toggleViewMode,
    filteredClients,
    availableYears,
    formatStartDate,
  } = useClientFilters(clients)

  const visibleIds = useMemo(() => filteredClients.map((c) => c.id), [filteredClients])
  const selectedInView = useMemo(
    () => selectedIds.filter((id) => visibleIds.includes(id)),
    [selectedIds, visibleIds]
  )
  const allVisibleSelected = visibleIds.length > 0 && selectedInView.length === visibleIds.length
  const someVisibleSelected = selectedInView.length > 0 && !allVisibleSelected

  useEffect(() => {
    if (!selectionMode || !selectAllRef.current) return
    selectAllRef.current.indeterminate = someVisibleSelected
  }, [someVisibleSelected, allVisibleSelected, selectionMode])

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => clients.some((c) => c.id === id)))
  }, [clients])

  useEffect(() => {
    if (selectionMode && selectedIds.length === 0) {
      setSelectionMode(false)
    }
  }, [selectedIds, selectionMode])

  useEffect(() => {
    if (clientsError) {
      setError(clientsError)
      setStatus({ message: 'Hiba a Firestore kapcsolatban.', ok: false })
    } else if (!clientsLoading) {
      setStatus({ message: 'Kapcsolat aktiv es adatok betoltve.', ok: true })
    }
  }, [clientsError, clientsLoading])

  const toggleSelectClient = (clientId) => {
    setSelectionMode(true)
    setSelectedIds((prev) => {
      if (prev.includes(clientId)) return prev.filter((id) => id !== clientId)
      return [...prev, clientId]
    })
  }

  const toggleSelectAllVisible = () => {
    setSelectionMode(true)
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id))
      }
      const merged = new Set([...prev, ...visibleIds])
      return Array.from(merged)
    })
  }

  const clearSelection = () => {
    setSelectedIds([])
    setSelectionMode(false)
  }

  const handleDeleteSelected = async () => {
    if (!selectedIds.length) return
    const confirmed = window.confirm('Biztosan törölni szeretnéd a kijelölt ügyfeleket?')
    if (!confirmed) return
    setDeleting(true)
    setError('')
    try {
      await Promise.all(selectedIds.map((id) => deleteDoc(doc(db, 'clients', id))))
      setSelectedIds([])
      setSelectionMode(false)
      setStatus({ message: 'Kijelölt ügyfelek sikeresen törölve.', ok: true })
    } catch (err) {
      setError(err.message || 'Törlés sikertelen')
      setStatus({ message: 'Nem sikerült törölni a kijelölt ügyfeleket.', ok: false })
    } finally {
      setDeleting(false)
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
      const ref = await addDoc(collection(db, 'tickets'), {
        clientId: ticketClient.id,
        clientName: ticketClient.nev || 'Ismeretlen ügyfel',
        description: ticketDescription.trim(),
        status: 'Nyitott',
        createdBy: currentUser || 'Ismeretlen',
        assignedTo: ticketAssignee,
        resolved: false,
        createdAt: serverTimestamp(),
        comments: [],
      })
      await logClientActivity({
        clientId: ticketClient.id,
        type: 'ticket_created',
        message: `Ticket: ${ticketDescription.trim().slice(0, 80)}`,
        meta: { ticketId: ref.id, assignedTo: ticketAssignee },
        actor: currentUser || 'Ismeretlen',
      })
      setTicketClient(null)
      setTicketDescription('')
      setStatus({ message: 'Ticket létrehozva.', ok: true })
    } catch (err) {
      setTicketError(err.message || 'Ticket létrehozása sikertelen')
      setStatus({ message: 'Hiba ticket letrehozasakor.', ok: false })
    } finally {
      setTicketSaving(false)
    }
  }

  const handleSelectClient = (client) => {
    const tax = client.adoszam
    const shortTax = tax ? normalizeTaxId(tax) : ''
    if (shortTax) navigate(`/clients/tax/${encodeURIComponent(shortTax)}`)
    else navigate(`/clients/id/${client.id}`)
  }

  const handleClientClick = (client) => {
    if (selectionMode) {
      toggleSelectClient(client.id)
    } else {
      handleSelectClient(client)
    }
  }

  const handleClientLongPress = (clientId) => {
    setSelectionMode(true)
    setSelectedIds((prev) => {
      if (prev.includes(clientId)) return prev
      return [...prev, clientId]
    })
  }


  return (
    <main className="page-container">
      <ClientsHeader
        clientsCount={clients.length}
        filteredCount={filteredClients.length}
        status={status}
      />

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <ClientsFilterBar
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        debtFilter={debtFilter}
        startYear={startYear}
        startMonth={startMonth}
        sortBy={sortBy}
        viewMode={viewMode}
        availableYears={availableYears}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onDebtChange={setDebtFilter}
        onYearChange={setStartYear}
        onMonthChange={setStartMonth}
        onSortChange={setSortBy}
        onToggleView={toggleViewMode}
      />

      {selectionMode ? (
        <div className="selection-bar">
          <label className="selection-bar__control">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              aria-label="Select all clients in view"
            />
            <span>Kijelölés ezen a listán</span>
          </label>
          <div className="selection-bar__actions">
            <span className="pill">{selectedIds.length} kiválasztva</span>
            {/* <button className="btn ghost" type="button" onClick={clearSelection} disabled={!selectedIds.length}>
              Kijeloles torlese
            </button> */}
            <button
              className="btn ghost danger"
              type="button"
              onClick={handleDeleteSelected}
              disabled={!selectedIds.length || deleting}
              aria-label="Delete selected clients"
            >
              {deleting ? '...' : <TbTrash />}
            </button>
          </div>
        </div>
      ) : null}

      {viewMode === 'cards' ? (
        <section className="content-grid">
          {clientsLoading && !clients.length ? (
            <ClientSkeletons variant="cards" />
          ) : (
            <ClientCards
              clients={filteredClients}
              onSelect={handleClientClick}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelectClient}
              onLongPress={handleClientLongPress}
              selectionMode={selectionMode}
            />
          )}
        </section>
      ) : (
        <section className="content-grid">
          {clientsLoading && !clients.length ? (
            <ClientSkeletons variant="list" filteredCount={filteredClients.length} />
          ) : (
            <ClientListView
              clients={filteredClients}
              onSelect={handleClientClick}
              onToggleSelect={toggleSelectClient}
              selectedIds={selectedIds}
              allVisibleSelected={allVisibleSelected}
              someVisibleSelected={someVisibleSelected}
              onToggleSelectAll={toggleSelectAllVisible}
              formatStartDate={formatStartDate}
              onLongPress={handleClientLongPress}
              selectionMode={selectionMode}
            />
          )}
        </section>
      )}

      {ticketClient ? (
        <TicketCreateModal
          client={ticketClient}
          description={ticketDescription}
          onChangeDescription={setTicketDescription}
          assignedTo={ticketAssignee}
          onChangeAssignedTo={setTicketAssignee}
          currentUser={currentUser}
          assigneeOptions={assigneeOptions}
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
