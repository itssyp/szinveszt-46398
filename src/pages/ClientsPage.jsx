import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { t } from '../i18n'

function readInitialFiltersFromSearch(search) {
  const params = new URLSearchParams(search || '')
  return {
    searchTerm: params.get('q') || '',
    statusFilter: params.get('status') || '',
    debtFilter: params.get('debt') || '',
    startYear: params.get('year') || '',
    startMonth: params.get('month') || '',
    sortBy: params.get('sort') || '',
    viewMode: params.get('view') || '',
    assigneeFilter: params.get('asg') || '',
    languageFilter: params.get('lang') || '',
    workTypeFilter: params.get('work') || '',
    taxationFilter: params.get('tax') || '',
    billingCompanyFilter: params.get('company') || '',
    invoicingFilter: params.get('inv') || '',
    utalandoFrequencyFilter: params.get('freq') || '',
    afaFilter: params.get('afa') || '',
    ipaFilter: params.get('ipa') || '',
    foodoraFilter: params.get('food') || '',
    woltFilter: params.get('wolt') || '',
    activityFilter: params.get('act') || '',
  }
}

function ClientsPage({ currentUser, userProfiles = [] }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFiltersRef = useRef(readInitialFiltersFromSearch(location.search))
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [status, setStatus] = useState({ message: 'Kapcsolódás...', ok: false })
  const [error, setError] = useState('')
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState(currentUser || '')
  const [ticketPriority, setTicketPriority] = useState('medium')
  const [ticketDueDate, setTicketDueDate] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [deleting, setDeleting] = useState(false)
  const selectAllRef = useRef(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const assigneeOptions = useMemo(() => {
    const names = (userProfiles || [])
      .map((p) => (p.username || p.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [userProfiles])

  const {
    filters: {
      searchTerm,
      statusFilter,
      debtFilter,
      startYear,
      startMonth,
      sortBy,
      viewMode,
      assigneeFilter,
      languageFilter,
      workTypeFilter,
      taxationFilter,
      billingCompanyFilter,
      invoicingFilter,
      utalandoFrequencyFilter,
      afaFilter,
      ipaFilter,
      foodoraFilter,
      woltFilter,
      activityFilter,
    },
    setters: {
      setSearchTerm,
      setStatusFilter,
      setDebtFilter,
      setStartYear,
      setStartMonth,
      setSortBy,
      setAssigneeFilter,
      setLanguageFilter,
      setWorkTypeFilter,
      setTaxationFilter,
      setBillingCompanyFilter,
      setInvoicingFilter,
      setUtalandoFrequencyFilter,
      setAfaFilter,
      setIpaFilter,
      setFoodoraFilter,
      setWoltFilter,
      setActivityFilter,
    },
    toggleViewMode,
    filteredClients,
    availableYears,
    availableStatuses,
    availableAssignees,
    availableLanguages,
    availableWorkTypes,
    availableTaxationTypes,
    availableBillingCompanies,
    availableInvoicingTypes,
    availableUtalandoFrequencies,
    availableAfaTypes,
    availableIpaTypes,
    availableActivities,
    clearDetailedFilters,
    activeDetailedFilterCount,
    formatStartDate,
  } = useClientFilters(clients, { initialFilters: initialFiltersRef.current })
  const searchParamsString = searchParams.toString()

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
      setStatus({ message: 'Kapcsolat aktív és adatok betöltve.', ok: true })
    }
  }, [clientsError, clientsLoading])

  useEffect(() => {
    const current = searchParamsString
    const next = new URLSearchParams(searchParamsString)

    const setOrDelete = (key, value, defaultValue = '') => {
      const normalized = String(value || '')
      if (!normalized || normalized === defaultValue) next.delete(key)
      else next.set(key, normalized)
    }

    setOrDelete('q', searchTerm)
    setOrDelete('status', statusFilter)
    setOrDelete('debt', debtFilter)
    setOrDelete('year', startYear)
    setOrDelete('month', startMonth)
    setOrDelete('sort', sortBy, 'name')
    setOrDelete('view', viewMode, 'cards')
    setOrDelete('asg', assigneeFilter)
    setOrDelete('lang', languageFilter)
    setOrDelete('work', workTypeFilter)
    setOrDelete('tax', taxationFilter)
    setOrDelete('company', billingCompanyFilter)
    setOrDelete('inv', invoicingFilter)
    setOrDelete('freq', utalandoFrequencyFilter)
    setOrDelete('afa', afaFilter)
    setOrDelete('ipa', ipaFilter)
    setOrDelete('food', foodoraFilter)
    setOrDelete('wolt', woltFilter)
    setOrDelete('act', activityFilter)
    next.delete('email')

    if (next.toString() !== current) {
      setSearchParams(next, { replace: true })
    }
  }, [
    searchTerm,
    statusFilter,
    debtFilter,
    startYear,
    startMonth,
    sortBy,
    viewMode,
    assigneeFilter,
    languageFilter,
    workTypeFilter,
    taxationFilter,
    billingCompanyFilter,
    invoicingFilter,
    utalandoFrequencyFilter,
    afaFilter,
    ipaFilter,
    foodoraFilter,
    woltFilter,
    activityFilter,
    searchParamsString,
    setSearchParams,
  ])

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
    setTicketPriority('medium')
    setTicketDueDate('')
  }

  const handleCreateTicket = async () => {
    if (!ticketClient || !ticketDescription.trim() || !ticketAssignee) {
      setTicketError(t('tickets.create.requiredError'))
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
        priority: ticketPriority || 'medium',
        dueDate: ticketDueDate || '',
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
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
      setTicketPriority('medium')
      setTicketDueDate('')
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
    const returnTo = `${location.pathname}${location.search}`
    if (shortTax) navigate(`/clients/tax/${encodeURIComponent(shortTax)}`, { state: { returnTo } })
    else navigate(`/clients/id/${client.id}`, { state: { returnTo } })
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
        availableStatuses={availableStatuses}
        assigneeFilter={assigneeFilter}
        languageFilter={languageFilter}
        workTypeFilter={workTypeFilter}
        taxationFilter={taxationFilter}
        billingCompanyFilter={billingCompanyFilter}
        invoicingFilter={invoicingFilter}
        utalandoFrequencyFilter={utalandoFrequencyFilter}
        afaFilter={afaFilter}
        ipaFilter={ipaFilter}
        foodoraFilter={foodoraFilter}
        woltFilter={woltFilter}
        activityFilter={activityFilter}
        availableAssignees={availableAssignees}
        availableLanguages={availableLanguages}
        availableWorkTypes={availableWorkTypes}
        availableTaxationTypes={availableTaxationTypes}
        availableBillingCompanies={availableBillingCompanies}
        availableInvoicingTypes={availableInvoicingTypes}
        availableUtalandoFrequencies={availableUtalandoFrequencies}
        availableAfaTypes={availableAfaTypes}
        availableIpaTypes={availableIpaTypes}
        availableActivities={availableActivities}
        activeDetailedFilterCount={activeDetailedFilterCount}
        onSearchChange={setSearchTerm}
        onStatusChange={setStatusFilter}
        onDebtChange={setDebtFilter}
        onYearChange={setStartYear}
        onMonthChange={setStartMonth}
        onSortChange={setSortBy}
        onAssigneeChange={setAssigneeFilter}
        onLanguageChange={setLanguageFilter}
        onWorkTypeChange={setWorkTypeFilter}
        onTaxationChange={setTaxationFilter}
        onBillingCompanyChange={setBillingCompanyFilter}
        onInvoicingChange={setInvoicingFilter}
        onUtalandoFrequencyChange={setUtalandoFrequencyFilter}
        onAfaChange={setAfaFilter}
        onIpaChange={setIpaFilter}
        onFoodoraChange={setFoodoraFilter}
        onWoltChange={setWoltFilter}
        onActivityChange={setActivityFilter}
        onClearDetailedFilters={clearDetailedFilters}
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
              Kijelölés törlése
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
          priority={ticketPriority}
          onChangePriority={setTicketPriority}
          dueDate={ticketDueDate}
          onChangeDueDate={setTicketDueDate}
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
