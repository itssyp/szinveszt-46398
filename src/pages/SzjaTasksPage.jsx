import React, { useEffect, useMemo, useState } from 'react'
import { TbFlag } from 'react-icons/tb'
import { useClientsCache } from '../hooks/useClientsCache'
import { useClientSchema } from '../hooks/useClientSchema.jsx'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import * as XLSX from 'xlsx'
import { statusClass } from '../components/ClientCards'

const START_2025 = new Date(2025, 0, 1)
const START_2025_JAN_2 = new Date(2025, 0, 2)
const START_2026 = new Date(2026, 0, 1)

function normalizeStatus(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase()
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

function classifyClientForSzja(client) {
  const statusNorm = normalizeStatus(client.statusz)
  const startDate = parseAnyDate(client.kezdesDatuma)
  const pauseStartDate = parseAnyDate(client.szunetKezdete)
  const endDate = parseAnyDate(client.megszunesDatuma)
  const startedIn2025OrEarlier = Boolean(startDate && startDate < START_2026)

  if (!startDate) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      targetGroup: null,
      exclusionReason: 'Hiányzó vagy érvénytelen kezdési dátum',
    }
  }

  if (!startedIn2025OrEarlier) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      targetGroup: null,
      exclusionReason: 'Kezdés 2026-ban vagy később történt',
    }
  }

  if (statusNorm.startsWith('aktiv')) {
    return { startDate, pauseStartDate, endDate, targetGroup: 'active', exclusionReason: '' }
  }

  if (
    (statusNorm.startsWith('szunet') && pauseStartDate && pauseStartDate >= START_2026) ||
    (statusNorm.startsWith('megsz') && endDate && endDate >= START_2026)
  ) {
    return { startDate, pauseStartDate, endDate, targetGroup: 'active', exclusionReason: '' }
  }

  if (statusNorm.startsWith('szunet') && pauseStartDate && pauseStartDate >= START_2025_JAN_2) {
    return { startDate, pauseStartDate, endDate, targetGroup: 'pausedOrEnded', exclusionReason: '' }
  }

  if (statusNorm.startsWith('megsz') && endDate && endDate >= START_2025) {
    return { startDate, pauseStartDate, endDate, targetGroup: 'pausedOrEnded', exclusionReason: '' }
  }

  if (statusNorm.startsWith('szunet')) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      targetGroup: null,
      exclusionReason: pauseStartDate ? '2025 előtt szünetelt' : 'Hiányzó szünet kezdete',
    }
  }

  if (statusNorm.startsWith('megsz')) {
    return {
      startDate,
      pauseStartDate,
      endDate,
      targetGroup: null,
      exclusionReason: endDate ? '2025 előtt megszűnt' : 'Hiányzó megszűnés dátuma',
    }
  }

  return {
    startDate,
    pauseStartDate,
    endDate,
    targetGroup: null,
    exclusionReason: 'A státusz nem illik egyik SZJA-listába sem',
  }
}

const toggleSzjaValue = async (clientId, currentSzja2025, field, value) => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, {
      [`szja2025.${field}`]: value
    })
  } catch (err) {
    console.error('Error updating SZJA value', err)
    alert('Hiba történt a mentés során.')
  }
}

