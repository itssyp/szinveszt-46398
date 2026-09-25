import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TbAlertTriangle, TbChevronDown, TbChevronUp, TbFlag } from 'react-icons/tb'
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import Modal from '../components/Modal'
import TicketCreateModal from '../components/TicketCreateModal'
import { statusClass } from '../components/ClientCards'
import { db } from '../firebase'
import { createTicket } from '../services/tickets'
import { useClientsCache } from '../hooks/useClientsCache'
import { useClientSchema } from '../hooks/useClientSchema.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { logClientActivity } from '../utils/clientActivity'
import { buildClientIpaUpdateFields, getClientIpaValue } from '../utils/clientIpa'
import { buildUserIdentitySet } from '../utils/userIdentity'

const START_2025 = new Date(2025, 0, 1)
const START_2025_JAN_2 = new Date(2025, 0, 2)
const START_2026 = new Date(2026, 0, 1)
const SZJA_TASK_YEAR = 2025
const SZJA_FREEZE_DOC_ID = `szja${SZJA_TASK_YEAR}`
const SZJA_CHECKLIST_FIELDS = [
  { key: 'bevallasElkeszitve', label: 'SZJA elkészítve' },
  { key: 'bevallasBeadva', label: 'SZJA beadva' },
  { key: 'szjaErtesitoKikulve', label: 'SZJA értesítő' },
  { key: 'szjaSzamlaFizetve', label: 'SZJA számla' },
  { key: 'hipaBeadva', label: 'IPA beadva' },
  { key: 'hipaErtesitoKikulve', label: 'IPA értesítő' },
]

const STEP_FILTER_ANY = ''
const STEP_FILTER_DONE = 'done'
const STEP_FILTER_PENDING = 'pending'

function createInitialStepFilters() {
  return Object.fromEntries(SZJA_CHECKLIST_FIELDS.map(({ key }) => [key, STEP_FILTER_ANY]))
}

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
}

function isCancelledStatus(statusNorm) {
  return statusNorm.startsWith('lemondta') || statusNorm.startsWith('kirugva')
}

function parseAnyDate(value) {
  if (!value) return null
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    const tsDate = value.toDate()
    return Number.isNaN(tsDate?.getTime?.()) ? null : tsDate
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const raw = String(value).trim()
  if (!raw) return null

  const ymdMatch = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (ymdMatch) {
    const year = Number(ymdMatch[1])
    const month = Number(ymdMatch[2]) - 1
    const day = Number(ymdMatch[3])
    const date = new Date(year, month, day)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const dmyMatch = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = Number(dmyMatch[2]) - 1
    const year = Number(dmyMatch[3])
    const date = new Date(year, month, day)
    return Number.isNaN(date.getTime()) ? null : date
  }

  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

function formatDate(value) {
  if (!value) return '-'
  return value.toLocaleDateString('hu-HU')
}

function formatTimestamp(value) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : value instanceof Date ? value : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return `${date.toLocaleDateString('hu-HU')} ${date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}`
}

function sortSzjaItems(items) {
  return items.sort((a, b) => {
    const aPriority = Boolean(a.client?.szja2025?.highPriority)
    const bPriority = Boolean(b.client?.szja2025?.highPriority)
    if (aPriority !== bPriority) return aPriority ? -1 : 1
    const aName = String(a.client?.nev || '')
    const bName = String(b.client?.nev || '')
    return aName.localeCompare(bName, 'hu')
  })
}

function getSzjaException(client) {
  const manualException = client?.szja2025?.manualException
  return {
    included: Boolean(manualException?.included),
    target: manualException?.target === 'pausedOrEnded' ? 'pausedOrEnded' : 'active',
  }
}

function useSzjaFreezeState() {
  const [freezeState, setFreezeState] = useState({ frozen: false, activeIds: [], pausedOrEndedIds: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const ref = doc(db, 'taskFreezes', SZJA_FREEZE_DOC_ID)
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() : {}
        setFreezeState({
          frozen: Boolean(data.frozen),
          activeIds: Array.isArray(data.activeIds) ? data.activeIds.filter(Boolean) : [],
          pausedOrEndedIds: Array.isArray(data.pausedOrEndedIds) ? data.pausedOrEndedIds.filter(Boolean) : [],
          frozenAt: data.frozenAt || null,
          frozenBy: data.frozenBy || '',
        })
        setError('')
        setLoading(false)
      },
      (err) => {
        setError(err.message || 'SZJA lista zárolás betöltése sikertelen')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [])

  return { freezeState, loading, error }
}

function classifyClientForSzja(client) {
  const statusNorm = normalizeStatus(client.statusz)
  const startDate = parseAnyDate(client.kezdesDatuma)
  const pauseStartDate = parseAnyDate(client.szunetKezdete)
  const endDate = parseAnyDate(client.megszunesDatuma)
  const cancellationDate = parseAnyDate(client.lemondasDatuma)
  const startedIn2025OrEarlier = Boolean(startDate && startDate < START_2026)

  if (!startDate) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      cancellationDate,
      targetGroup: null,
      exclusionReason: 'Hiányzó vagy érvénytelen kezdési dátum',
    }
  }

  if (!startedIn2025OrEarlier) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      cancellationDate,
      targetGroup: null,
      exclusionReason: 'Kezdés 2026-ban vagy később történt',
    }
  }

  if (statusNorm.startsWith('aktiv')) {
    return { startDate, pauseStartDate, endDate, cancellationDate, targetGroup: 'active', exclusionReason: '' }
  }

  if (
    (statusNorm.startsWith('szunet') && pauseStartDate && pauseStartDate >= START_2026) ||
    (statusNorm.startsWith('megsz') && endDate && endDate >= START_2026)
  ) {
    return { startDate, pauseStartDate, endDate, cancellationDate, targetGroup: 'active', exclusionReason: '' }
  }

  if (isCancelledStatus(statusNorm)) {
    if (cancellationDate && cancellationDate < START_2026) {
      return {
        startDate,
        pauseStartDate,
        endDate,
        cancellationDate,
        targetGroup: null,
        exclusionReason: '2026 előtt lemondta a könyvelést',
      }
    }

    return { startDate, pauseStartDate, endDate, cancellationDate, targetGroup: 'active', exclusionReason: '' }
  }

  if (statusNorm.startsWith('szunet') && pauseStartDate && pauseStartDate >= START_2025_JAN_2) {
    return { startDate, pauseStartDate, endDate, cancellationDate, targetGroup: 'pausedOrEnded', exclusionReason: '' }
  }

  if (statusNorm.startsWith('megsz') && endDate && endDate >= START_2025) {
    return { startDate, pauseStartDate, endDate, cancellationDate, targetGroup: 'pausedOrEnded', exclusionReason: '' }
  }

  if (statusNorm.startsWith('szunet')) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      cancellationDate,
      targetGroup: null,
      exclusionReason: pauseStartDate ? '2025 előtt szünetelt' : 'Hiányzó szünet kezdete',
    }
  }

  if (statusNorm.startsWith('megsz')) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      cancellationDate,
      targetGroup: null,
      exclusionReason: endDate ? '2025 előtt megszűnt' : 'Hiányzó megszűnés dátuma',
    }
  }

  return {
    startDate,
    pauseStartDate,
    endDate,
    cancellationDate,
    targetGroup: null,
    exclusionReason: 'A státusz nem illik egyik SZJA-listába sem',
  }
}

