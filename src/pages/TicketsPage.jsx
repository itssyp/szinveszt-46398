import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { addDoc, collection, orderBy, query, serverTimestamp } from 'firebase/firestore'
import useCollectionSubscription from '../hooks/useCollectionSubscription'
import Modal from '../components/Modal'
import TicketModal from '../components/TicketModal'
import TicketCreateModal from '../components/TicketCreateModal'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { db } from '../firebase'
import { t } from '../i18n'

const getPriorityLabel = (priority) => {
  if (priority === 'high') return t('tickets.priorityHigh')
  if (priority === 'low') return t('tickets.priorityLow')
  return t('tickets.priorityMedium')
}

const getTicketSortMs = (ticket) => {
  if (ticket?.updatedAt?.toMillis) return ticket.updatedAt.toMillis()
  if (ticket?.createdAt?.toMillis) return ticket.createdAt.toMillis()
  return 0
}

const getDueMeta = (dueDate) => {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null

  const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return { label: t('tickets.overdue'), className: 'ticket-due overdue' }
  if (diffDays === 0) return { label: t('tickets.dueToday'), className: 'ticket-due today' }
  if (diffDays === 1) return { label: t('tickets.dueTomorrow'), className: 'ticket-due' }
  return { label: due.toLocaleDateString(), className: 'ticket-due' }
}

const getTaskLinkMeta = (taskContext) => {
  if (!taskContext || taskContext.type !== 'utalando') return null
  const monthKey = taskContext.monthKey || ''
  return {
    label: t('tickets.taskUtalandoForMonth', { monthKey }),
    className: 'ticket-task-link',
  }
}

const getTaskFilterValue = (taskContext) => {
  if (!taskContext || !taskContext.type) return ''
  return `${taskContext.type}:${taskContext.monthKey || ''}`
}