const updateIpaValue = async (clientId, value) => {
  try {
    const ref = doc(db, 'clients', clientId)
    await updateDoc(ref, {
      ipa: value,
      'szja2025.hipaValasztas': value,
    })
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

function NotesInput({ clientId, currentSzja2025, initialValue }) {
  const [val, setVal] = useState(initialValue || '')

  const handleBlur = () => {
    if (val !== (initialValue || '')) {
      toggleSzjaValue(clientId, currentSzja2025, 'megjegyzes', val)
    }
  }

  return (
    <input
      type="text"
      className="input"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      placeholder="Megjegyzés..."
      style={{ padding: '8px 10px', fontSize: '0.9rem' }}
    />
  )
}

function RuleSection({
  title,
  subtitle,
  items,
  searchTerm,
  ipaField,
  headerAction = null,
  contextMenu = { clientId: '', x: 0, y: 0 },
  onClientContextMenu = () => {},
  onPriorityToggle = () => {},
}) {
  // A custom grid to securely fit all columns without auto-wrapping or side-scrolling
  const gridTemplate = 'minmax(200px, 1.2fr) repeat(6, 85px) 110px minmax(140px, 1fr)'

  const visibleItems = useMemo(() => {
    if (!searchTerm) return items
    const term = searchTerm.toLowerCase()
    return items.filter(({ client }) => {
      const name = (client.nev || '').toLowerCase()
      const adoszam = (client.adoszam || '').toLowerCase()
      return name.includes(term) || adoszam.includes(term)
    })
  }, [items, searchTerm])

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

      {visibleItems.length ? (
        <div className="table" style={{ minWidth: 960, overflow: 'visible' }}>
          <div className="table-head" style={{ gridTemplateColumns: gridTemplate, position: 'sticky', top: 80, zIndex: 10, borderBottom: '1px solid var(--border)'}}>
            <span>Ügyfél neve és adószáma</span>
              <span className="text-center" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>SZJA<br/>Elkészítve</span>
              <span className="text-center" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>SZJA<br/>Beadva</span>
              <span className="text-center" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>SZJA<br/>Értesítő</span>
              <span className="text-center" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>SZJA<br/>Számla</span>
              <span className="text-center" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>IPA<br/>Beadva</span>
              <span className="text-center" style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>IPA<br/>Értesítő</span>
              <span style={{ fontSize: '0.8rem', lineHeight: '1.2' }}>{ipaField.label}</span>
              <span>Megjegyzés</span>
            </div>

            {visibleItems.map((item) => {
              const { client, isException, exclusionReason } = item
              const szja = client.szja2025 || {}
              const isHighPriority = Boolean(szja.highPriority)
              return (
                <div className="table-row" style={{ gridTemplateColumns: gridTemplate }} key={client.id}>
                  <div
                    data-szja-context-menu="true"
                    style={{
                      paddingLeft: 12,
                      borderLeft: isHighPriority ? '3px solid #dc2626' : '3px solid transparent',
                      borderRadius: 8,
                      background: isHighPriority ? 'linear-gradient(90deg, #fff7f7 0%, #ffffff 24%)' : 'transparent',
                    }}
                    onContextMenu={(event) => onClientContextMenu(event, client.id)}
                  >
                    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span className={statusClass(client.statusz)} aria-hidden="true" />
                        <span style={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {client.nev || 'Név hiányzik'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          {client.adoszam || '-'}
                        </span>
                        {isException ? (
                          <span
                            className="pill"
                            style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e' }}
                          >
                            Kivétel
                          </span>
                        ) : null}
                      </div>

                      {isException ? (
                        <div className="muted" style={{ fontSize: '0.8rem', lineHeight: 1.35 }}>
                          Kézzel hozzáadva{exclusionReason ? ` • ${exclusionReason}` : ''}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <label className="switch" style={{ display: 'inline-block' }}>
                      <input
                        type="checkbox"
                        checked={!!szja.bevallasElkeszitve}
                        onChange={(e) => toggleSzjaValue(client.id, szja, 'bevallasElkeszitve', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                  
                  <div className="text-center">
                    <label className="switch" style={{ display: 'inline-block' }}>
                      <input
                        type="checkbox"
                        checked={!!szja.bevallasBeadva}
                        onChange={(e) => toggleSzjaValue(client.id, szja, 'bevallasBeadva', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                  
                  <div className="text-center">
                    <label className="switch" style={{ display: 'inline-block' }}>
                      <input
                        type="checkbox"
                        checked={!!szja.szjaErtesitoKikulve}
                        onChange={(e) => toggleSzjaValue(client.id, szja, 'szjaErtesitoKikulve', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                  
                  <div className="text-center">
                    <label className="switch" style={{ display: 'inline-block' }}>
                      <input
                        type="checkbox"
                        checked={!!szja.szjaSzamlaFizetve}
                        onChange={(e) => toggleSzjaValue(client.id, szja, 'szjaSzamlaFizetve', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                  
                  <div className="text-center">
                    <label className="switch" style={{ display: 'inline-block' }}>
                      <input
                        type="checkbox"
                        checked={!!szja.hipaBeadva}
                        onChange={(e) => toggleSzjaValue(client.id, szja, 'hipaBeadva', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                  
                  <div className="text-center">
                    <label className="switch" style={{ display: 'inline-block' }}>
                      <input
                        type="checkbox"
                        checked={!!szja.hipaErtesitoKikulve}
                        onChange={(e) => toggleSzjaValue(client.id, szja, 'hipaErtesitoKikulve', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                  </div>
                  
                  <div>
                    <select
                      className="input"
                      value={client.ipa || szja.hipaValasztas || ''}
                      onChange={(e) => updateIpaValue(client.id, e.target.value)}
                      style={{ padding: '8px 10px', fontSize: '0.9rem' }}
                    >
                      <option value="">Nincs megadva</option>
                      {ipaField.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ display: 'grid', gap: 8 }}>
                    <NotesInput clientId={client.id} currentSzja2025={szja} initialValue={szja.megjegyzes} />
                    {isException ? (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => updateSzjaException(client.id, false)}
                        style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                      >
                        Kivétel törlése
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
        </div>
      ) : (
        <p className="muted">Nincs találat.</p>
      )}

      {contextMenu.clientId ? (
        <div
          role="menu"
          data-szja-context-menu="true"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            padding: 4,
            background: 'transparent',
            boxShadow: 'none',
            zIndex: 30,
          }}
        >
          {(() => {
            const matched = items.find(({ client }) => client.id === contextMenu.clientId)
            const isHighPriority = Boolean(matched?.client?.szja2025?.highPriority)
            return (
          <button
            type="button"
            role="menuitem"
            className="btn ghost"
            onClick={() => {
              const nextValue = !Boolean(matched?.client?.szja2025?.highPriority)
              onPriorityToggle(contextMenu.clientId, nextValue)
            }}
            aria-label="Magas prioritás"
            title="Magas prioritás"
            style={{
              minWidth: 34,
              width: 34,
              height: 34,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `1px solid ${isHighPriority ? '#fca5a5' : '#dbe4f0'}`,
              background: isHighPriority ? '#fef2f2' : '#f8fafc',
              color: isHighPriority ? '#dc2626' : '#94a3b8',
              boxShadow: 'none',
              borderRadius: 8,
            }}
          >
            <TbFlag size={20} />
          </button>
            )
          })()}
        </div>
      ) : null}
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
}) {
  const visibleItems = useMemo(() => {
    const term = String(searchTerm || '').trim().toLowerCase()
    return term
      ? items.filter(({ client }) => {
          const name = (client.nev || '').toLowerCase()
          const adoszam = (client.adoszam || '').toLowerCase()
          return name.includes(term) || adoszam.includes(term)
        })
      : items
  }, [items, searchTerm])

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
                A normál szűrésből kimaradt ügyfelek az aktív listához adhatók.
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
                onChange={(e) => onSearchChange(e.target.value)}
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
                    {saving ? 'Hozzáadás...' : 'Hozzáadás az aktív listához'}
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
    'SZJA Elkészítve',
    'SZJA Beadva',
    'SZJA Értesítő kiküldve',
    'SZJA Számla fizetve',
    'IPA Beadva',
    'IPA Értesítő kiküldve',
    'IPA',
    'Magas prioritás',
    'Kivétel',
    'Megjegyzés'
  ]

  const rows = items.map(({ client, startDate, pauseStartDate, endDate, isException }) => {
    const szja = client.szja2025 || {}
    return [
      client.nev || '',
      client.adoszam || '',
      client.statusz || '',
      formatDate(startDate),
      formatDate(pauseStartDate),
      formatDate(endDate),
      szja.bevallasElkeszitve ? 'Igen' : 'Nem',
      szja.bevallasBeadva ? 'Igen' : 'Nem',
      szja.szjaErtesitoKikulve ? 'Igen' : 'Nem',
      szja.szjaSzamlaFizetve ? 'Igen' : 'Nem',
      szja.hipaBeadva ? 'Igen' : 'Nem',
      szja.hipaErtesitoKikulve ? 'Igen' : 'Nem',
      client.ipa || szja.hipaValasztas || '',
      szja.highPriority ? 'Igen' : '',
      isException ? 'Igen' : '',
      szja.megjegyzes || ''
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
  const [activeTab, setActiveTab] = useState('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [contextMenu, setContextMenu] = useState({ clientId: '', x: 0, y: 0 })
  const [exceptionPickerOpen, setExceptionPickerOpen] = useState(false)
  const [exceptionSearchTerm, setExceptionSearchTerm] = useState('')
  const [selectedExceptionIds, setSelectedExceptionIds] = useState([])
  const [exceptionSaving, setExceptionSaving] = useState(false)

  const ipaField = useMemo(
    () => fields.find((field) => field.key === 'ipa') || { label: 'IPA', options: [] },
    [fields]
  )

  const groups = useMemo(() => {
    const activeStartedBy2025 = []
    const pausedOrTerminated = []
    const excludedClients = []

    clients.forEach((client) => {
      const classification = classifyClientForSzja(client)
      const exception = getSzjaException(client)
      const baseItem = {
        client,
        startDate: classification.startDate,
        pauseStartDate: classification.pauseStartDate,
        endDate: classification.endDate,
        exclusionReason: classification.exclusionReason,
        isException: false,
      }

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

  const totalMatches = groups.activeStartedBy2025.length + groups.pausedOrTerminated.length

  useEffect(() => {
    const allowedIds = new Set(groups.excludedClients.map(({ client }) => client.id))
    setSelectedExceptionIds((prev) => prev.filter((id) => allowedIds.has(id)))
  }, [groups.excludedClients])

  useEffect(() => {
    if (!contextMenu.clientId) return undefined

    const closeMenu = () => setContextMenu({ clientId: '', x: 0, y: 0 })
    const handlePointerDown = (event) => {
      if (event.target?.closest?.('[data-szja-context-menu="true"]')) return
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
  }, [contextMenu.clientId])

  useEffect(() => {
    const visibleClientIds = new Set([
      ...groups.activeStartedBy2025.map(({ client }) => client.id),
      ...groups.pausedOrTerminated.map(({ client }) => client.id),
    ])

    if (contextMenu.clientId && !visibleClientIds.has(contextMenu.clientId)) {
      setContextMenu({ clientId: '', x: 0, y: 0 })
    }
  }, [contextMenu.clientId, groups.activeStartedBy2025, groups.pausedOrTerminated])

  const handleToggleExceptionSelection = (clientId) => {
    setSelectedExceptionIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]
    )
  }

  const handleAddSelectedExceptions = async () => {
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
  }

  const handleClientContextMenu = (event, clientId) => {
    event.preventDefault()
    const menuWidth = 44
    const menuHeight = 44
    const nextX = Math.min(event.clientX, window.innerWidth - menuWidth - 12)
    const nextY = Math.min(event.clientY, window.innerHeight - menuHeight - 12)
    setContextMenu({ clientId, x: Math.max(12, nextX), y: Math.max(12, nextY) })
  }

  const handlePriorityToggle = async (clientId, highPriority) => {
    await updateSzjaPriority(clientId, highPriority)
    setContextMenu({ clientId: '', x: 0, y: 0 })
  }
  
  const activeTabConfig =
    activeTab === 'active'
      ? {
          id: 'active',
          title: 'Aktív most (vagy 2026-ban szünetelő/megszűnt)',
          subtitle: 'Kezdés mindenkinél: 2025-ben vagy korábban. Olyanok is itt vannak, akik csak 2026-ban szüneteltették/szüntették meg.',
          items: groups.activeStartedBy2025,
          headerAction: (
            <ExceptionPicker
              open={exceptionPickerOpen}
              onToggleOpen={() => setExceptionPickerOpen((prev) => !prev)}
              items={groups.excludedClients}
              searchTerm={exceptionSearchTerm}
              onSearchChange={setExceptionSearchTerm}
              selectedIds={selectedExceptionIds}
              onToggleSelection={handleToggleExceptionSelection}
              onAddSelected={handleAddSelectedExceptions}
              saving={exceptionSaving}
            />
          ),
        }
      : {
          id: 'pausedOrEnded',
          title: 'Szünetel / Megszűnt',
          subtitle:
            'Közös szabály: kezdés 2025-ben vagy korábban. De szünetelt/megszűnt 2025 folyamán.',
          items: groups.pausedOrTerminated,
          headerAction: null,
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
            <span className="pill">{loading ? 'Betöltés...' : `${totalMatches} érintett`}</span>
            {!loading && (
              <button 
                className="btn btn-primary" 
                onClick={() => handleExportExcel(activeTabConfig.items, activeTabConfig.title)}
                style={{ alignSelf: 'center' }}
              >
                Exportálás Excelbe
              </button>
            )}
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <section className="panel tickets-panel" style={{ padding: 24, overflow: 'visible' }}>
        {loading ? (
          <p className="muted">Ügyfelek betöltése...</p>
        ) : (
          <>
            <div className="details-top" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
                <input 
                  type="text" 
                  className="input search-field" 
                  placeholder="Keresés név vagy adószám alapján..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ maxWidth: 300 }}
                />
              </div>
            </div>

            <RuleSection
              key={activeTabConfig.id}
              title={activeTabConfig.title}
              subtitle={activeTabConfig.subtitle}
              items={activeTabConfig.items}
              searchTerm={searchTerm}
              ipaField={ipaField}
              headerAction={activeTabConfig.headerAction}
              contextMenu={contextMenu}
              onClientContextMenu={handleClientContextMenu}
              onPriorityToggle={handlePriorityToggle}
            />
          </>
        )}
      </section>
    </main>
  )
}

export default SzjaTasksPage
