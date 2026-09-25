import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbAlertCircle, TbAlertTriangle, TbChevronDown, TbChevronUp, TbCircleCheck, TbPlus, TbUserOff } from 'react-icons/tb'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { useClientsCache } from '../hooks/useClientsCache'
import useCollectionSubscription from '../hooks/useCollectionSubscription'
import Modal from '../components/Modal'
import TicketCreateModal from '../components/TicketCreateModal'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../firebase'
import { createTicket } from '../services/tickets'
import { logClientActivity } from '../utils/clientActivity'
import { normalizeTaxId } from '../utils/id'
import { exportUtalandoClientsToExcel } from '../utils/clientExport'
import { buildUserIdentitySet } from '../utils/userIdentity'
import { i18n, t } from '../i18n'

const MONTH_LABELS = i18n.tasks.months.full

function getTicketSortMs(ticket) {
  if (ticket?.updatedAt?.toMillis) return ticket.updatedAt.toMillis()
  if (ticket?.createdAt?.toMillis) return ticket.createdAt.toMillis()
  return 0
}

function normalizeIsoDate(value) {
  if (!value) return ''
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    const tsDate = value.toDate()
    return Number.isNaN(tsDate?.getTime?.()) ? '' : normalizeIsoDate(tsDate)
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : normalizeIsoDate(date)
  }
  const raw = String(value).trim()
  if (!raw) return ''
  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (directMatch) return raw
  const ymdMatch = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (ymdMatch) {
    const year = Number(ymdMatch[1])
    const month = String(Number(ymdMatch[2])).padStart(2, '0')
    const day = String(Number(ymdMatch[3])).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const dmyMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmyMatch) {
    const year = Number(dmyMatch[3])
    const month = String(Number(dmyMatch[2])).padStart(2, '0')
    const day = String(Number(dmyMatch[1])).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDateInMonth(value, monthKey) {
  const iso = normalizeIsoDate(value)
  return Boolean(iso && iso.startsWith(`${monthKey}-`))
}

function getNextMonthStartIso(year, monthValue) {
  const yearNum = Number(year)
  const monthNum = Number(monthValue)
  const firstDate = new Date(yearNum, monthNum, 1)
  const isoYear = firstDate.getFullYear()
  const isoMonth = String(firstDate.getMonth() + 1).padStart(2, '0')
  const isoDay = String(firstDate.getDate()).padStart(2, '0')
  return `${isoYear}-${isoMonth}-${isoDay}`
}

function hasBlockingDebtForMonth(client, nextMonthStartIso) {
  const debt = Number(client?.billingoDebt || 0)
  if (debt <= 0) return false
  const earliestDueDate = normalizeIsoDate(client?.billingoDebtEarliestDueDate)
  if (!earliestDueDate) return true
  return earliestDueDate < nextMonthStartIso
}

function normalizeUtalandoFrequency(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
    .trim()
}

function isMonthlyUtalandoFrequency(value) {
  const raw = normalizeUtalandoFrequency(value)
  return raw === 'havi' || raw === 'havonta' || raw === 'monthly'
}

function normalizeClientStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
    .trim()
}

function isCancelledClientStatus(value) {
  const statusNorm = normalizeClientStatus(value)
  return statusNorm.startsWith('lemondta') || statusNorm.startsWith('kirugva')
}

function getQuarterStartIso(year, monthValue) {
  const yearNum = Number(year)
  const quarterEndMonthIndex = Number(monthValue) - 1
  const quarterStartDate = new Date(yearNum, quarterEndMonthIndex - 2, 1)
  const isoYear = quarterStartDate.getFullYear()
  const isoMonth = String(quarterStartDate.getMonth() + 1).padStart(2, '0')
  const isoDay = String(quarterStartDate.getDate()).padStart(2, '0')
  return `${isoYear}-${isoMonth}-${isoDay}`
}

function isDateWithinRange(value, startIso, endIsoExclusive) {
  const iso = normalizeIsoDate(value)
  return Boolean(iso && iso >= startIso && iso < endIsoExclusive)
}

function isQuarterMonthUtalandoClient(client, notificationKey, quarterStartIso, nextMonthStartIso) {
  if (isDateInMonth(client.megszunesDatuma, notificationKey)) return true

  const statusNorm = normalizeClientStatus(client.statusz)
  if (statusNorm.startsWith('aktiv')) return true

  if (statusNorm.startsWith('szunet')) {
    return isDateWithinRange(client.szunetKezdete, quarterStartIso, nextMonthStartIso)
  }

  return false
}

function isNormalMonthUtalandoClient(client, notificationKey, monthStartIso) {
  if (isDateInMonth(client.megszunesDatuma, notificationKey)) return true
  if (!isMonthlyUtalandoFrequency(client.utalandoGyakorisag)) return false

  const endDate = normalizeIsoDate(client.megszunesDatuma)
  if (endDate && endDate < monthStartIso) return false

  const breakStartDate = normalizeIsoDate(client.szunetKezdete)
  if (breakStartDate && breakStartDate <= monthStartIso) return false

  return true
}

