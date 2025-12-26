import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { TbTrash } from 'react-icons/tb'
import { db } from '../firebase'
import ClientForm from '../components/ClientForm'
import Modal from '../components/Modal'
import ClientCards from '../components/ClientCards'
import TicketCreateModal from '../components/TicketCreateModal'
import { useClientsCache } from '../hooks/useClientsCache'
import ClientImportWizard from '../components/ClientImportWizard'
import IncomesImportModal from '../components/IncomesImportModal'
import { logClientActivity } from '../utils/clientActivity'
import { normalizeNumericId, normalizeTaxId } from '../utils/id'
import { useClientFilters } from '../features/clients/hooks/useClientFilters'
import ClientsHeader from '../features/clients/components/ClientsHeader'
import ClientsFilterBar from '../features/clients/components/ClientsFilterBar'
import ClientListView from '../features/clients/components/ClientListView'
import ClientSkeletons from '../features/clients/components/ClientSkeletons'
import { buildExistingIdSet } from '../features/clients/utils/clientDates'
import { useClientSchema } from '../hooks/useClientSchema.jsx'

function ClientsPage({ currentUser, userProfiles = [] }) {
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const {
    fields,
    groups,
    emptyClientTemplate,
    loading: schemaLoading,
    error: schemaError,
  } = useClientSchema()
  const [formData, setFormData] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState({ message: 'Kapcsolodas...', ok: false })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState(currentUser || '')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [showIncomeImport, setShowIncomeImport] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [deleting, setDeleting] = useState(false)
  const selectAllRef = useRef(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const assigneeOptions = useMemo(
    () => Array.from(new Set((userProfiles || []).map((p) => p.username).filter(Boolean))),
    [userProfiles]
  )

  const {
    filters: { searchTerm, statusFilter, startYear, startMonth, sortBy, viewMode },
    setters: { setSearchTerm, setStatusFilter, setStartYear, setStartMonth, setSortBy },
    toggleViewMode,
    filteredClients,
    availableYears,
    formatStartDate,
  } = useClientFilters(clients)

  const existingIds = useMemo(() => buildExistingIdSet(clients), [clients])
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

  useEffect(() => {
    if (!schemaLoading && emptyClientTemplate) {
      setFormData(emptyClientTemplate)
    }
  }, [schemaLoading, emptyClientTemplate])

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setFormData(emptyClientTemplate)
    setEditingId(null)
    setShowFormModal(false)
  }

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
    const confirmed = window.confirm('Biztosan torolni szeretned a kijelolt ugyfeleket?')
    if (!confirmed) return
    setDeleting(true)
    setError('')
    try {
      await Promise.all(selectedIds.map((id) => deleteDoc(doc(db, 'clients', id))))
      setSelectedIds([])
      setSelectionMode(false)
      setStatus({ message: 'Kijelolt ugyfelek torolve.', ok: true })
    } catch (err) {
      setError(err.message || 'Torles sikertelen')
      setStatus({ message: 'Nem sikerult torolni a kijelolt ugyfeleket.', ok: false })
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const normalizedTax = normalizeNumericId(formData.adoszam)
      const normalizedPid = normalizeNumericId(formData.adoazonosito)
      if (!editingId) {
        if (normalizedTax && existingIds.has(`tax:${normalizedTax}`)) {
          throw new Error('Mar letezik ugyfel ezzel az adoszammal.')
        }
        if (normalizedPid && existingIds.has(`pid:${normalizedPid}`)) {
          throw new Error('Mar letezik ugyfel ezzel az adoazonositoval.')
        }
      }

      if (editingId) {
        const ref = doc(db, 'clients', editingId)
        await updateDoc(ref, formData)
        setStatus({ message: 'Ugyfel frissitve.', ok: true })
      } else {
        await addDoc(collection(db, 'clients'), formData)
        setStatus({ message: 'Uj ugyfel rogzitve.', ok: true })
      }
      resetForm()
    } catch (err) {
      setError(err.message || 'Mentesi hiba')
      setStatus({ message: 'Mentes sikertelen.', ok: false })
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
      setTicketError('Add meg a leirast es a felelost.')
      return
    }
    try {
      setTicketSaving(true)
      setTicketError('')
      const ref = await addDoc(collection(db, 'tickets'), {
        clientId: ticketClient.id,
        clientName: ticketClient.nev || 'Ismeretlen ugyfel',
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
      setStatus({ message: 'Ticket letrehozva.', ok: true })
    } catch (err) {
      setTicketError(err.message || 'Ticket letrehozasa sikertelen')
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

  const formDisabled = schemaLoading || !fields.length

  return (
    <main className="page-container">
      <ClientsHeader
        clientsCount={clients.length}
        filteredCount={filteredClients.length}
        status={status}
        onOpenImportWizard={() => setShowImportWizard(true)}
        onOpenIncomeImport={() => setShowIncomeImport(true)}
        onAddClient={() => {
          setFormData(emptyClientTemplate)
          setEditingId(null)
          setShowFormModal(true)
        }}
      />

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {schemaError ? <div className="banner banner-error">Sema hiba: {schemaError}</div> : null}

      <ClientsFilterBar
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        startYear={startYear}
        startMonth={startMonth}
        sortBy={sortBy}
        viewMode={viewMode}
        availableYears={availableYears}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
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
            <span>Kijeloles ezen a listan</span>
          </label>
          <div className="selection-bar__actions">
            <span className="pill">{selectedIds.length} kivalasztva</span>
            <button className="btn ghost" type="button" onClick={clearSelection} disabled={!selectedIds.length}>
              Kijeloles torlese
            </button>
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

      {showFormModal ? (
        <Modal onClose={resetForm} title={editingId ? 'Ugyfel szerkesztese' : 'Uj ugyfel'}>
          <ClientForm
            fields={fields}
            groups={groups}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onReset={resetForm}
            editingId={editingId}
            saving={saving || formDisabled}
          />
          {schemaLoading ? <p className="muted">Sema betoltese...</p> : null}
        </Modal>
      ) : null}

      {showImportWizard ? (
        <ClientImportWizard
          onClose={() => setShowImportWizard(false)}
          clients={clients}
          onComplete={(result) =>
            setStatus({
              message: `Import kesz. Uj: ${result.created}, frissitett: ${result.updated}, kihagyva: ${result.skipped}.`,
              ok: true,
            })
          }
        />
      ) : null}

      {showIncomeImport ? <IncomesImportModal onClose={() => setShowIncomeImport(false)} clients={clients} /> : null}

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