function TicketsPage({ currentUser }) {
  const { data: tickets, error, loading } = useCollectionSubscription('tickets', (coll) =>
    query(coll, orderBy('createdAt', 'desc'))
  )
  const { profiles, profilesError } = useUserProfile()
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createClientName, setCreateClientName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createAssignee, setCreateAssignee] = useState(currentUser || '')
  const [createPriority, setCreatePriority] = useState('medium')
  const [createDueDate, setCreateDueDate] = useState('')
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [taskFilter, setTaskFilter] = useState('')
  const [clientFilter, setClientFilter] = useState({ id: '', name: '' })
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    if (selectedTicket) {
      const updated = tickets.find((ticket) => ticket.id === selectedTicket.id)
      if (updated) setSelectedTicket(updated)
    }
  }, [tickets, selectedTicket])

  useEffect(() => {
    const clientId = searchParams.get('clientId') || ''
    const clientName = searchParams.get('clientName') || ''
    if (clientId) {
      setClientFilter({ id: clientId, name: clientName })
    } else {
      setClientFilter({ id: '', name: '' })
    }
  }, [searchParams])

  useEffect(() => {
    const ticketId = searchParams.get('ticketId') || ''
    if (!ticketId) return
    const match = tickets.find((ticket) => ticket.id === ticketId)
    if (match) {
      setSelectedTicket(match)
    }
  }, [searchParams, tickets])

  const handleOpenCreate = () => {
    setCreateOpen(true)
    setCreateClientName('')
    setCreateDescription('')
    setCreateAssignee(currentUser || '')
    setCreatePriority('medium')
    setCreateDueDate('')
    setCreateError('')
  }

  const handleCloseCreate = () => {
    setCreateOpen(false)
    setCreateError('')
  }

  const handleCreateTicket = async () => {
    if (!createDescription.trim() || !createAssignee) {
      setCreateError(t('tickets.create.requiredError'))
      return
    }

    try {
      setCreateSaving(true)
      setCreateError('')
      await addDoc(collection(db, 'tickets'), {
        clientId: '',
        clientName: createClientName.trim() || t('tickets.unknownClient'),
        description: createDescription.trim(),
        status: t('tickets.open'),
        createdBy: currentUser || 'Ismeretlen',
        assignedTo: createAssignee,
        priority: createPriority || 'medium',
        dueDate: createDueDate || '',
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
        comments: [],
      })
      setCreateOpen(false)
      setCreateClientName('')
      setCreateDescription('')
      setCreateAssignee(currentUser || '')
      setCreatePriority('medium')
      setCreateDueDate('')
      setCreateError('')
    } catch (err) {
      setCreateError(err?.message || 'Ticket létrehozása sikertelen')
    } finally {
      setCreateSaving(false)
    }
  }

  const assigneeColors = useMemo(() => {
    const map = {}
    profiles.forEach((profile) => {
      const key = (profile.username || profile.email || '').trim().toLowerCase()
      if (key) map[key] = profile.themeColor || map[key]
    })
    return map
  }, [profiles])

  const assigneeOptions = useMemo(() => {
    const names = profiles
      .map((profile) => (profile.username || profile.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])

  const taskOptions = useMemo(() => {
    const map = new Map()
    tickets.forEach((ticket) => {
      const value = getTaskFilterValue(ticket.taskContext)
      if (!value) return
      const meta = getTaskLinkMeta(ticket.taskContext)
      if (!meta) return
      map.set(value, meta.label)
    })
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }))
  }, [tickets])

  const filteredTickets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return tickets
      .filter((ticket) => {
        const name = (ticket.clientName || '').toLowerCase()
        const desc = (ticket.description || '').toLowerCase()
        const statusText = ticket.resolved ? 'megoldva' : 'nyitott'
        const assignee = (ticket.assignedTo || '').toLowerCase()
        const priority = String(ticket.priority || 'medium').toLowerCase()

        const matchesSearch = !term || name.includes(term) || desc.includes(term) || statusText.includes(term)
        const matchesAssignee = assigneeFilter ? assignee === assigneeFilter.toLowerCase() : true
        const matchesStatus = statusFilter === '' ? true : statusFilter === 'open' ? !ticket.resolved : ticket.resolved
        const matchesPriority = priorityFilter ? priority === priorityFilter : true
        const matchesTask = taskFilter ? getTaskFilterValue(ticket.taskContext) === taskFilter : true
        const matchesClient = clientFilter.id ? String(ticket.clientId || '') === String(clientFilter.id) : true

        return matchesSearch && matchesAssignee && matchesStatus && matchesPriority && matchesTask && matchesClient
      })
      .sort((a, b) => {
        if (Boolean(a.resolved) !== Boolean(b.resolved)) return a.resolved ? 1 : -1
        return getTicketSortMs(b) - getTicketSortMs(a)
      })
  }, [tickets, searchTerm, assigneeFilter, statusFilter, priorityFilter, taskFilter, clientFilter])

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">{t('tickets.eyebrow')}</p>
            <h1 className="section-title">{t('tickets.title')}</h1>
            <p className="section-subtitle">{t('tickets.subtitle')}</p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner banner-error">
          {t('common.errorPrefix')} {error}
        </div>
      ) : null}
      {profilesError ? (
        <div className="banner banner-error">
          {t('common.errorPrefix')} {profilesError}
        </div>
      ) : null}

      <section className="content-grid">
        <div className="panel tickets-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{t('tickets.searchEyebrow')}</p>
              <h2>{t('tickets.allTickets')}</h2>
            </div>
            <div className="filter-bar">
              <button type="button" className="btn" onClick={handleOpenCreate}>
                {t('tickets.create.createButton')}
              </button>
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
                  title={t('tickets.clearClientFilterTitle')}
                >
                  {clientFilter.name || t('tickets.selectedClient')} ×
                </button>
              ) : null}
              <div className="input-shell search-field">
                <input
                  type="search"
                  placeholder={t('tickets.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <label className="filter-control">
                <span>{t('tickets.assignee')}</span>
                <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                  <option value="">{t('common.all')}</option>
                  {assigneeOptions.map((user) => {
                    const value = user.toLowerCase()
                    return (
                      <option key={user} value={value}>
                        {user}
                      </option>
                    )
                  })}
                </select>
              </label>
              <label className="filter-control">
                <span>{t('tickets.status')}</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">{t('common.all')}</option>
                  <option value="open">{t('tickets.open')}</option>
                  <option value="closed">{t('tickets.solved')}</option>
                </select>
              </label>
              <label className="filter-control">
                <span>{t('tickets.priority')}</span>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                  <option value="">{t('common.all')}</option>
                  <option value="high">{t('tickets.priorityHigh')}</option>
                  <option value="medium">{t('tickets.priorityMedium')}</option>
                  <option value="low">{t('tickets.priorityLow')}</option>
                </select>
              </label>
              <label className="filter-control">
                <span>{t('tickets.taskLink')}</span>
                <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
                  <option value="">{t('common.all')}</option>
                  {taskOptions.map((taskOption) => (
                    <option key={taskOption.value} value={taskOption.value}>
                      {taskOption.label}
                    </option>
                  ))}
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
                {filteredTickets.map((ticket) => {
                  const accent = assigneeColors[(ticket.assignedTo || '').trim().toLowerCase()]
                  const priorityValue = ticket.priority || 'medium'
                  const dueMeta = getDueMeta(ticket.dueDate)
                  const taskLinkMeta = getTaskLinkMeta(ticket.taskContext)
                  return (
                    <div
                      key={ticket.id}
                      className="ticket-row clickable"
                      style={accent ? { '--ticket-accent': accent } : undefined}
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <div className="ticket-head">
                        <div className="ticket-client">{ticket.clientName || t('tickets.unknownClient')}</div>
                        <div className={`ticket-status ${ticket.resolved ? 'is-resolved' : 'is-open'}`}>
                          {ticket.resolved ? t('tickets.solved') : t('tickets.open')}
                        </div>
                      </div>
                      <div className="ticket-desc">{ticket.description || t('tickets.noDescription')}</div>
                      <div className="ticket-meta">
                        <span>{ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : t('tickets.noDate')}</span>
                        {ticket.clientId ? <span className="muted">{t('tickets.idPrefix')} {ticket.clientId}</span> : null}
                        {ticket.assignedTo ? <span className="muted">{t('tickets.assigneePrefix')} {ticket.assignedTo}</span> : null}
                        <span className={`ticket-priority ${priorityValue}`}>{getPriorityLabel(priorityValue)}</span>
                        {dueMeta ? (
                          <span className={dueMeta.className}>
                            {t('tickets.dueDatePrefix')} {dueMeta.label}
                          </span>
                        ) : null}
                        {taskLinkMeta ? (
                          <span className={taskLinkMeta.className}>
                            {t('tickets.taskLinkPrefix')} {taskLinkMeta.label}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
                {!filteredTickets.length ? <p className="muted">{t('tickets.noTickets')}</p> : null}
              </>
            )}
          </div>
        </div>
      </section>

      {selectedTicket ? (
        <Modal onClose={() => setSelectedTicket(null)} title={t('tickets.detailsTitle')}>
          <TicketModal
            ticket={selectedTicket}
            onClose={() => setSelectedTicket(null)}
            currentUser={currentUser}
            assigneeOptions={assigneeOptions}
          />
        </Modal>
      ) : null}

      {createOpen ? (
        <TicketCreateModal
          client={null}
          clientName={createClientName}
          onChangeClientName={setCreateClientName}
          allowClientEdit
          description={createDescription}
          onChangeDescription={setCreateDescription}
          assignedTo={createAssignee}
          onChangeAssignedTo={setCreateAssignee}
          priority={createPriority}
          onChangePriority={setCreatePriority}
          dueDate={createDueDate}
          onChangeDueDate={setCreateDueDate}
          currentUser={currentUser}
          assigneeOptions={assigneeOptions}
          saving={createSaving}
          error={createError}
          onCancel={handleCloseCreate}
          onSubmit={handleCreateTicket}
        />
      ) : null}
    </main>
  )
}

export default TicketsPage
