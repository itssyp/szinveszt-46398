import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbAlertTriangle, TbCircleCheck, TbPlus } from 'react-icons/tb'
import { addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { useClientsCache } from '../hooks/useClientsCache'
import Modal from '../components/Modal'
import TicketCreateModal from '../components/TicketCreateModal'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../firebase'
import { logClientActivity } from '../utils/clientActivity'
import { i18n, t } from '../i18n'

const MONTH_LABELS = i18n.tasks.months.full

const TASK_DEFINITIONS = [
  {
    id: 'utalando',
    label: i18n.tasks.detail.task.utalando.label,
    description: i18n.tasks.detail.task.utalando.description,
  },
]

function MonthlyTaskDetailPage() {
  const navigate = useNavigate()
  const { year, month } = useParams()
  const { clients, loading, error } = useClientsCache()
  const { user } = useAuth()
  const { profile, profiles } = useUserProfile()
  const [updatingId, setUpdatingId] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [notifiedMap, setNotifiedMap] = useState({})
  const [nullasMap, setNullasMap] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [nullasFilter, setNullasFilter] = useState('')
  const [taskIds, setTaskIds] = useState([])
  const [taskCatalogOpen, setTaskCatalogOpen] = useState(false)
  const [savingTasks, setSavingTasks] = useState(false)
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState('')
  const [ticketPriority, setTicketPriority] = useState('medium')
  const [ticketDueDate, setTicketDueDate] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')

  const monthIndex = Number(month) - 1
  const monthLabel = useMemo(() => MONTH_LABELS[monthIndex] || `Month ${month}`, [monthIndex, month])
  const normalizedMonth = String(month).padStart(2, '0')
  const notificationKey = `${year}-${normalizedMonth}`
  const [isClosed, setIsClosed] = useState(false)
  const isUtalandoEnabled = taskIds.includes('utalando')
  const isQuarterMonth = useMemo(() => new Set([3, 6, 9, 12]).has(Number(month)), [month])
  const actorName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return 'Ismeretlen'
  }, [profile, user])

  const assignableTasks = useMemo(
    () => TASK_DEFINITIONS.filter((task) => !taskIds.includes(task.id)),
    [taskIds]
  )

  const utalandoClients = useMemo(() => {
    if (!isUtalandoEnabled) return []

    const isMonthlyFrequency = (value) => {
      const raw = String(value || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim()
      return raw === 'havi' || raw === 'havonta' || raw === 'monthly'
    }

    return clients
      .filter((client) => {
        const debt = Number(client.billingoDebt || 0)
        if (debt !== 0) return false
        if (isQuarterMonth) return true
        return isMonthlyFrequency(client.utalandoGyakorisag)
      })
      .sort((a, b) => (a.nev || '').localeCompare(b.nev || '', 'hu'))
  }, [clients, isUtalandoEnabled, isQuarterMonth])

  const assigneeOptions = useMemo(() => {
    const names = new Set()
    utalandoClients.forEach((client) => {
      if (client.hozzarendeltSzemely) names.add(client.hozzarendeltSzemely)
    })
    return Array.from(names)
  }, [utalandoClients])
  const ticketAssigneeOptions = useMemo(() => {
    const names = (profiles || [])
      .map((entry) => (entry.username || entry.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])

  const assigneeColors = useMemo(() => {
    const map = {}
    profiles.forEach((profile) => {
      const key = (profile.username || profile.email || '').trim().toLowerCase()
      if (key) map[key] = profile.themeColor || map[key]
    })
    return map
  }, [profiles])

  const filteredUtalandoClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return utalandoClients.filter((client) => {
      const name = (client.nev || '').toLowerCase()
      const assignee = (client.hozzarendeltSzemely || '').toLowerCase()
      const notified = Boolean(notifiedMap[client.id])
      const nullas = Boolean(nullasMap[client.id])
      const matchesName = !term || name.includes(term)
      const matchesAssignee = assigneeFilter ? assignee === assigneeFilter.toLowerCase() : true
      const matchesStatus =
        statusFilter === '' ? true : statusFilter === 'sent' ? notified : !notified
      const matchesNullas = nullasFilter === '' ? true : nullasFilter === 'yes' ? nullas : !nullas

      return matchesName && matchesAssignee && matchesStatus && matchesNullas
    })
  }, [
    utalandoClients,
    searchTerm,
    assigneeFilter,
    statusFilter,
    nullasFilter,
    notifiedMap,
    nullasMap,
  ])

  const utalandoProgress = useMemo(() => {
    const total = utalandoClients.length
    if (!total) return { total: 0, notified: 0, percent: 0 }
    const notified = utalandoClients.filter((client) => Boolean(notifiedMap[client.id])).length
    const percent = Math.round((notified / total) * 100)
    return { total, notified, percent }
  }, [utalandoClients, notifiedMap])

  useEffect(() => {
    const monthRef = doc(db, 'monthTasks', notificationKey)
    const unsubMonth = onSnapshot(monthRef, (snap) => {
      const data = snap.data() || {}
      setIsClosed(Boolean(data.closed))

      if (Array.isArray(data.taskIds)) {
        setTaskIds(data.taskIds.filter((value) => typeof value === 'string'))
        return
      }

      // Backward compatibility: February previously had this task by default.
      setTaskIds(normalizedMonth === '02' ? ['utalando'] : [])
    })

    return () => {
      unsubMonth()
    }
  }, [notificationKey, normalizedMonth])

  useEffect(() => {
    if (!isUtalandoEnabled) {
      setNotifiedMap({})
      setNullasMap({})
      return
    }

    const notifiedRef = collection(db, 'monthTasks', notificationKey, 'utalando')
    const unsubNotified = onSnapshot(notifiedRef, (snap) => {
      const next = {}
      const nextNullas = {}
      snap.forEach((docSnap) => {
        const data = docSnap.data()
        next[docSnap.id] = Boolean(data?.notified)
        nextNullas[docSnap.id] = Boolean(data?.nullas)
      })
      setNotifiedMap(next)
      setNullasMap(nextNullas)
    })

    return () => {
      unsubNotified()
    }
  }, [isUtalandoEnabled, notificationKey])

  const handleNotifyToggle = async (clientId, nextValue) => {
    setUpdateError('')
    setUpdatingId(clientId)
    try {
      await setDoc(
        doc(db, 'monthTasks', notificationKey, 'utalando', clientId),
        {
          notified: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } catch (err) {
      setUpdateError(err?.message || t('tasks.detail.errors.notifySave'))
    } finally {
      setUpdatingId('')
    }
  }

  const handleNullasToggle = async (clientId, nextValue) => {
    setUpdateError('')
    setUpdatingId(clientId)
    try {
      await setDoc(
        doc(db, 'monthTasks', notificationKey, 'utalando', clientId),
        {
          nullas: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } catch (err) {
      setUpdateError(err?.message || t('tasks.detail.errors.nullasSave'))
    } finally {
      setUpdatingId('')
    }
  }

  const persistMonthMeta = async (nextTaskIds, nextClosed = isClosed) => {
    await setDoc(
      doc(db, 'monthTasks', notificationKey),
      {
        closed: nextClosed,
        taskIds: nextTaskIds,
        year: Number(year),
        month: Number(normalizedMonth),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  const handleAddTask = async (taskId) => {
    if (!taskId || taskIds.includes(taskId)) return
    const nextTaskIds = Array.from(new Set([...taskIds, taskId]))
    setSavingTasks(true)
    setUpdateError('')
    try {
      await persistMonthMeta(nextTaskIds)
      setTaskIds(nextTaskIds)
      setTaskCatalogOpen(false)
    } catch (err) {
      setUpdateError(err?.message || t('tasks.detail.errors.addTask'))
    } finally {
      setSavingTasks(false)
    }
  }

  const handleCloseToggle = () => {
    const nextClosed = !isClosed
    setIsClosed(nextClosed)
    persistMonthMeta(taskIds, nextClosed).catch((err) => {
      setUpdateError(err?.message || t('tasks.detail.errors.monthSave'))
      setIsClosed(!nextClosed)
    })
  }

  const handleOpenTicketModal = (client) => {
    setTicketClient(client)
    setTicketDescription('')
    setTicketAssignee(actorName || '')
    setTicketPriority('medium')
    setTicketDueDate('')
    setTicketError('')
  }

  const handleCreateTicket = async () => {
    if (!ticketClient) return
    if (!ticketDescription.trim() || !ticketAssignee) {
      setTicketError(t('tickets.create.requiredError'))
      return
    }

    try {
      setTicketSaving(true)
      setTicketError('')
      const ref = await addDoc(collection(db, 'tickets'), {
        clientId: ticketClient.id,
        clientName: ticketClient.nev || t('tickets.unknownClient'),
        description: ticketDescription.trim(),
        status: t('tickets.open'),
        createdBy: actorName || 'Ismeretlen',
        assignedTo: ticketAssignee,
        priority: ticketPriority || 'medium',
        dueDate: ticketDueDate || '',
        taskContext: {
          type: 'utalando',
          monthKey: notificationKey,
        },
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actorName || 'Ismeretlen',
        comments: [],
      })
      await logClientActivity({
        clientId: ticketClient.id,
        type: 'ticket_created',
        message: `Ticket: ${ticketDescription.trim().slice(0, 80)}`,
        meta: { ticketId: ref.id, assignedTo: ticketAssignee },
        actor: actorName || 'Ismeretlen',
      })
      setTicketClient(null)
    } catch (err) {
      setTicketError(err?.message || 'Ticket létrehozása sikertelen')
    } finally {
      setTicketSaving(false)
    }
  }

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <button type="button" className="back-arrow" onClick={() => navigate(-1)}>
            {'<'}
          </button>
          <div className="section-header__intro">
            <p className="eyebrow">{t('tasks.detail.eyebrow')}</p>
            <h1 className="section-title">
              {monthLabel} {year}
            </h1>
            <p className="section-subtitle">{t('tasks.detail.subtitle')}</p>
          </div>
        </div>
      </header>

      <section className="panel task-month-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{t('tasks.detail.focusEyebrow')}</p>
            <h2>{monthLabel} feladatai</h2>
          </div>
          <div className="section-actions">
            <span className={`pill ${isClosed ? 'pill-active' : 'pill-quiet'}`}>
              {isClosed ? t('tasks.detail.monthClosed') : t('tasks.detail.monthOpen')}
            </span>
            <button type="button" className="btn ghost" onClick={handleCloseToggle}>
              {isClosed ? t('tasks.detail.openMonth') : t('tasks.detail.closeMonth')}
            </button>
            <span className="pill pill-quiet">
              {taskIds.length} {t('tasks.detail.tasksCount')}
            </span>
          </div>
        </div>

        <div className="task-catalog-launch">
          <button
            type="button"
            className="btn"
            onClick={() => setTaskCatalogOpen(true)}
            disabled={savingTasks || !assignableTasks.length}
          >
            <TbPlus />
            {assignableTasks.length ? t('tasks.detail.addTask') : t('tasks.detail.noMoreTask')}
          </button>
          <span className="muted">
            {assignableTasks.length
              ? t('tasks.detail.taskCatalogHelp')
              : t('tasks.detail.noMoreTask')}
          </span>
        </div>

        {taskIds.length ? (
          <div className="task-pill-row">
            {taskIds.map((taskId) => {
              const task = TASK_DEFINITIONS.find((item) => item.id === taskId)
              return (
                <span key={taskId} className="pill">
                  {task?.label || taskId}
                </span>
              )
            })}
          </div>
        ) : null}

        {error ? (
          <div className="banner banner-error">
            {t('common.errorPrefix')} {error}
          </div>
        ) : null}
        {updateError ? (
          <div className="banner banner-error">
            {t('common.errorPrefix')} {updateError}
          </div>
        ) : null}
        {loading ? <p className="muted">{t('tasks.detail.loadingData')}</p> : null}

        {isUtalandoEnabled ? (
          <>
            {!loading && !utalandoClients.length ? (
              <p className="muted">{t('tasks.detail.noClientsToNotify')}</p>
            ) : null}

            {!loading && utalandoClients.length ? (
              <div className="utalando-progress">
                <div className="utalando-progress__row">
                  <span>
                    {t('tasks.detail.progressSent')}: {utalandoProgress.notified}/{utalandoProgress.total}
                  </span>
                  <span>{utalandoProgress.percent}%</span>
                </div>
                <div className="utalando-progress__bar">
                  <div className="utalando-progress__fill" style={{ width: `${utalandoProgress.percent}%` }} />
                </div>
              </div>
            ) : null}

            {!loading && utalandoClients.length ? (
              <div className="filter-bar utalando-filters">
                <div className="input-shell search-field">
                  <input
                    type="search"
                    placeholder={t('tasks.detail.filters.searchByName')}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <label className="filter-control">
                  <span>{t('tasks.detail.filters.assignee')}</span>
                  <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                    <option value="">{t('common.all')}</option>
                    {assigneeOptions.map((name) => (
                      <option key={name} value={name.toLowerCase()}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="filter-control">
                  <span>{t('tasks.detail.filters.status')}</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="">{t('common.all')}</option>
                    <option value="sent">{t('tasks.detail.sent')}</option>
                    <option value="pending">{t('tasks.detail.filters.pending')}</option>
                  </select>
                </label>
                <label className="filter-control">
                  <span>{t('tasks.detail.filters.nullas')}</span>
                  <select value={nullasFilter} onChange={(event) => setNullasFilter(event.target.value)}>
                    <option value="">{t('common.all')}</option>
                    <option value="yes">{t('tasks.detail.nullas')}</option>
                    <option value="no">{t('tasks.detail.nonNullas')}</option>
                  </select>
                </label>
              </div>
            ) : null}

            {!loading && utalandoClients.length && !filteredUtalandoClients.length ? (
              <p className="muted">{t('tasks.detail.noFilterMatch')}</p>
            ) : null}

            {!loading && utalandoClients.length ? (
              <div className="ticket-list utalando-list">
                {filteredUtalandoClients.map((client) => {
                  const notified = Boolean(notifiedMap[client.id])
                  const nullas = Boolean(nullasMap[client.id])
                  const frequency = client.utalandoGyakorisag || t('tasks.detail.noFrequency')
                  const accent = assigneeColors[(client.hozzarendeltSzemely || '').trim().toLowerCase()]

                  return (
                    <div
                      key={client.id}
                      className="ticket-row debt-row utalando-row"
                      style={accent ? { '--ticket-accent': accent } : undefined}
                    >
                      <div className="ticket-head">
                        <div className="ticket-client">{client.nev || t('tasks.detail.unknownClient')}</div>
                        <button
                          type="button"
                          className="ticket-flag utalando-ticket-flag"
                          title={t('tasks.detail.raiseTicket')}
                          aria-label={t('tasks.detail.raiseTicket')}
                          onClick={() => handleOpenTicketModal(client)}
                        >
                          <TbAlertTriangle aria-hidden="true" />
                        </button>
                      </div>
                      <div className="ticket-meta">
                        {client.adoszam ? <span className="muted">{t('tasks.detail.taxPrefix')} {client.adoszam}</span> : null}
                        {client.email ? <span className="muted">{t('tasks.detail.emailPrefix')} {client.email}</span> : null}
                        {client.hozzarendeltSzemely ? (
                          <span className="muted">{t('tasks.detail.assigneePrefix')} {client.hozzarendeltSzemely}</span>
                        ) : null}
                        <span className="muted">{t('tasks.detail.frequencyPrefix')} {frequency}</span>
                      </div>
                      <div className="utalando-actions">
                        <label className="switch utalando-switch">
                          <input
                            type="checkbox"
                            checked={notified}
                            onChange={(event) => handleNotifyToggle(client.id, event.target.checked)}
                            disabled={updatingId === client.id}
                          />
                          <span className="switch-slider" />
                        </label>
                        <span className={`pill ${notified ? 'pill-active' : 'pill-quiet'}`}>
                          {notified ? t('tasks.detail.sent') : t('tasks.detail.notSent')}
                        </span>
                        <label className="switch utalando-switch">
                          <input
                            type="checkbox"
                            checked={nullas}
                            onChange={(event) => handleNullasToggle(client.id, event.target.checked)}
                            disabled={updatingId === client.id}
                          />
                          <span className="switch-slider" />
                        </label>
                        <span className={`pill ${nullas ? 'pill-active' : 'pill-quiet'}`}>
                          {nullas ? t('tasks.detail.nullas') : t('tasks.detail.nonNullas')}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">{t('tasks.detail.noActiveTask')}</p>
        )}
      </section>

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
          currentUser={actorName}
          assigneeOptions={ticketAssigneeOptions}
          saving={ticketSaving}
          error={ticketError}
          onCancel={() => setTicketClient(null)}
          onSubmit={handleCreateTicket}
        />
      ) : null}

      {taskCatalogOpen ? (
        <Modal title={t('tasks.detail.taskCatalogTitle')} onClose={() => setTaskCatalogOpen(false)}>
          <div className="task-catalog">
            <p className="muted">{t('tasks.detail.taskCatalogHelp')}</p>
            <div className="task-catalog__grid">
              {TASK_DEFINITIONS.map((task) => {
                const isAdded = taskIds.includes(task.id)
                return (
                  <article key={task.id} className={`task-catalog-card${isAdded ? ' is-added' : ''}`}>
                    <div className="task-catalog-card__head">
                      <h3>{task.label}</h3>
                      {isAdded ? (
                        <span className="pill pill-active">
                          <TbCircleCheck />
                          {t('tasks.detail.taskAdded')}
                        </span>
                      ) : null}
                    </div>
                    <p>{task.description}</p>
                    <div className="task-catalog-card__actions">
                      <button
                        type="button"
                        className={`btn ${isAdded ? 'ghost' : ''}`}
                        onClick={() => handleAddTask(task.id)}
                        disabled={isAdded || savingTasks}
                      >
                        {savingTasks && !isAdded ? t('tasks.detail.saving') : isAdded ? t('tasks.detail.taskAdded') : t('tasks.detail.add')}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </Modal>
      ) : null}
    </main>
  )
}

export default MonthlyTaskDetailPage