function isUtalandoClientEligible(client, { isQuarterMonth, notificationKey, monthStartIso, quarterStartIso, nextMonthStartIso }) {
  if (!isQuarterMonth && isCancelledClientStatus(client.statusz)) return false
  if (isDateInMonth(client.megszunesDatuma, notificationKey)) return true
  if (isQuarterMonth) {
    return isQuarterMonthUtalandoClient(client, notificationKey, quarterStartIso, nextMonthStartIso)
  }
  return isNormalMonthUtalandoClient(client, notificationKey, monthStartIso)
}

function formatDebtAmount(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  const hasFraction = Math.round(amount) !== amount
  return `${amount.toLocaleString('hu-HU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  })} Ft`
}

function getVisibleUtalandoExceptionItems(items, searchTerm) {
  const term = String(searchTerm || '').trim().toLowerCase()
  if (!term) return items
  return items.filter(({ client }) => {
    const name = String(client?.nev || '').toLowerCase()
    const taxId = String(client?.adoszam || '').toLowerCase()
    return name.includes(term) || taxId.includes(term)
  })
}

function ExceptionPicker({
  open,
  onToggleOpen,
  items,
  searchTerm,
  onSearchChange,
  selectedIds,
  onToggleSelection,
  onAddSelected,
  saving,
  description,
  addButtonLabel,
}) {
  const visibleItems = useMemo(() => getVisibleUtalandoExceptionItems(items, searchTerm), [items, searchTerm])

  return (
    <div className="exception-picker">
      <button
        type="button"
        className="btn ghost exception-picker__toggle"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Kivétel hozzáadása"
        title="Kivétel hozzáadása"
      >
        +
      </button>

      {open ? (
        <div className="exception-picker__menu">
          <div className="details-header">
            <div>
              <h3 style={{ margin: 0 }}>Kivétel hozzáadása</h3>
              <p className="muted" style={{ margin: '6px 0 0' }}>
                {description}
              </p>
            </div>
            <span className="pill">{items.length} kizárt ügyfél</span>
          </div>

          {items.length ? (
            <>
              <input
                type="text"
                className="input"
                placeholder="Keresés a kizárt ügyfelek között..."
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 8 }}>
                {visibleItems.length ? (
                  visibleItems.map(({ client, exclusionReason }) => {
                    const isSelected = selectedIds.includes(client.id)
                    return (
                      <button
                        key={client.id}
                        type="button"
                        className="btn ghost"
                        onClick={() => onToggleSelection(client.id)}
                        style={{
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          padding: 12,
                          display: 'grid',
                          gap: 4,
                          borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                          background: isSelected ? 'var(--accent-soft)' : '#fff',
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{client.nev || 'Név hiányzik'}</span>
                        <span className="muted" style={{ fontSize: '0.85rem' }}>{client.adoszam || '-'}</span>
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          {exclusionReason || 'A jelenlegi szabályok miatt kimarad a listából.'}
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Nincs találat a kizárt ügyfelek között.</p>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="muted">
                  {selectedIds.length ? `${selectedIds.length} kijelölt ügyfél` : 'Nincs kijelölt ügyfél'}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn ghost" onClick={onToggleOpen} disabled={saving}>
                    Mégse
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={onAddSelected}
                    disabled={!selectedIds.length || saving}
                  >
                    {saving ? 'Hozzáadás...' : addButtonLabel}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Jelenleg nincs kizárt ügyfél, akit kivételként fel lehetne venni.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

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
  const { data: tickets, error: ticketsError } = useCollectionSubscription('tickets', (coll) =>
    query(coll, orderBy('createdAt', 'desc'))
  )
  const { user } = useAuth()
  const { profile, profiles } = useUserProfile()
  const [updatingId, setUpdatingId] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [notifiedMap, setNotifiedMap] = useState({})
  const [nullasMap, setNullasMap] = useState({})
  const [beadas58Map, setBeadas58Map] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [nullasFilter, setNullasFilter] = useState('')
  const [beadas58Filter, setBeadas58Filter] = useState('')
  const [taskIds, setTaskIds] = useState([])
  const [taskCatalogOpen, setTaskCatalogOpen] = useState(false)
  const [showDebtExcluded, setShowDebtExcluded] = useState(false)
  const [manualExceptionClientIds, setManualExceptionClientIds] = useState([])
  const [manualExclusionClientIds, setManualExclusionClientIds] = useState([])
  const [exceptionPickerOpen, setExceptionPickerOpen] = useState(false)
  const [exceptionSearchTerm, setExceptionSearchTerm] = useState('')
  const [selectedExceptionIds, setSelectedExceptionIds] = useState([])
  const [exceptionSaving, setExceptionSaving] = useState(false)
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
  const monthStartIso = `${notificationKey}-01`
  const nextMonthStartIso = useMemo(() => getNextMonthStartIso(year, normalizedMonth), [year, normalizedMonth])
  const quarterStartIso = useMemo(
    () => getQuarterStartIso(year, normalizedMonth),
    [year, normalizedMonth]
  )
  const [isClosed, setIsClosed] = useState(false)
  const [lockedUtalandoClientIds, setLockedUtalandoClientIds] = useState(null)
  const isUtalandoEnabled = taskIds.includes('utalando')
  const isQuarterMonth = useMemo(() => new Set([3, 6, 9, 12]).has(Number(month)), [month])
  const manualExceptionIdSet = useMemo(() => new Set(manualExceptionClientIds), [manualExceptionClientIds])
  const manualExclusionIdSet = useMemo(() => new Set(manualExclusionClientIds), [manualExclusionClientIds])
  const actorName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return 'Ismeretlen'
  }, [profile, user])
  const userIdentitySet = useMemo(() => buildUserIdentitySet(user, profile), [user, profile])

  const assignableTasks = useMemo(
    () => TASK_DEFINITIONS.filter((task) => !taskIds.includes(task.id)),
    [taskIds]
  )

  const liveUtalandoClients = useMemo(() => {
    if (!isUtalandoEnabled) return []

    return clients
      .filter((client) => {
        if (manualExclusionIdSet.has(client.id)) return false
        if (manualExceptionIdSet.has(client.id)) return true
        if (hasBlockingDebtForMonth(client, nextMonthStartIso)) return false
        return isUtalandoClientEligible(client, {
          isQuarterMonth,
          notificationKey,
          monthStartIso,
          quarterStartIso,
          nextMonthStartIso,
        })
      })
      .sort((a, b) => (a.nev || '').localeCompare(b.nev || '', 'hu'))
  }, [clients, isUtalandoEnabled, isQuarterMonth, manualExceptionIdSet, manualExclusionIdSet, monthStartIso, nextMonthStartIso, notificationKey, quarterStartIso])

  const debtExcludedUtalandoClients = useMemo(() => {
    if (!isUtalandoEnabled) return []

    return clients
      .filter((client) => {
        if (manualExclusionIdSet.has(client.id)) return false
        if (manualExceptionIdSet.has(client.id)) return false
        if (!hasBlockingDebtForMonth(client, nextMonthStartIso)) return false
        return isUtalandoClientEligible(client, {
          isQuarterMonth,
          notificationKey,
          monthStartIso,
          quarterStartIso,
          nextMonthStartIso,
        })
      })
      .sort((a, b) => (a.nev || '').localeCompare(b.nev || '', 'hu'))
  }, [clients, isUtalandoEnabled, isQuarterMonth, manualExceptionIdSet, manualExclusionIdSet, monthStartIso, nextMonthStartIso, notificationKey, quarterStartIso])

  const excludedUtalandoCandidates = useMemo(() => {
    if (!isUtalandoEnabled) return []

    return clients
      .filter((client) => !manualExceptionIdSet.has(client.id))
      .map((client) => {
        if (manualExclusionIdSet.has(client.id)) {
          return { client, exclusionReason: 'Kézzel kizárva az utalandók közül.' }
        }
        const hasBlockingDebt = hasBlockingDebtForMonth(client, nextMonthStartIso)
        const eligibleByRules = isUtalandoClientEligible(client, {
          isQuarterMonth,
          notificationKey,
          monthStartIso,
          quarterStartIso,
          nextMonthStartIso,
        })
        if (!hasBlockingDebt && eligibleByRules) return null

        let exclusionReason = ''
        if (hasBlockingDebt) {
          exclusionReason = 'A jelenlegi Billingo tartozás miatt kimarad a listából.'
        } else if (!isQuarterMonth) {
          exclusionReason = 'A jelenlegi havi szabályok szerint nem kerül be a listába.'
        } else {
          exclusionReason = 'A jelenlegi negyedéves szabályok szerint nem kerül be a listába.'
        }

        return { client, exclusionReason }
      })
      .filter(Boolean)
      .sort((a, b) => (a.client?.nev || '').localeCompare(b.client?.nev || '', 'hu'))
  }, [clients, isQuarterMonth, isUtalandoEnabled, manualExceptionIdSet, manualExclusionIdSet, monthStartIso, nextMonthStartIso, notificationKey, quarterStartIso])

  const utalandoClients = useMemo(() => {
    if (!isUtalandoEnabled) return []
    if (!isClosed || !Array.isArray(lockedUtalandoClientIds)) return liveUtalandoClients
    const byClientId = new Map(clients.map((client) => [client.id, client]))
    return lockedUtalandoClientIds
      .map((clientId) => byClientId.get(clientId))
      .filter(Boolean)
      .sort((a, b) => (a.nev || '').localeCompare(b.nev || '', 'hu'))
  }, [clients, isClosed, isUtalandoEnabled, liveUtalandoClients, lockedUtalandoClientIds])

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
      const beadva58 = Boolean(beadas58Map[client.id])
      const matchesName = !term || name.includes(term)
      const matchesAssignee = assigneeFilter ? assignee === assigneeFilter.toLowerCase() : true
      const matchesStatus =
        statusFilter === '' ? true : statusFilter === 'sent' ? notified : !notified
      const matchesNullas = nullasFilter === '' ? true : nullasFilter === 'yes' ? nullas : !nullas
      const matchesBeadas58 =
        !isQuarterMonth || beadas58Filter === '' ? true : beadas58Filter === 'yes' ? beadva58 : !beadva58

      return matchesName && matchesAssignee && matchesStatus && matchesNullas && matchesBeadas58
    })
  }, [
    utalandoClients,
    searchTerm,
    assigneeFilter,
    statusFilter,
    nullasFilter,
    beadas58Filter,
    isQuarterMonth,
    notifiedMap,
    nullasMap,
    beadas58Map,
  ])

  const openUtalandoTicketByClient = useMemo(() => {
    const next = {}
    tickets.forEach((ticket) => {
      if (ticket.resolved) return
      if (ticket.taskContext?.type !== 'utalando') return
      if (ticket.taskContext?.monthKey !== notificationKey) return
      const clientId = String(ticket.clientId || '')
      if (!clientId) return
      const current = next[clientId]
      if (!current || getTicketSortMs(ticket) > getTicketSortMs(current)) {
        next[clientId] = ticket
      }
    })
    return next
  }, [tickets, notificationKey])

  const utalandoProgress = useMemo(() => {
    const total = utalandoClients.length
    if (!total) return { total: 0, done: 0, percent: 0 }
    const done = utalandoClients.filter(
      (client) => Boolean(notifiedMap[client.id]) || Boolean(nullasMap[client.id])
    ).length
    const percent = Math.round((done / total) * 100)
    return { total, done, percent }
  }, [utalandoClients, notifiedMap, nullasMap])

  const beadas58Progress = useMemo(() => {
    const total = utalandoClients.length
    if (!total || !isQuarterMonth) return { total: 0, done: 0, percent: 0 }
    const done = utalandoClients.filter((client) => Boolean(beadas58Map[client.id])).length
    const percent = Math.round((done / total) * 100)
    return { total, done, percent }
  }, [utalandoClients, isQuarterMonth, beadas58Map])

  const ownAssigneeProgress = useMemo(() => {
    const ownClients = utalandoClients.filter((client) =>
      userIdentitySet.has(String(client.hozzarendeltSzemely || '').trim().toLowerCase())
    )
    const assigneeName = String(ownClients[0]?.hozzarendeltSzemely || actorName).trim() || actorName
    const total = ownClients.length
    const done = ownClients.filter((client) => Boolean(notifiedMap[client.id]) || Boolean(nullasMap[client.id])).length
    const done58 = ownClients.filter((client) => Boolean(beadas58Map[client.id])).length

    return {
      name: actorName,
      assigneeName,
      total,
      done,
      done58,
      percent: total ? Math.round((done / total) * 100) : 0,
      percent58: total && isQuarterMonth ? Math.round((done58 / total) * 100) : 0,
      accent: assigneeColors[assigneeName.toLowerCase()] || profile?.themeColor || '',
    }
  }, [utalandoClients, userIdentitySet, actorName, notifiedMap, nullasMap, beadas58Map, isQuarterMonth, assigneeColors, profile])

  useEffect(() => {
    const monthRef = doc(db, 'monthTasks', notificationKey)
    const unsubMonth = onSnapshot(monthRef, (snap) => {
      const data = snap.data() || {}
      setIsClosed(Boolean(data.closed))
      if (Array.isArray(data.utalandoClientIds)) {
        setLockedUtalandoClientIds(data.utalandoClientIds.filter((value) => typeof value === 'string'))
      } else {
        setLockedUtalandoClientIds(null)
      }
      if (Array.isArray(data.utalandoManualExceptionClientIds)) {
        setManualExceptionClientIds(data.utalandoManualExceptionClientIds.filter((value) => typeof value === 'string'))
      } else {
        setManualExceptionClientIds([])
      }
      if (Array.isArray(data.utalandoManualExclusionClientIds)) {
        setManualExclusionClientIds(data.utalandoManualExclusionClientIds.filter((value) => typeof value === 'string'))
      } else {
        setManualExclusionClientIds([])
      }

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
      setBeadas58Map({})
      return
    }

    const notifiedRef = collection(db, 'monthTasks', notificationKey, 'utalando')
    const unsubNotified = onSnapshot(notifiedRef, (snap) => {
      const next = {}
      const nextNullas = {}
      const next58 = {}
      snap.forEach((docSnap) => {
        const data = docSnap.data()
        next[docSnap.id] = Boolean(data?.notified)
        nextNullas[docSnap.id] = Boolean(data?.nullas)
        next58[docSnap.id] = Boolean(data?.beadas58)
      })
      setNotifiedMap(next)
      setNullasMap(nextNullas)
      setBeadas58Map(next58)
    })

    return () => {
      unsubNotified()
    }
  }, [isUtalandoEnabled, notificationKey])

  useEffect(() => {
    const allowedIds = new Set(excludedUtalandoCandidates.map(({ client }) => client.id))
    setSelectedExceptionIds((prev) => prev.filter((id) => allowedIds.has(id)))
  }, [excludedUtalandoCandidates])

  useEffect(() => {
    setExceptionPickerOpen(false)
    setExceptionSearchTerm('')
    setSelectedExceptionIds([])
  }, [notificationKey])

  const handleNotifyToggle = async (clientId, nextValue) => {
    if (nextValue && openUtalandoTicketByClient[clientId]) {
      setUpdateError(t('tasks.detail.errors.openTicketBlocksCompletion'))
      return
    }
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
    if (nextValue && openUtalandoTicketByClient[clientId]) {
      setUpdateError(t('tasks.detail.errors.openTicketBlocksCompletion'))
      return
    }
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

  const handle58BeadvaToggle = async (clientId, nextValue) => {
    if (nextValue && openUtalandoTicketByClient[clientId]) {
      setUpdateError(t('tasks.detail.errors.openTicketBlocksCompletion'))
      return
    }
    setUpdateError('')
    setUpdatingId(clientId)
    try {
      await setDoc(
        doc(db, 'monthTasks', notificationKey, 'utalando', clientId),
        {
          beadas58: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } catch (err) {
      setUpdateError(err?.message || t('tasks.detail.errors.beadas58Save'))
    } finally {
      setUpdatingId('')
    }
  }

  const handleAddManualExceptions = async () => {
    if (!selectedExceptionIds.length) return
    const nextManualExceptionIds = Array.from(new Set([...manualExceptionClientIds, ...selectedExceptionIds]))
    const nextManualExclusionIds = manualExclusionClientIds.filter((clientId) => !selectedExceptionIds.includes(clientId))
    const nextLockedClientIds =
      isClosed && isUtalandoEnabled
        ? Array.from(new Set([...(lockedUtalandoClientIds || []), ...selectedExceptionIds]))
        : lockedUtalandoClientIds
    const prevManualExceptionIds = manualExceptionClientIds
    const prevManualExclusionIds = manualExclusionClientIds
    const prevLockedClientIds = lockedUtalandoClientIds

    setExceptionSaving(true)
    setUpdateError('')
    setManualExceptionClientIds(nextManualExceptionIds)
    setManualExclusionClientIds(nextManualExclusionIds)
    if (isClosed && isUtalandoEnabled) {
      setLockedUtalandoClientIds(nextLockedClientIds)
    }

    try {
      await persistMonthMeta(taskIds, isClosed, nextLockedClientIds, nextManualExceptionIds, nextManualExclusionIds)
      setSelectedExceptionIds([])
      setExceptionSearchTerm('')
      setExceptionPickerOpen(false)
    } catch (err) {
      setUpdateError(err?.message || 'Nem sikerült menteni a kivételeket.')
      setManualExceptionClientIds(prevManualExceptionIds)
      setManualExclusionClientIds(prevManualExclusionIds)
      setLockedUtalandoClientIds(prevLockedClientIds)
    } finally {
      setExceptionSaving(false)
    }
  }

  const handleExcludeIncludedClient = async (clientId) => {
    if (!clientId) return
    const nextManualExclusionIds = Array.from(new Set([...manualExclusionClientIds, clientId]))
    const nextManualExceptionIds = manualExceptionClientIds.filter((value) => value !== clientId)
    const nextLockedClientIds =
      isClosed && isUtalandoEnabled
        ? (lockedUtalandoClientIds || []).filter((value) => value !== clientId)
        : lockedUtalandoClientIds
    const prevManualExceptionIds = manualExceptionClientIds
    const prevManualExclusionIds = manualExclusionClientIds
    const prevLockedClientIds = lockedUtalandoClientIds

    setExceptionSaving(true)
    setUpdateError('')
    setManualExceptionClientIds(nextManualExceptionIds)
    setManualExclusionClientIds(nextManualExclusionIds)
    if (isClosed && isUtalandoEnabled) {
      setLockedUtalandoClientIds(nextLockedClientIds)
    }

    try {
      await persistMonthMeta(taskIds, isClosed, nextLockedClientIds, nextManualExceptionIds, nextManualExclusionIds)
    } catch (err) {
      setUpdateError(err?.message || 'Nem sikerült kizárni az ügyfelet az utalandók közül.')
      setManualExceptionClientIds(prevManualExceptionIds)
      setManualExclusionClientIds(prevManualExclusionIds)
      setLockedUtalandoClientIds(prevLockedClientIds)
    } finally {
      setExceptionSaving(false)
    }
  }

  const persistMonthMeta = async (
    nextTaskIds,
    nextClosed = isClosed,
    utalandoClientIds = lockedUtalandoClientIds,
    utalandoManualExceptionIds = manualExceptionClientIds,
    utalandoManualExclusionIds = manualExclusionClientIds
  ) => {
    const normalizedClientIds = Array.isArray(utalandoClientIds)
      ? utalandoClientIds.filter((value) => typeof value === 'string')
      : undefined
    const normalizedManualExceptionIds = Array.isArray(utalandoManualExceptionIds)
      ? utalandoManualExceptionIds.filter((value) => typeof value === 'string')
      : []
    const normalizedManualExclusionIds = Array.isArray(utalandoManualExclusionIds)
      ? utalandoManualExclusionIds.filter((value) => typeof value === 'string')
      : []

    await setDoc(
      doc(db, 'monthTasks', notificationKey),
      {
        closed: nextClosed,
        taskIds: nextTaskIds,
        ...(normalizedClientIds ? { utalandoClientIds: normalizedClientIds } : {}),
        utalandoManualExceptionClientIds: normalizedManualExceptionIds,
        utalandoManualExclusionClientIds: normalizedManualExclusionIds,
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
    const prevLockedClientIds = lockedUtalandoClientIds
    const nextLockedClientIds =
      nextClosed && isUtalandoEnabled ? utalandoClients.map((client) => client.id) : lockedUtalandoClientIds

    setIsClosed(nextClosed)
    if (nextClosed && isUtalandoEnabled) {
      setLockedUtalandoClientIds(nextLockedClientIds)
    }

    persistMonthMeta(taskIds, nextClosed, nextLockedClientIds, manualExceptionClientIds).catch((err) => {
      setUpdateError(err?.message || t('tasks.detail.errors.monthSave'))
      setIsClosed(!nextClosed)
      setLockedUtalandoClientIds(prevLockedClientIds)
    })
  }

  const handleExportUtalando = () => {
    if (!filteredUtalandoClients.length) return

    const rows = filteredUtalandoClients.map((client) => {
      const openTaskTicket = openUtalandoTicketByClient[client.id]
      return {
        name: client.nev || '',
        taxId: client.adoszam || '',
        assignee: client.hozzarendeltSzemely || '',
        workType: client.munkavegzesJellege || '',
        frequency: client.utalandoGyakorisag || t('tasks.detail.noFrequency'),
        notified: Boolean(notifiedMap[client.id]),
        nullas: Boolean(nullasMap[client.id]),
        hasOpenTicket: Boolean(openTaskTicket),
        openTicketId: openTaskTicket?.id || '',
      }
    })

    exportUtalandoClientsToExcel(rows, {
      monthKey: notificationKey,
      sheetName: 'Utalandok',
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

  const handleOpenClientDetails = (client) => {
    if (!client) return
    const backTo = `/tasks/${year}/${month}`
    const tax = client.adoszam
    const shortTax = tax ? normalizeTaxId(tax) : ''
    if (shortTax) {
      navigate(`/clients/tax/${encodeURIComponent(shortTax)}`, { state: { returnTo: backTo } })
      return
    }
    navigate(`/clients/id/${client.id}`, { state: { returnTo: backTo } })
  }

  const handleOpenTaskTicket = (ticket, client) => {
    if (!ticket?.id) return
    const params = new URLSearchParams()
    params.set('ticketId', ticket.id)
    if (client?.id) params.set('clientId', client.id)
    if (client?.nev) params.set('clientName', client.nev)
    navigate(`/tickets?${params.toString()}`)
  }

  const handleCreateTicket = async (attachments = []) => {
    if (!ticketClient) return
    if (!ticketDescription.trim() || !ticketAssignee) {
      setTicketError(t('tickets.create.requiredError'))
      return
    }

    try {
      setTicketSaving(true)
      setTicketError('')
      const ref = await createTicket({
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
      }, attachments)
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
          <button type="button" className="back-arrow" onClick={() => navigate('/tasks')}>
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
            {isUtalandoEnabled ? (
              <button
                type="button"
                className="btn ghost"
                onClick={handleExportUtalando}
                disabled={loading || !filteredUtalandoClients.length}
              >
                Excel export ({filteredUtalandoClients.length})
              </button>
            ) : null}
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
        {ticketsError ? (
          <div className="banner banner-error">
            {t('common.errorPrefix')} {ticketsError}
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
              <>
                <div className="utalando-progress-grid">
                  <div className="utalando-progress">
                    <div className="utalando-progress__row">
                      <div className="utalando-progress__copy">
                        <span className="utalando-progress__eyebrow">{t('tasks.detail.progressSent')}</span>
                        <span className="utalando-progress__value">
                          {utalandoProgress.done}/{utalandoProgress.total}
                        </span>
                      </div>
                      <span className="utalando-progress__percent">{utalandoProgress.percent}%</span>
                    </div>
                    <div className="utalando-progress__bar">
                      <div className="utalando-progress__fill" style={{ width: `${utalandoProgress.percent}%` }} />
                    </div>
                  </div>

                  {isQuarterMonth ? (
                    <div className="utalando-progress utalando-progress--58">
                      <div className="utalando-progress__row">
                        <div className="utalando-progress__copy">
                          <span className="utalando-progress__eyebrow">{t('tasks.detail.progress58')}</span>
                          <span className="utalando-progress__value">
                            {beadas58Progress.done}/{beadas58Progress.total}
                          </span>
                        </div>
                        <span className="utalando-progress__percent">{beadas58Progress.percent}%</span>
                      </div>
                      <div className="utalando-progress__bar">
                        <div
                          className="utalando-progress__fill utalando-progress__fill--58"
                          style={{ width: `${beadas58Progress.percent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                {userIdentitySet.size ? (
                  <div className="utalando-assignee-progress">
                    <div className="utalando-assignee-progress__head">
                      <span className="utalando-progress__eyebrow">{t('tasks.detail.myProgress')}</span>
                    </div>
                    <div className="utalando-progress-grid utalando-progress-grid--assignees">
                      <div
                        className="utalando-progress utalando-progress--assignee"
                        style={ownAssigneeProgress.accent ? { '--accent': ownAssigneeProgress.accent } : undefined}
                      >
                        <div className="utalando-progress__row">
                          <div className="utalando-progress__copy utalando-progress__copy--stack">
                            <span className="utalando-progress__eyebrow">{ownAssigneeProgress.name}</span>
                            <span className="utalando-progress__metric">{t('tasks.detail.progressSent')}</span>
                          </div>
                          <span className="utalando-progress__percent">{ownAssigneeProgress.percent}%</span>
                        </div>
                        <div className="utalando-progress__bar">
                          <div className="utalando-progress__fill" style={{ width: `${ownAssigneeProgress.percent}%` }} />
                        </div>
                        <div className="utalando-progress__meta">
                          <span>
                            {ownAssigneeProgress.done}/{ownAssigneeProgress.total}
                          </span>
                          <span>{t('tasks.detail.assignedClients')}</span>
                        </div>

                        {isQuarterMonth ? (
                          <div className="utalando-progress__submetric">
                            <div className="utalando-progress__submetric-row">
                              <span className="utalando-progress__metric">{t('tasks.detail.progress58')}</span>
                              <span className="utalando-progress__meta-value">
                                {ownAssigneeProgress.done58}/{ownAssigneeProgress.total} ({ownAssigneeProgress.percent58}%)
                              </span>
                            </div>
                            <div className="utalando-progress__bar utalando-progress__bar--subtle">
                              <div
                                className="utalando-progress__fill utalando-progress__fill--58"
                                style={{ width: `${ownAssigneeProgress.percent58}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
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
                {isQuarterMonth ? (
                  <label className="filter-control">
                    <span>{t('tasks.detail.beadva58')}</span>
                    <select value={beadas58Filter} onChange={(event) => setBeadas58Filter(event.target.value)}>
                      <option value="">{t('common.all')}</option>
                      <option value="yes">{t('tasks.detail.beadva58')}</option>
                      <option value="no">{t('tasks.detail.notBeadva58')}</option>
                    </select>
                  </label>
                ) : null}
                {debtExcludedUtalandoClients.length ? (
                  <button
                    type="button"
                    className={`utalando-disclosure-toggle utalando-filters__toggle${showDebtExcluded ? ' is-active' : ''}`}
                    onClick={() => setShowDebtExcluded((prev) => !prev)}
                    aria-expanded={showDebtExcluded}
                  >
                    {showDebtExcluded ? <TbChevronUp aria-hidden="true" /> : <TbChevronDown aria-hidden="true" />}
                    <span>
                      {showDebtExcluded
                        ? t('tasks.detail.hideDebtExcluded')
                        : t('tasks.detail.showDebtExcluded', { count: debtExcludedUtalandoClients.length })}
                    </span>
                  </button>
                ) : null}
                <ExceptionPicker
                  open={exceptionPickerOpen}
                  onToggleOpen={() => setExceptionPickerOpen((prev) => !prev)}
                  items={excludedUtalandoCandidates}
                  searchTerm={exceptionSearchTerm}
                  onSearchChange={setExceptionSearchTerm}
                  selectedIds={selectedExceptionIds}
                  onToggleSelection={(clientId) =>
                    setSelectedExceptionIds((prev) =>
                      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
                    )
                  }
                  onAddSelected={handleAddManualExceptions}
                  saving={exceptionSaving}
                  description="A normál szűrésből kimaradt ügyfelek kézzel hozzáadhatók az utalandók listájához."
                  addButtonLabel="Hozzáadás az utalandókhoz"
                />
              </div>
            ) : null}

            {!loading && debtExcludedUtalandoClients.length && showDebtExcluded ? (
              <div className="utalando-disclosure">
                <div className="utalando-disclosure__head">
                  <div>
                    <h3>{t('tasks.detail.debtExcludedTitle', { count: debtExcludedUtalandoClients.length })}</h3>
                    <p className="muted">{t('tasks.detail.debtExcludedHelp')}</p>
                  </div>
                </div>
                <div className="ticket-list">
                  {debtExcludedUtalandoClients.map((client) => {
                    const debtAmount = formatDebtAmount(client.billingoDebt)
                    const earliestDueDate = normalizeIsoDate(client.billingoDebtEarliestDueDate)
                    return (
                      <div
                        key={`debt-excluded-${client.id}`}
                        className="ticket-row debt-row clickable"
                        onClick={() => handleOpenClientDetails(client)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            handleOpenClientDetails(client)
                          }
                        }}
                      >
                        <div className="ticket-head">
                          <div className="ticket-client">{client.nev || t('tasks.detail.unknownClient')}</div>
                        </div>
                        <div className="ticket-meta">
                          {client.adoszam ? (
                            <span>
                              {t('tasks.detail.taxPrefix')} {client.adoszam}
                            </span>
                          ) : null}
                          {debtAmount ? (
                            <span>
                              {t('tasks.detail.debtAmountPrefix')} {debtAmount}
                            </span>
                          ) : null}
                          <span>
                            {t('tasks.detail.debtDuePrefix')}{' '}
                            {earliestDueDate || t('tasks.detail.debtDueUnknown')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
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
                  const beadva58 = Boolean(beadas58Map[client.id])
                  const isManualException = manualExceptionIdSet.has(client.id)
                  const openTaskTicket = openUtalandoTicketByClient[client.id]
                  const frequency = client.utalandoGyakorisag || t('tasks.detail.noFrequency')
                  const accent = assigneeColors[(client.hozzarendeltSzemely || '').trim().toLowerCase()]
                  const endedThisMonth = isDateInMonth(client.megszunesDatuma, notificationKey)
                  const endDateLabel = endedThisMonth ? normalizeIsoDate(client.megszunesDatuma) : ''

                  return (
                    <div
                      key={client.id}
                      className="ticket-row debt-row utalando-row clickable"
                      style={accent ? { '--ticket-accent': accent } : undefined}
                      onClick={() => handleOpenClientDetails(client)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleOpenClientDetails(client)
                        }
                      }}
                    >
                      <div className="ticket-head">
                        <div className="utalando-client-head">
                          <div className="ticket-client">{client.nev || t('tasks.detail.unknownClient')}</div>
                          {endedThisMonth ? (
                            <span className="pill pill-quiet">
                              {t('tasks.detail.endedThisMonth')}
                              {endDateLabel ? ` (${endDateLabel})` : ''}
                            </span>
                          ) : null}
                          {isManualException ? <span className="pill pill-quiet">Kivétel</span> : null}
                        </div>
                        <div className="utalando-ticket-actions">
                          {openTaskTicket ? (
                            <button
                              type="button"
                              className="ticket-flag utalando-open-ticket-flag"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleOpenTaskTicket(openTaskTicket, client)
                              }}
                              title={t('tasks.detail.openTicketAction')}
                              aria-label={t('tasks.detail.openTicketAction')}
                            >
                              <TbAlertCircle aria-hidden="true" />
                              <span>{t('tasks.detail.openTicketAction')}</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="ticket-flag utalando-ticket-flag"
                            title={t('tasks.detail.raiseTicket')}
                            aria-label={t('tasks.detail.raiseTicket')}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleOpenTicketModal(client)
                            }}
                          >
                            <TbAlertTriangle aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="ticket-flag utalando-ticket-flag"
                            title="Kizárás az utalandók közül"
                            aria-label="Kizárás az utalandók közül"
                            disabled={exceptionSaving}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleExcludeIncludedClient(client.id)
                            }}
                          >
                            <TbUserOff aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="ticket-meta">
                        {client.adoszam ? <span className="muted">{t('tasks.detail.taxPrefix')} {client.adoszam}</span> : null}
                        {client.munkavegzesJellege ? (
                          <span className="muted">
                            {t('tasks.detail.munkavegzesJellegePrefix')} {client.munkavegzesJellege}
                          </span>
                        ) : null}
                        {client.hozzarendeltSzemely ? (
                          <span className="muted">{t('tasks.detail.assigneePrefix')} {client.hozzarendeltSzemely}</span>
                        ) : null}
                        <span className="muted">{t('tasks.detail.frequencyPrefix')} {frequency}</span>
                      </div>
                      <div className="utalando-actions" onClick={(event) => event.stopPropagation()}>
                        <label className="switch utalando-switch">
                          <input
                            type="checkbox"
                            checked={notified}
                            onChange={(event) => handleNotifyToggle(client.id, event.target.checked)}
                            disabled={updatingId === client.id || (Boolean(openTaskTicket) && !notified)}
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
                            disabled={updatingId === client.id || (Boolean(openTaskTicket) && !nullas)}
                          />
                          <span className="switch-slider" />
                        </label>
                        <span className={`pill ${nullas ? 'pill-active' : 'pill-quiet'}`}>
                          {nullas ? t('tasks.detail.nullas') : t('tasks.detail.nonNullas')}
                        </span>
                        {isQuarterMonth ? (
                          <>
                            <label className="switch utalando-switch">
                              <input
                                type="checkbox"
                                checked={beadva58}
                                onChange={(event) => handle58BeadvaToggle(client.id, event.target.checked)}
                                disabled={updatingId === client.id || (Boolean(openTaskTicket) && !beadva58)}
                              />
                              <span className="switch-slider" />
                            </label>
                            <span className={`pill ${beadva58 ? 'pill-active' : 'pill-quiet'}`}>
                              {beadva58 ? t('tasks.detail.beadva58') : t('tasks.detail.notBeadva58')}
                            </span>
                          </>
                        ) : null}
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