function getVisibleItems(
  items,
  searchTerm,
  assigneeFilter = '',
  szjaInvoiceFilter = '',
  stepFilters = {},
  clientStatusFilter = '',
  ipaFilter = ''
) {
  const term = String(searchTerm || '').trim().toLowerCase()
  const assigneeTerm = String(assigneeFilter || '').trim().toLowerCase()
  const invoiceFilter = String(szjaInvoiceFilter || '').trim().toLowerCase()
  const statusFilterTerm = String(clientStatusFilter || '').trim().toLowerCase()
  const ipaFilterTerm = String(ipaFilter || '').trim().toLowerCase()

  return items.filter(({ client }) => {
    const name = String(client.nev || '').toLowerCase()
    const adoszam = String(client.adoszam || '').toLowerCase()
    const assignedTo = String(client.szja2025?.assignedTo || '').trim().toLowerCase()
    const szja = client.szja2025 || {}
    const szjaInvoicePaid = Boolean(client.szja2025?.szjaSzamlaFizetve)
    
    const clientStatus = String(client.statusz || '').trim().toLowerCase()
    const clientIpa = String(getClientIpaValue(client) || '').trim().toLowerCase()

    const matchesAssignee = !assigneeTerm || assignedTo === assigneeTerm
    const matchesSearch = !term || name.includes(term) || adoszam.includes(term)
    const matchesInvoice =
      invoiceFilter === '' ? true : invoiceFilter === 'paid' ? szjaInvoicePaid : !szjaInvoicePaid
    const matchesStatus = !statusFilterTerm || clientStatus === statusFilterTerm
    const matchesIpa = !ipaFilterTerm || clientIpa === ipaFilterTerm

    const matchesSteps = SZJA_CHECKLIST_FIELDS.every(({ key }) => {
      const filterValue = String(stepFilters?.[key] || STEP_FILTER_ANY)
      if (filterValue === STEP_FILTER_ANY) return true
      const isDone = Boolean(szja[key])
      return filterValue === STEP_FILTER_DONE ? isDone : !isDone
    })
    return matchesAssignee && matchesSearch && matchesInvoice && matchesStatus && matchesIpa && matchesSteps
  })
}

function getStepSummary(szja = {}) {
  const total = SZJA_CHECKLIST_FIELDS.length
  const done = SZJA_CHECKLIST_FIELDS.filter(({ key }) => Boolean(szja[key])).length
  const percent = total ? Math.round((done / total) * 100) : 0
  return { total, done, percent }
}

function getProgressSummary(items) {
  const total = items.length
  if (!total) return { total: 0, done: 0, percent: 0 }
  const done = items.filter(({ client }) => Boolean(client.szja2025?.bevallasBeadva)).length
  const percent = Math.round((done / total) * 100)
  return { total, done, percent }
}

function getAssigneeAccentClass(value) {
  const slug = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return slug ? `assignee-${slug}` : ''
}

function buildSzjaItem(client, overrides = {}) {
  const classification = classifyClientForSzja(client)
  return {
    client,
    startDate: classification.startDate,
    pauseStartDate: classification.pauseStartDate,
    endDate: classification.endDate,
    cancellationDate: classification.cancellationDate,
    exclusionReason: classification.exclusionReason,
    isException: false,
    ...overrides,
  }
}

function buildFrozenSzjaItems(ids, clientsById) {
  return ids.map((id) => clientsById.get(id)).filter(Boolean).map((client) => buildSzjaItem(client, { isFrozen: true, exclusionReason: '' }))
}

const toggleSzjaValue = async (clientId, field, value) => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, {
      [`szja2025.${field}`]: value,
    })
  } catch (err) {
    console.error('Error updating SZJA value', err)
    alert('Hiba történt a mentés során.')
  }
}

const updateIpaValue = async (clientId, value) => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, buildClientIpaUpdateFields(value))
  } catch (err) {
    console.error('Error updating IPA value', err)
    alert('Hiba történt a mentés során.')
  }
}

const updateSzjaException = async (clientId, included, target = 'active') => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, {
      'szja2025.manualException.included': included,
      'szja2025.manualException.target': included ? target : '',
    })
  } catch (err) {
    console.error('Error updating SZJA exception', err)
    alert('Hiba történt a mentés során.')
  }
}

const updateSzjaPriority = async (clientId, highPriority) => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, {
      'szja2025.highPriority': highPriority,
    })
  } catch (err) {
    console.error('Error updating SZJA priority', err)
    alert('Hiba történt a mentés során.')
  }
}

const updateSzjaAssignee = async (clientId, assignedTo) => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, {
      'szja2025.assignedTo': assignedTo,
    })
  } catch (err) {
    console.error('Error updating SZJA assignee', err)
    alert('Hiba történt a mentés során.')
  }
}

const updateSzjaAssignees = async (clientIds, assignedTo) => {
  try {
    await Promise.all(
      clientIds.map((clientId) =>
        updateDoc(doc(db, 'clients', clientId), {
          'szja2025.assignedTo': assignedTo,
        })
      )
    )
  } catch (err) {
    console.error('Error bulk updating SZJA assignees', err)
    alert('Hiba történt a mentés során.')
  }
}

function NotesTextarea({ clientId, initialValue }) {
  const [val, setVal] = useState(initialValue || '')

  useEffect(() => {
    setVal(initialValue || '')
  }, [clientId, initialValue])

  const handleBlur = () => {
    if (val !== (initialValue || '')) {
      toggleSzjaValue(clientId, 'megjegyzes', val)
    }
  }

  return (
    <textarea
      className="input szja-notes-input"
      value={val}
      onChange={(event) => setVal(event.target.value)}
      onBlur={handleBlur}
      placeholder="Megjegyzés..."
    />
  )
}

function PriorityButton({ active, onClick }) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderColor: active ? '#fecaca' : 'var(--border)',
        background: active ? '#fef2f2' : '#fff',
        color: active ? '#b91c1c' : '#475569',
      }}
    >
      <TbFlag size={18} />
      <span>{active ? 'Magas prioritás' : 'Prioritás'}</span>
    </button>
  )
}

