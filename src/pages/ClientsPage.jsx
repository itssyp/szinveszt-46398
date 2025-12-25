import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import ClientForm from '../components/ClientForm'
import Modal from '../components/Modal'
import ClientCards from '../components/ClientCards'
import TicketCreateModal from '../components/TicketCreateModal'
import { fieldDefinitions, emptyClient } from '../constants/clientFields'
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

function ClientsPage({ currentUser }) {
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [formData, setFormData] = useState(emptyClient)
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState({ message: 'Kapcsolódás...', ok: false })
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

  const {
    filters: { searchTerm, statusFilter, startYear, startMonth, sortBy, viewMode },
    setters: { setSearchTerm, setStatusFilter, setStartYear, setStartMonth, setSortBy },
    toggleViewMode,
    filteredClients,
    availableYears,
    formatStartDate,
  } = useClientFilters(clients)

  const existingIds = useMemo(() => buildExistingIdSet(clients), [clients])

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
      const normalizedTax = normalizeNumericId(formData.adoszam)
      const normalizedPid = normalizeNumericId(formData.adoazonosito)
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
      const ref = await addDoc(collection(db, 'tickets'), {
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
      setStatus({ message: 'Hiba ticket létrehozásakor.', ok: false })
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

  return (
    <main className="page-container">
      <ClientsHeader
        clientsCount={clients.length}
        filteredCount={filteredClients.length}
        status={status}
        onOpenImportWizard={() => setShowImportWizard(true)}
        onOpenIncomeImport={() => setShowIncomeImport(true)}
        onAddClient={() => setShowFormModal(true)}
      />

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

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

      {viewMode === 'cards' ? (
        <section className="content-grid">
          {clientsLoading && !clients.length ? (
            <ClientSkeletons variant="cards" />
          ) : (
            <ClientCards clients={filteredClients} onSelect={handleSelectClient} />
          )}
        </section>
      ) : (
        <section className="content-grid">
          {clientsLoading && !clients.length ? (
            <ClientSkeletons variant="list" filteredCount={filteredClients.length} />
          ) : (
            <ClientListView clients={filteredClients} onSelect={handleSelectClient} formatStartDate={formatStartDate} />
          )}
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

      {showIncomeImport ? <IncomesImportModal onClose={() => setShowIncomeImport(false)} clients={clients} /> : null}

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