function ChecklistCard({ clientId, checked, fieldKey, label }) {
  return (
    <label className="meta-card szja-toggle-card">
      <span className="meta-label">{label}</span>
      <div className="szja-toggle-row">
        <span className={`meta-value${checked ? ' emphasis' : ''}`}>{checked ? 'Kész' : 'Nyitott'}</span>
        <span className="switch" style={{ display: 'inline-block' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => toggleSzjaValue(clientId, fieldKey, event.target.checked)}
          />
          <span className="switch-slider"></span>
        </span>
      </div>
    </label>
  )
}

function SzjaClientCard({
  item,
  selected,
  selectionMode,
  isChecked,
  onSelect,
  onToggleChecked,
  onLongPress,
  onOpenAssignMenu,
}) {
  const { client, isException } = item
  const szja = client.szja2025 || {}
  const progress = getStepSummary(szja)
  const notePreview = String(szja.megjegyzes || '').trim()
  const assigneeLabel = szja.assignedTo || 'Nincs kiosztva'
  const ipaLabel = getClientIpaValue(client) || 'Nincs megadva'
  const isHighPriority = Boolean(szja.highPriority)
  const assigneeAccentClass = getAssigneeAccentClass(szja.assignedTo)
  const pressTimerRef = useRef(null)
  const longPressTriggeredRef = useRef(false)

  const startPress = () => {
    longPressTriggeredRef.current = false
    if (!onLongPress || selectionMode) return
    pressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      onLongPress(client.id)
    }, 500)
  }

  const endPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }

  useEffect(() => () => endPress(), [])

  return (
    <div
      role="button"
      tabIndex={0}
      className={`ticket-row clickable szja-client-card${assigneeAccentClass ? ` ${assigneeAccentClass}` : ''}${selected ? ' is-selected' : ''}${isHighPriority ? ' is-priority' : ''}`}
      onClick={() => {
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false
          return
        }
        onSelect()
      }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onContextMenu={(event) => {
        if (!selectionMode || !onOpenAssignMenu) return
        event.preventDefault()
        onOpenAssignMenu(event, client.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <div className="ticket-head">
        <div className="szja-client-head">
          <div className="szja-client-name-row">
            {selectionMode ? (
              <label
                className="szja-select-checkbox"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleChecked(client.id)}
                  aria-label={`${client.nev || 'Ügyfél'} kijelölése`}
                />
              </label>
            ) : null}
            <span className={statusClass(client.statusz)} aria-hidden="true" />
            <span className="ticket-client">{client.nev || 'Név hiányzik'}</span>
          </div>
          <div className="ticket-meta">
            <span>Adószám: {client.adoszam || '-'}</span>
            <span>Felelős: {assigneeLabel}</span>
            <span>IPA: {ipaLabel}</span>
            <span>Beadva: {szja.bevallasBeadva ? 'Igen' : 'Nem'}</span>
          </div>
        </div>
        <div className="szja-progress-chip">
          {progress.done}/{progress.total}
        </div>
      </div>

      <div className="szja-card-status-row">
        {isException ? (
          <span
            className="pill"
            style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e' }}
          >
            Kivétel
          </span>
        ) : null}
      </div>

      {notePreview ? <p className="szja-note-preview">{notePreview}</p> : null}
    </div>
  )
}

function SzjaDetailContent({ item, ipaField, assigneeOptions, onOpenTaskTicket }) {
  if (!item) {
    return (
      <div className="szja-detail-empty">
        <h3 style={{ marginTop: 0 }}>Válassz ügyfelet</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          A bal oldali listából kiválasztva megnyílik az ügyfél SZJA szerkesztője.
        </p>
      </div>
    )
  }

  const { client, startDate, pauseStartDate, endDate, cancellationDate, isException, exclusionReason } = item
  const szja = client.szja2025 || {}
  const progress = getStepSummary(szja)
  const isHighPriority = Boolean(szja.highPriority)

  return (
    <div className="details">
      <div className="details-section">
        <div className="szja-detail-header">
          <div className="szja-detail-title">
            <div className="szja-detail-title-row">
              <span className={statusClass(client.statusz)} aria-hidden="true" />
              <h3 style={{ margin: 0 }}>{client.nev || 'Név hiányzik'}</h3>
              {isException ? (
                <span
                  className="pill"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e' }}
                >
                  Kivétel
                </span>
              ) : null}
            </div>
            <div className="ticket-meta">
              <span>{client.statusz || 'Ismeretlen státusz'}</span>
              <span>Adószám: {client.adoszam || '-'}</span>
              <span>Kezdés: {formatDate(startDate)}</span>
              {pauseStartDate ? <span>Szünet: {formatDate(pauseStartDate)}</span> : null}
              {endDate ? <span>Megszűnés: {formatDate(endDate)}</span> : null}
              {cancellationDate ? <span>Lemondás: {formatDate(cancellationDate)}</span> : null}
            </div>
          </div>

          <div className="szja-detail-actions">
            <PriorityButton active={isHighPriority} onClick={() => updateSzjaPriority(client.id, !isHighPriority)} />
            <button
              type="button"
              className="btn ghost"
              onClick={() => onOpenTaskTicket?.(client)}
              style={{
                borderColor: '#fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
              }}
            >
              <TbAlertTriangle />   
            </button>
            {isException ? (
              <button type="button" className="btn ghost" onClick={() => updateSzjaException(client.id, false)}>
                Kivétel törlése
              </button>
            ) : null}
          </div>
        </div>

        {isException ? (
          <div className="details-banner warning">
            Kézzel hozzáadott kivétel{exclusionReason ? `: ${exclusionReason}` : '.'}
          </div>
        ) : null}
      </div>

      <div className="details-section">
        <div className="details-header">
          <h3>Összegzés</h3>
          <span className="muted">{progress.done}/{progress.total} kész</span>
        </div>
        <div className="ticket-meta-panel">
          <div className="meta-card">
            <span className="meta-label">Státusz</span>
            <span className="meta-value">{client.statusz || '-'}</span>
          </div>
          <div className="meta-card">
            <span className="meta-label">Adószám</span>
            <span className="meta-value">{client.adoszam || '-'}</span>
          </div>
          <div className="meta-card">
              <span className="meta-label">IPA</span>
              <select
                className="meta-select"
                value={getClientIpaValue(client)}
                onChange={(event) => updateIpaValue(client.id, event.target.value)}
              >
              <option value="">Nincs megadva</option>
              {ipaField.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="meta-card">
            <span className="meta-label">Felelős</span>
            <select
              className="meta-select"
              value={szja.assignedTo || ''}
              onChange={(event) => updateSzjaAssignee(client.id, event.target.value)}
            >
              <option value="">Nincs kiosztva</option>
              {assigneeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="details-section">
        <div className="details-header">
          <h3>Feladatlépések</h3>
          <span className="muted">{progress.percent}% kész</span>
        </div>
        <div className="szja-checklist-grid">
          {SZJA_CHECKLIST_FIELDS.map(({ key, label }) => (
            <ChecklistCard key={key} clientId={client.id} fieldKey={key} label={label} checked={Boolean(szja[key])} />
          ))}
        </div>
      </div>

      <div className="details-section">
        <div className="details-header">
          <h3>Megjegyzés</h3>
          <span className="muted">{String(szja.megjegyzes || '').trim() ? 'Szerkeszthető teljes nézetben' : 'Nincs megjegyzés'}</span>
        </div>
        <NotesTextarea clientId={client.id} initialValue={szja.megjegyzes} />
      </div>
    </div>
  )
}

function RuleSection({
  title,
  subtitle,
  items,
  visibleItems,
  ownProgress,
  selectedItem,
  headerAction = null,
  controls = null,
  selectionMode,
  onSelectClient,
  selectedClientIds,
  onToggleChecked,
  onToggleSelectAllVisible,
  onClearSelection,
  onClientLongPress,
  onOpenAssignMenu,
}) {
  const progress = useMemo(() => getProgressSummary(items), [items])
  const priorityCount = useMemo(
    () => visibleItems.filter(({ client }) => Boolean(client.szja2025?.highPriority)).length,
    [visibleItems]
  )
  const visibleExceptionCount = useMemo(
    () => visibleItems.filter(({ isException }) => isException).length,
    [visibleItems]
  )
  const visibleIds = visibleItems.map(({ client }) => client.id)
  const selectedVisibleCount = visibleIds.filter((id) => selectedClientIds.includes(id)).length
  const allVisibleSelected = Boolean(visibleIds.length) && selectedVisibleCount === visibleIds.length

  return (
    <div style={{ paddingBottom: 16 }}>
      <div className="details-header" style={{ marginBottom: 12 }}>
        <h3>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="pill">{visibleItems.length}</span>
          {headerAction}
        </div>
      </div>

      <p className="muted" style={{ marginBottom: 20 }}>{subtitle}</p>

      {items.length ? (
        <>
          <div className="utalando-progress" style={{ marginBottom: 16 }}>
            <div className="utalando-progress__row">
              <span>SZJA beadva: {progress.done}/{progress.total}</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="utalando-progress__bar">
              <div className="utalando-progress__fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>

          {ownProgress ? (
            <div className="utalando-assignee-progress">
              <div className="utalando-assignee-progress__head">
                <span className="utalando-progress__eyebrow">Saját előrehaladás</span>
              </div>
              <div className="utalando-progress-grid utalando-progress-grid--assignees">
                <div
                  className="utalando-progress utalando-progress--assignee"
                  style={ownProgress.accent ? { '--accent': ownProgress.accent } : undefined}
                >
                  <div className="utalando-progress__row">
                    <div className="utalando-progress__copy utalando-progress__copy--stack">
                      <span className="utalando-progress__eyebrow">{ownProgress.name}</span>
                      <span className="utalando-progress__metric">SZJA beadva</span>
                    </div>
                    <span className="utalando-progress__percent">{ownProgress.percent}%</span>
                  </div>
                  <div className="utalando-progress__bar">
                    <div className="utalando-progress__fill" style={{ width: `${ownProgress.percent}%` }} />
                  </div>
                  <div className="utalando-progress__meta">
                    <span>
                      {ownProgress.done}/{ownProgress.total}
                    </span>
                    <span>kiosztott ügyfél</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {controls}

      <div className="szja-summary-line">
        <span>Látható: {visibleItems.length}</span>
        <span>Prioritásos: {priorityCount}</span>
        <span>Kivételek: {visibleExceptionCount}</span>
        {selectionMode ? <span>Kijelölt: {selectedClientIds.length}</span> : null}
      </div>

      {selectionMode ? (
        <div className="szja-bulk-bar">
          <label className="szja-bulk-select-all">
            <input type="checkbox" checked={allVisibleSelected} onChange={onToggleSelectAllVisible} />
            <span className="szja-bulk-select-all__text">
              {allVisibleSelected ? 'Láthatók kijelölve' : 'Összes kijelölése'}
            </span>
          </label>
          <span className="pill">{selectedClientIds.length} kijelölt</span>
          <span className="szja-bulk-bar__hint muted">
            Jobb klikk egy kijelölt ügyfélen a kiosztáshoz.
          </span>
          <button type="button" className="btn ghost" onClick={onClearSelection}>
            Kijelölés törlése
          </button>
        </div>
      ) : null}

      {visibleItems.length ? (
        <div className="ticket-list szja-list">
          {visibleItems.map((item) => (
            <SzjaClientCard
              key={item.client.id}
              item={item}
              selected={selectedItem?.client?.id === item.client.id}
              selectionMode={selectionMode}
              isChecked={selectedClientIds.includes(item.client.id)}
              onToggleChecked={onToggleChecked}
              onLongPress={onClientLongPress}
              onOpenAssignMenu={onOpenAssignMenu}
              onSelect={() => onSelectClient(item.client.id)}
            />
          ))}
        </div>
      ) : null}

      {!visibleItems.length ? <p className="muted">Nincs találat.</p> : null}
    </div>
  )
}

function BulkAssignContextMenu({ open, x, y, assigneeOptions, onAssign, onClose, saving }) {
  if (!open) return null

  return (
    <div
      data-szja-assign-menu="true"
      style={{
        position: 'fixed',
        top: y,
        left: x,
        width: 220,
        padding: 8,
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: '#fff',
        boxShadow: '0 18px 42px rgba(15, 23, 42, 0.16)',
        zIndex: 1300,
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ padding: '4px 6px 8px', fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}>
        Kiosztás kijelölteknek
      </div>
      <button type="button" className="btn ghost" onClick={() => onAssign('')} disabled={saving}>
        Nincs kiosztva
      </button>
      {assigneeOptions.map((option) => (
        <button key={option} type="button" className="btn ghost" onClick={() => onAssign(option)} disabled={saving}>
          {option}
        </button>
      ))}
      <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
        Mégse
      </button>
    </div>
  )
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
  const visibleItems = useMemo(() => getVisibleItems(items, searchTerm), [items, searchTerm])

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn ghost"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-label="Kivétel hozzáadása"
        title="Kivétel hozzáadása"
        style={{ minWidth: 42, width: 42, height: 42, padding: 0, fontSize: '1.25rem', lineHeight: 1 }}
      >
        +
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 'min(520px, calc(100vw - 64px))',
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 16,
            background: '#fff',
            boxShadow: '0 18px 42px rgba(15, 23, 42, 0.12)',
            zIndex: 20,
            display: 'grid',
            gap: 12,
          }}
        >
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

function handleExportExcel(items, tabTitle) {
  const headers = [
    'Név',
    'Adószám',
    'Státusz',
    'Kezdés',
    'Szünet kezdete',
    'Megszűnés',
    'Lemondás',
    'SZJA Elkészítve',
    'SZJA Beadva',
    'SZJA Értesítő kiküldve',
    'SZJA Számla fizetve',
    'IPA Beadva',
    'IPA Értesítő kiküldve',
    'IPA',
    'Felelős',
    'Magas prioritás',
    'Kivétel',
    'Megjegyzés',
  ]

  const rows = items.map(({ client, startDate, pauseStartDate, endDate, cancellationDate, isException }) => {
    const szja = client.szja2025 || {}
    return [
      client.nev || '',
      client.adoszam || '',
      client.statusz || '',
      formatDate(startDate),
      formatDate(pauseStartDate),
      formatDate(endDate),
      formatDate(cancellationDate),
      szja.bevallasElkeszitve ? 'Igen' : 'Nem',
      szja.bevallasBeadva ? 'Igen' : 'Nem',
      szja.szjaErtesitoKikulve ? 'Igen' : 'Nem',
      szja.szjaSzamlaFizetve ? 'Igen' : 'Nem',
      szja.hipaBeadva ? 'Igen' : 'Nem',
      szja.hipaErtesitoKikulve ? 'Igen' : 'Nem',
      getClientIpaValue(client),
      szja.assignedTo || '',
      szja.highPriority ? 'Igen' : '',
      isException ? 'Igen' : '',
      szja.megjegyzes || '',
    ]
  })

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'SZJA 2025')

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(workbook, `szja-export-${stamp}.xlsx`)
}

function SzjaTasksPage() {
  const { clients, loading, error } = useClientsCache()
  const { fields } = useClientSchema()
  const { user } = useAuth()
  const { profile, profiles } = useUserProfile()
  const [activeTab, setActiveTab] = useState('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [szjaInvoiceFilter, setSzjaInvoiceFilter] = useState('')
  const [clientStatusFilter, setClientStatusFilter] = useState('')
  const [ipaFilter, setIpaFilter] = useState('')
  const [stepFilters, setStepFilters] = useState(() => createInitialStepFilters())
  const [detailedFiltersOpen, setDetailedFiltersOpen] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedClientIds, setSelectedClientIds] = useState([])
  const [bulkAssignSaving, setBulkAssignSaving] = useState(false)
  const [assignMenu, setAssignMenu] = useState({ open: false, x: 0, y: 0 })
  const [exceptionPickerOpen, setExceptionPickerOpen] = useState(false)
  const [exceptionSearchTerm, setExceptionSearchTerm] = useState('')
  const [selectedExceptionIds, setSelectedExceptionIds] = useState([])
  const [exceptionSaving, setExceptionSaving] = useState(false)
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState('')
  const [ticketPriority, setTicketPriority] = useState('medium')
  const [ticketDueDate, setTicketDueDate] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [freezeSaving, setFreezeSaving] = useState(false)
  const { freezeState, loading: freezeLoading, error: freezeError } = useSzjaFreezeState()

  const ipaField = useMemo(
    () => fields.find((field) => field.key === 'ipa') || { label: 'IPA', options: [] },
    [fields]
  )

  const statusOptions = useMemo(() => {
    const statuses = clients.map((client) => String(client.statusz || '').trim()).filter(Boolean)
    return Array.from(new Set(statuses)).sort((a, b) => a.localeCompare(b, 'hu'))
  }, [clients])

  const assigneeOptions = useMemo(() => {
    const profileNames = (profiles || [])
      .map((entry) => (entry.username || entry.email || '').trim())
      .filter(Boolean)
    const assignedNames = clients
      .map((client) => String(client?.szja2025?.assignedTo || '').trim())
      .filter(Boolean)
    return Array.from(new Set([...profileNames, ...assignedNames])).sort((a, b) => a.localeCompare(b, 'hu'))
  }, [clients, profiles])

  const actorName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return 'Ismeretlen'
  }, [profile, user])
  const userIdentitySet = useMemo(() => buildUserIdentitySet(user, profile), [user, profile])

  const dynamicGroups = useMemo(() => {
    const activeStartedBy2025 = []
    const pausedOrTerminated = []
    const excludedClients = []

    clients.forEach((client) => {
      const classification = classifyClientForSzja(client)
      const exception = getSzjaException(client)
      const baseItem = buildSzjaItem(client, {
        exclusionReason: classification.exclusionReason,
      })

      if (classification.targetGroup === 'active') {
        activeStartedBy2025.push(baseItem)
        return
      }

      if (classification.targetGroup === 'pausedOrEnded') {
        pausedOrTerminated.push(baseItem)
        return
      }

      if (exception.included) {
        const exceptionItem = {
          ...baseItem,
          isException: true,
        }
        if (exception.target === 'pausedOrEnded') pausedOrTerminated.push(exceptionItem)
        else activeStartedBy2025.push(exceptionItem)
        return
      }

      excludedClients.push(baseItem)
    })

    const sortedActive = sortSzjaItems(activeStartedBy2025)
    const sortedPaused = sortSzjaItems(pausedOrTerminated)

    return {
      activeStartedBy2025: sortedActive,
      pausedOrTerminated: sortedPaused,
      excludedClients: sortSzjaItems(excludedClients),
      exceptionCount: sortedActive.filter((item) => item.isException).length + sortedPaused.filter((item) => item.isException).length,
    }
  }, [clients])

  const groups = useMemo(() => {
    if (!freezeState.frozen) return dynamicGroups

    const clientsById = new Map(clients.map((client) => [client.id, client]))
    const activeStartedBy2025 = buildFrozenSzjaItems(freezeState.activeIds, clientsById)
    const pausedOrTerminated = buildFrozenSzjaItems(freezeState.pausedOrEndedIds, clientsById)

    return {
      activeStartedBy2025,
      pausedOrTerminated,
      excludedClients: [],
      exceptionCount: activeStartedBy2025.filter((item) => item.isException).length + pausedOrTerminated.filter((item) => item.isException).length,
    }
  }, [clients, dynamicGroups, freezeState])

  const totalMatches = groups.activeStartedBy2025.length + groups.pausedOrTerminated.length

  const activeTabConfig =
    activeTab === 'active'
      ? {
          id: 'active',
          title: 'Aktív most (vagy 2026-ban szünetelő/megszűnt)',
          subtitle: freezeState.frozen
            ? 'Fagyasztott lista: a tagság nem változik státusz- vagy dátummódosításoktól.'
            : 'Kezdés mindenkinél: 2025-ben vagy korábban. Olyanok is itt vannak, akik csak 2026-ban szüneteltették vagy szüntették meg.',
          items: groups.activeStartedBy2025,
          headerAction: freezeState.frozen ? null : (
            <ExceptionPicker
              open={exceptionPickerOpen}
              onToggleOpen={() => setExceptionPickerOpen((prev) => !prev)}
              items={groups.excludedClients}
              searchTerm={exceptionSearchTerm}
              onSearchChange={setExceptionSearchTerm}
              selectedIds={selectedExceptionIds}
              onToggleSelection={(clientId) =>
                setSelectedExceptionIds((prev) =>
                  prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
                )
              }
              onAddSelected={async () => {
                if (!selectedExceptionIds.length) return
                setExceptionSaving(true)
                try {
                  await Promise.all(selectedExceptionIds.map((clientId) => updateSzjaException(clientId, true, 'active')))
                  setSelectedExceptionIds([])
                  setExceptionSearchTerm('')
                  setExceptionPickerOpen(false)
                  setActiveTab('active')
                } finally {
                  setExceptionSaving(false)
                }
              }}
              saving={exceptionSaving}
              description="A normál szűrésből kimaradt ügyfelek az aktív listához adhatók."
              addButtonLabel="Hozzáadás az aktív listához"
            />
          ),
        }
      : {
          id: 'pausedOrEnded',
          title: 'Szünetel / Megszűnt',
          subtitle: freezeState.frozen
            ? 'Fagyasztott lista: a tagság nem változik státusz- vagy dátummódosításoktól.'
            : 'Közös szabály: kezdés 2025-ben vagy korábban. De szünetelt vagy megszűnt 2025 folyamán.',
          items: groups.pausedOrTerminated,
          headerAction: freezeState.frozen ? null : (
            <ExceptionPicker
              open={exceptionPickerOpen}
              onToggleOpen={() => setExceptionPickerOpen((prev) => !prev)}
              items={groups.excludedClients}
              searchTerm={exceptionSearchTerm}
              onSearchChange={setExceptionSearchTerm}
              selectedIds={selectedExceptionIds}
              onToggleSelection={(clientId) =>
                setSelectedExceptionIds((prev) =>
                  prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
                )
              }
              onAddSelected={async () => {
                if (!selectedExceptionIds.length) return
                setExceptionSaving(true)
                try {
                  await Promise.all(
                    selectedExceptionIds.map((clientId) => updateSzjaException(clientId, true, 'pausedOrEnded'))
                  )
                  setSelectedExceptionIds([])
                  setExceptionSearchTerm('')
                  setExceptionPickerOpen(false)
                  setActiveTab('pausedOrEnded')
                } finally {
                  setExceptionSaving(false)
                }
              }}
              saving={exceptionSaving}
              description="A normál szűrésből kimaradt ügyfelek a szünetelő/megszűnt listához adhatók."
              addButtonLabel="Hozzáadás a szünetelő/megszűnt listához"
            />
          ),
        }

  const ownProgress = useMemo(() => {
    if (!userIdentitySet.size) return null

    const ownItems = activeTabConfig.items.filter(({ client }) =>
      userIdentitySet.has(String(client.szja2025?.assignedTo || '').trim().toLowerCase())
    )
    const total = ownItems.length
    const done = ownItems.filter(({ client }) => Boolean(client.szja2025?.bevallasBeadva)).length

    return {
      name: actorName,
      total,
      done,
      percent: total ? Math.round((done / total) * 100) : 0,
      accent: profile?.themeColor || '',
    }
  }, [activeTabConfig.items, actorName, profile, userIdentitySet])

  const activeStepFilters = useMemo(
    () =>
      SZJA_CHECKLIST_FIELDS.filter(({ key }) => {
        const value = String(stepFilters[key] || STEP_FILTER_ANY)
        return value === STEP_FILTER_DONE || value === STEP_FILTER_PENDING
      }),
    [stepFilters]
  )

  const visibleItems = useMemo(
    () =>
      getVisibleItems(
        activeTabConfig.items,
        searchTerm,
        assigneeFilter,
        szjaInvoiceFilter,
        stepFilters,
        clientStatusFilter,
        ipaFilter
      ),
    [activeTabConfig.items, searchTerm, assigneeFilter, szjaInvoiceFilter, stepFilters, clientStatusFilter, ipaFilter]
  )

  const assigneeMatchCount = useMemo(() => {
    if (!assigneeFilter) return 0
    const filterValue = assigneeFilter.trim().toLowerCase()
    return activeTabConfig.items.filter(
      ({ client }) => String(client.szja2025?.assignedTo || '').trim().toLowerCase() === filterValue
    ).length
  }, [activeTabConfig.items, assigneeFilter])
  const hasActiveFilters = Boolean(
    assigneeFilter ||
      szjaInvoiceFilter ||
      searchTerm.trim() ||
      activeStepFilters.length ||
      clientStatusFilter ||
      ipaFilter
  )
  const szjaInvoiceFilterLabel =
    szjaInvoiceFilter === 'paid' ? 'Fizetve' : szjaInvoiceFilter === 'unpaid' ? 'Nincs fizetve' : ''
  const tabsControls = (
    <div className="szja-controls-shell">
      <div className="szja-tabs-row">
        <div className="details-tabs" role="tablist" aria-label="SZJA csoportok">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'active'}
            className={`details-tab${activeTab === 'active' ? ' active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            Aktív 2025-ben ({groups.activeStartedBy2025.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pausedOrEnded'}
            className={`details-tab${activeTab === 'pausedOrEnded' ? ' active' : ''}`}
            onClick={() => setActiveTab('pausedOrEnded')}
          >
            Szünetelt/Megszűnt 2025-ben ({groups.pausedOrTerminated.length})
          </button>
        </div>
      </div>
    </div>
  )
  const sectionControls = (
    <div className="szja-controls-shell">
      <div className="szja-toolbar-controls" aria-label="SZJA szűrők">
        <label className="szja-toolbar-field">
          <span className="szja-toolbar-label">Felelős</span>
          <select className="input search-field" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
            <option value="">Összes felelős</option>
            {assigneeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="szja-toolbar-field">
          <span className="szja-toolbar-label">SZJA számla</span>
          <select className="input search-field" value={szjaInvoiceFilter} onChange={(event) => setSzjaInvoiceFilter(event.target.value)}>
            <option value="">Mind</option>
            <option value="paid">Fizetve</option>
            <option value="unpaid">Nincs fizetve</option>
          </select>
        </label>

        <label className="szja-toolbar-field szja-toolbar-field--search">
          <span className="szja-toolbar-label">Keresés</span>
          <input
            type="text"
            className="input search-field"
            placeholder="Név vagy adószám..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <button
          type="button"
          className={`utalando-disclosure-toggle szja-detailed-toggle${detailedFiltersOpen ? ' is-active' : ''}`}
          onClick={() => setDetailedFiltersOpen((prev) => !prev)}
          aria-expanded={detailedFiltersOpen}
        >
          {detailedFiltersOpen ? <TbChevronUp /> : <TbChevronDown />}
          Részletes szűrők
        </button>

        {hasActiveFilters ? (
          <button
            type="button"
            className="btn ghost szja-clear-filters"
            onClick={() => {
              setAssigneeFilter('')
              setSzjaInvoiceFilter('')
              setSearchTerm('')
              setClientStatusFilter('')
              setIpaFilter('')
              setStepFilters(createInitialStepFilters())
            }}
          >
            Szűrők törlése
          </button>
        ) : null}
      </div>

      {detailedFiltersOpen ? (
        <div className="szja-detailed-filters" aria-label="Részletes SZJA szűrők">
          <label className="szja-toolbar-field szja-detailed-filters__field">
            <span className="szja-toolbar-label">Ügyfél státusz</span>
            <select
              className="input search-field"
              value={clientStatusFilter}
              onChange={(event) => setClientStatusFilter(event.target.value)}
            >
              <option value="">Mind</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="szja-toolbar-field szja-detailed-filters__field">
            <span className="szja-toolbar-label">IPA</span>
            <select
              className="input search-field"
              value={ipaFilter}
              onChange={(event) => setIpaFilter(event.target.value)}
            >
              <option value="">Mind</option>
              {ipaField.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {SZJA_CHECKLIST_FIELDS.map((field) => (
            <label key={field.key} className="szja-toolbar-field szja-detailed-filters__field">
              <span className="szja-toolbar-label">{field.label}</span>
              <select
                className="input search-field"
                value={stepFilters[field.key] || STEP_FILTER_ANY}
                onChange={(event) =>
                  setStepFilters((prev) => ({
                    ...prev,
                    [field.key]: event.target.value,
                  }))
                }
              >
                <option value={STEP_FILTER_ANY}>Mind</option>
                <option value={STEP_FILTER_DONE}>Kész</option>
                <option value={STEP_FILTER_PENDING}>Nincs kész</option>
              </select>
            </label>
          ))}
        </div>
      ) : null}

      {hasActiveFilters ? (
        <div className="szja-summary-line">
          {assigneeFilter ? <span className="szja-filter-pill">Felelős: {assigneeFilter}</span> : null}
          {szjaInvoiceFilterLabel ? <span className="szja-filter-pill">SZJA számla: {szjaInvoiceFilterLabel}</span> : null}
          {searchTerm.trim() ? <span className="szja-filter-pill">Keresés: {searchTerm.trim()}</span> : null}
          {clientStatusFilter ? <span className="szja-filter-pill">Státusz: {clientStatusFilter}</span> : null}
          {ipaFilter ? <span className="szja-filter-pill">IPA: {ipaFilter}</span> : null}
          {activeStepFilters.map((field) => {
            const label = stepFilters[field.key] === STEP_FILTER_DONE ? 'Kész' : 'Nincs kész'
            return (
              <span key={field.key} className="szja-filter-pill">
                {field.label}: {label}
              </span>
            )
          })}
          {assigneeFilter ? (
            <span className="szja-filter-meta">{assigneeMatchCount} ügyfél van ehhez a felelőshöz ebben a listában</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  const selectedItem = useMemo(
    () => activeTabConfig.items.find(({ client }) => client.id === selectedClientId) || null,
    [activeTabConfig.items, selectedClientId]
  )

  useEffect(() => {
    const allowedIds = new Set(groups.excludedClients.map(({ client }) => client.id))
    setSelectedExceptionIds((prev) => prev.filter((id) => allowedIds.has(id)))
  }, [groups.excludedClients])

  useEffect(() => {
    setExceptionPickerOpen(false)
    setExceptionSearchTerm('')
    setSelectedExceptionIds([])
    setSelectedClientIds([])
    setSelectionMode(false)
    setAssignMenu({ open: false, x: 0, y: 0 })
    setDetailModalOpen(false)
  }, [activeTab])

  useEffect(() => {
    if (!activeTabConfig.items.length) {
      if (selectedClientId) setSelectedClientId('')
      setDetailModalOpen(false)
      return
    }

    const isSelectedStillVisible = activeTabConfig.items.some(({ client }) => client.id === selectedClientId)
    if (!isSelectedStillVisible) {
      setSelectedClientId(activeTabConfig.items[0].client.id)
      setDetailModalOpen(false)
    }
  }, [activeTabConfig.items, selectedClientId])

  useEffect(() => {
    const allowedIds = new Set(activeTabConfig.items.map(({ client }) => client.id))
    setSelectedClientIds((prev) => prev.filter((id) => allowedIds.has(id)))
  }, [activeTabConfig.items])

  useEffect(() => {
    if (selectionMode && selectedClientIds.length === 0) {
      setSelectionMode(false)
      setAssignMenu({ open: false, x: 0, y: 0 })
    }
  }, [selectedClientIds, selectionMode])

  useEffect(() => {
    if (!assignMenu.open) return undefined

    const closeMenu = () => setAssignMenu({ open: false, x: 0, y: 0 })
    const handlePointerDown = (event) => {
      if (event.target?.closest?.('[data-szja-assign-menu="true"]')) return
      closeMenu()
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('scroll', closeMenu, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('scroll', closeMenu, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [assignMenu.open])

  const handleToggleChecked = (clientId) => {
    setSelectionMode(true)
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    )
  }

  const handleToggleSelectAllVisible = () => {
    const visibleIds = visibleItems.map(({ client }) => client.id)
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedClientIds.includes(id))

    setSelectedClientIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id))
      }
      return Array.from(new Set([...prev, ...visibleIds]))
    })
  }

  const handleClientLongPress = (clientId) => {
    setSelectionMode(true)
    setSelectedClientIds((prev) => (prev.includes(clientId) ? prev : [...prev, clientId]))
  }

  const handleSelectClient = (clientId) => {
    if (selectionMode) {
      handleToggleChecked(clientId)
      return
    }
    setSelectedClientId(clientId)
    setDetailModalOpen(true)
  }

  const handleClearSelection = () => {
    setSelectedClientIds([])
    setSelectionMode(false)
    setAssignMenu({ open: false, x: 0, y: 0 })
  }

  const handleOpenAssignMenu = (event, clientId) => {
    if (!selectionMode) return
    const targetSelected = selectedClientIds.includes(clientId)
    const nextSelectedIds = targetSelected ? selectedClientIds : [...selectedClientIds, clientId]
    if (!nextSelectedIds.length) return

    if (!targetSelected) {
      setSelectedClientIds(nextSelectedIds)
    }

    const menuWidth = 220
    const menuHeight = Math.min(56 + (assigneeOptions.length + 2) * 42, 360)
    const nextX = Math.min(event.clientX, window.innerWidth - menuWidth - 12)
    const nextY = Math.min(event.clientY, window.innerHeight - menuHeight - 12)
    setAssignMenu({ open: true, x: Math.max(12, nextX), y: Math.max(12, nextY) })
  }

  const handleAssignSelected = async (assignedTo) => {
    if (!selectedClientIds.length) return
    setBulkAssignSaving(true)
    try {
      await updateSzjaAssignees(selectedClientIds, assignedTo)
      setAssignMenu({ open: false, x: 0, y: 0 })
    } finally {
      setBulkAssignSaving(false)
    }
  }

  const handleFreezeCurrentList = async () => {
    setFreezeSaving(true)
    try {
      await setDoc(
        doc(db, 'taskFreezes', SZJA_FREEZE_DOC_ID),
        {
          frozen: true,
          year: SZJA_TASK_YEAR,
          activeIds: dynamicGroups.activeStartedBy2025.map(({ client }) => client.id),
          pausedOrEndedIds: dynamicGroups.pausedOrTerminated.map(({ client }) => client.id),
          frozenAt: serverTimestamp(),
          frozenBy: actorName || 'Ismeretlen',
        },
        { merge: true }
      )
      setExceptionPickerOpen(false)
      setSelectedExceptionIds([])
      setExceptionSearchTerm('')
    } finally {
      setFreezeSaving(false)
    }
  }

  const handleUnfreezeList = async () => {
    setFreezeSaving(true)
    try {
      await setDoc(
        doc(db, 'taskFreezes', SZJA_FREEZE_DOC_ID),
        {
          frozen: false,
          unfrozenAt: serverTimestamp(),
          unfrozenBy: actorName || 'Ismeretlen',
        },
        { merge: true }
      )
    } finally {
      setFreezeSaving(false)
    }
  }

  const handleOpenTaskTicket = (client) => {
    if (!client) return
    setTicketClient(client)
    setTicketDescription('')
    setTicketAssignee(actorName || '')
    setTicketPriority('medium')
    setTicketDueDate('')
    setTicketError('')
  }

  const handleCreateTaskTicket = async (attachments = []) => {
    if (!ticketClient) return
    if (!ticketDescription.trim() || !ticketAssignee) {
      setTicketError('Add meg a leírást és a felelőst.')
      return
    }

    try {
      setTicketSaving(true)
      setTicketError('')
      const ref = await createTicket({
        clientId: ticketClient.id,
        clientName: ticketClient.nev || 'Ismeretlen ügyfél',
        description: ticketDescription.trim(),
        status: 'Nyitott',
        createdBy: actorName || 'Ismeretlen',
        assignedTo: ticketAssignee,
        priority: ticketPriority || 'medium',
        dueDate: ticketDueDate || '',
        taskContext: {
          type: 'szja',
          year: SZJA_TASK_YEAR,
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
        meta: { ticketId: ref.id, assignedTo: ticketAssignee, taskType: 'szja', year: SZJA_TASK_YEAR },
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
      <header className="section-header tasks-hero">
        <div className="section-header__top" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <p className="eyebrow">Feladatok</p>
            <h1 className="section-title">SZJA 2025</h1>
            <p className="section-subtitle">Státusz követés és export</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {freezeState.frozen ? (
              <span className="pill">
                Fagyasztva{freezeState.frozenAt ? `: ${formatTimestamp(freezeState.frozenAt)}` : ''}
              </span>
            ) : null}
            <span className="pill">{loading || freezeLoading ? 'Betöltés...' : `${totalMatches} érintett`}</span>
            {!loading && !freezeLoading ? (
              <button
                className="btn ghost"
                onClick={freezeState.frozen ? handleUnfreezeList : handleFreezeCurrentList}
                disabled={freezeSaving}
                style={{ alignSelf: 'center' }}
              >
                {freezeSaving ? 'Mentés...' : freezeState.frozen ? 'Lista feloldása' : 'Jelenlegi lista fagyasztása'}
              </button>
            ) : null}
            {!loading && !freezeLoading ? (
              <button
                className="btn btn-primary"
                onClick={() => handleExportExcel(activeTabConfig.items, activeTabConfig.title)}
                style={{ alignSelf: 'center' }}
              >
                Exportálás Excelbe
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {freezeError ? <div className="banner banner-error">Hiba: {freezeError}</div> : null}

      <section className="panel tickets-panel" style={{ padding: 24, overflow: 'visible' }}>
        {loading || freezeLoading ? (
          <p className="muted">Ügyfelek betöltése...</p>
        ) : (
          <>
            {tabsControls}

            <RuleSection
              key={activeTabConfig.id}
              title={activeTabConfig.title}
              subtitle={activeTabConfig.subtitle}
              items={activeTabConfig.items}
              visibleItems={visibleItems}
              ownProgress={ownProgress}
              selectedItem={selectedItem}
              headerAction={activeTabConfig.headerAction}
              controls={sectionControls}
              selectionMode={selectionMode}
              onSelectClient={handleSelectClient}
              selectedClientIds={selectedClientIds}
              onToggleChecked={handleToggleChecked}
              onToggleSelectAllVisible={handleToggleSelectAllVisible}
              onClearSelection={handleClearSelection}
              onClientLongPress={handleClientLongPress}
              onOpenAssignMenu={handleOpenAssignMenu}
            />
          </>
        )}
      </section>

      {detailModalOpen && selectedItem ? (
        <Modal
          title={selectedItem.client?.nev || 'SZJA részletek'}
          onClose={() => setDetailModalOpen(false)}
          className="modal--compact"
          bodyClassName="szja-modal-body"
        >
          <SzjaDetailContent
            item={selectedItem}
            ipaField={ipaField}
            assigneeOptions={assigneeOptions}
            onOpenTaskTicket={handleOpenTaskTicket}
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
          priority={ticketPriority}
          onChangePriority={setTicketPriority}
          dueDate={ticketDueDate}
          onChangeDueDate={setTicketDueDate}
          currentUser={actorName}
          assigneeOptions={assigneeOptions}
          saving={ticketSaving}
          error={ticketError}
          onCancel={() => setTicketClient(null)}
          onSubmit={handleCreateTaskTicket}
        />
      ) : null}

      <BulkAssignContextMenu
        open={assignMenu.open}
        x={assignMenu.x}
        y={assignMenu.y}
        assigneeOptions={assigneeOptions}
        onAssign={handleAssignSelected}
        onClose={() => setAssignMenu({ open: false, x: 0, y: 0 })}
        saving={bulkAssignSaving}
      />
    </main>
  )
}

export default SzjaTasksPage
