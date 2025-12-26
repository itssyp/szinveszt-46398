import React, { useEffect, useRef, useState } from 'react'
import { useNavOnlineConnectionTest } from '../hooks/useNavOnlineConnectionTest'
import useNavInvoices from '../hooks/useNavInvoices'
import Modal from './Modal'
import {
  ActivityTab,
  GeneralTab,
  IncomesTab,
  InvoicesTab,
  NavTab,
  EvStatusTab,
  EvActivityTab,
} from '../features/clients/components/ClientDetailSections'
import {
  createEvActivityPeriod,
  createEvStatusSegment,
  deleteEvActivityPeriod,
  deleteEvStatusSegment,
  updateEvActivityPeriod,
  updateEvStatusSegment,
} from '../services/evData'

function formatValue(key, value, fields) {
  const fieldMeta = fields.find((f) => f.key === key)
  if (fieldMeta?.type === 'date') {
    if (value && typeof value === 'object' && value.toDate) {
      return value.toDate().toLocaleDateString('hu-HU')
    }
    const date = value ? new Date(value) : null
    if (date && !Number.isNaN(date.getTime())) return date.toLocaleDateString('hu-HU')
    return '-'
  }
  if (fieldMeta?.type === 'boolean') {
    return value ? 'Aktiv' : 'Inaktiv'
  }
  if (fieldMeta?.type === 'multiselect') {
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'string') return value
  }
  return value || '-'
}

function formatAmount(amount, currency) {
  if (amount == null) return '-'
  const num = Number(amount)
  if (Number.isNaN(num)) return '-'
  const decimals = String(amount).includes('.') ? String(amount).split('.')[1].length : 0
  const maxFractionDigits = decimals > 0 ? Math.min(decimals, 6) : 0
  return `${num.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: maxFractionDigits })} ${currency || 'HUF'}`
}

function ClientDetails({
  client,
  actorName,
  onEdit,
  onCreateTicket,
  onViewTickets,
  ticketCount = 0,
  fields,
  groups,
  navKeys = [],
  onNavTestLog,
  activities = [],
  activitiesLoading = false,
  evStatusSegments = [],
  evStatusLoading = false,
  evActivityPeriods = [],
  evActivityLoading = false,
  clientId,
}) {
  const labels = fields.reduce((acc, f) => ({ ...acc, [f.key]: f.label }), {})
  const [activeTab, setActiveTab] = useState('general')
  const [invoiceDirection, setInvoiceDirection] = useState('OUTBOUND')
  const [invoiceRange, setInvoiceRange] = useState(() => {
    const today = new Date()
    const to = today.toISOString().slice(0, 10)
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const from = startOfYear.toISOString().slice(0, 10)
    return { from, to }
  })
  const lastNavStatus = useRef('idle')
  const navLogger = onNavTestLog || (() => {})
  const [evStatusModalOpen, setEvStatusModalOpen] = useState(false)
  const [evActivityModalOpen, setEvActivityModalOpen] = useState(false)
  const [editingEvStatus, setEditingEvStatus] = useState(null)
  const [editingEvActivity, setEditingEvActivity] = useState(null)
  const [evStatusError, setEvStatusError] = useState('')
  const [evActivityError, setEvActivityError] = useState('')
  const [evSaving, setEvSaving] = useState(false)
  const [evActivitySaving, setEvActivitySaving] = useState(false)

  const navTest = useNavOnlineConnectionTest({
    client,
  })

  const invoicesQuery = useNavInvoices({
    client,
    direction: invoiceDirection,
    dateFrom: invoiceRange.from,
    dateTo: invoiceRange.to,
    enabled: activeTab === 'invoices',
  })

  useEffect(() => {
    if (navTest.status === 'idle' || navTest.status === 'running') {
      lastNavStatus.current = navTest.status
      return
    }
    if (lastNavStatus.current === navTest.status) return
    lastNavStatus.current = navTest.status
    const ok = navTest.status === 'success'
    navLogger({
      message: ok ? 'NAV teszt sikeres' : `NAV teszt hiba: ${navTest.error?.message || 'Ismeretlen hiba'}`,
      meta: { ok, error: navTest.error },
    })
  }, [navTest.status, navTest.error, navLogger])

  const generalGroups = groups || []

  const handleSaveEvStatus = async (values) => {
    if (!clientId) {
      setEvStatusError('Hiányzó ügyfél ID.')
      return
    }
    setEvStatusError('')
    setEvSaving(true)
    try {
      if (editingEvStatus?.id) {
        await updateEvStatusSegment(clientId, editingEvStatus.id, values)
      } else {
        await createEvStatusSegment(clientId, values)
      }
      setEvStatusModalOpen(false)
      setEditingEvStatus(null)
    } catch (err) {
      setEvStatusError(err.message || 'Mentési hiba')
    } finally {
      setEvSaving(false)
    }
  }

  const handleDeleteEvStatus = async (id) => {
    if (!clientId || !id) return
    await deleteEvStatusSegment(clientId, id)
  }

  const handleSaveEvActivity = async (values) => {
    if (!clientId) {
      setEvActivityError('Hiányzó ügyfél ID.')
      return
    }
    setEvActivityError('')
    setEvActivitySaving(true)
    try {
      if (editingEvActivity?.id) {
        await updateEvActivityPeriod(clientId, editingEvActivity.id, values)
      } else {
        await createEvActivityPeriod(clientId, values)
      }
      setEvActivityModalOpen(false)
      setEditingEvActivity(null)
    } catch (err) {
      setEvActivityError(err.message || 'Mentési hiba')
    } finally {
      setEvActivitySaving(false)
    }
  }

  const handleDeleteEvActivity = async (id) => {
    if (!clientId || !id) return
    await deleteEvActivityPeriod(clientId, id)
  }

  const hasSuspensionCover = (dateStr) => {
    if (!dateStr) return false
    return evActivityPeriods.some((p) => {
      if (p.state !== 'SUSPENDED') return false
      return dateInRange(p, dateStr)
    })
  }

  const openSuspended = evActivityPeriods.find((p) => p.state === 'SUSPENDED' && !p.to)

  const handleApplySuspended = async (from) => {
    if (!from) return
    await handleSaveEvActivity({
      from,
      to: null,
      state: 'SUSPENDED',
    })
  }

  const handleCloseSuspended = async (toDate) => {
    if (!openSuspended) return
    await updateEvActivityPeriod(clientId, openSuspended.id, {
      from: openSuspended.from,
      to: toDate || new Date().toISOString().slice(0, 10),
      state: openSuspended.state,
    })
  }

  let tabContent = null
  if (activeTab === 'general') {
    tabContent = (
      <GeneralTab
        groups={generalGroups}
        labels={labels}
        client={client}
        fields={fields}
        formatValue={formatValue}
      />
    )
  } else if (activeTab === 'nav') {
    tabContent = <NavTab labels={labels} client={client} navKeys={navKeys} navTest={navTest} onReset={navTest.reset} />
  } else if (activeTab === 'invoices') {
    tabContent = (
      <InvoicesTab
        invoiceDirection={invoiceDirection}
        invoiceRange={invoiceRange}
        setInvoiceDirection={setInvoiceDirection}
        setInvoiceRange={setInvoiceRange}
        invoicesQuery={invoicesQuery}
        formatAmount={formatAmount}
      />
    )
  } else if (activeTab === 'incomes') {
    tabContent = <IncomesTab client={client} formatAmount={formatAmount} clientId={clientId} actorName={actorName} />
  } else if (activeTab === 'ev-status') {
    tabContent = (
      <EvStatusTab
        segments={evStatusSegments}
        loading={evStatusLoading}
        onAdd={() => {
          setEditingEvStatus(null)
          setEvStatusModalOpen(true)
        }}
        onEdit={(segment) => {
          setEditingEvStatus(segment)
          setEvStatusModalOpen(true)
        }}
        onDelete={handleDeleteEvStatus}
      />
    )
  } else if (activeTab === 'ev-activity') {
    tabContent = (
      <EvActivityTab
        periods={evActivityPeriods}
        loading={evActivityLoading}
        onAdd={() => {
          setEditingEvActivity(null)
          setEvActivityModalOpen(true)
        }}
        onEdit={(period) => {
          setEditingEvActivity(period)
          setEvActivityModalOpen(true)
        }}
        onDelete={handleDeleteEvActivity}
      />
    )
  } else {
    tabContent = <ActivityTab activitiesLoading={activitiesLoading} activities={activities} />
  }

  return (
    <div className="details">
      <div className="details-top">
        <div className="details-tabs">
          <button
            type="button"
            className={`details-tab${activeTab === 'general' ? ' active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            Altalanos
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'nav' ? ' active' : ''}`}
            onClick={() => setActiveTab('nav')}
          >
            NAV
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'invoices' ? ' active' : ''}`}
            onClick={() => setActiveTab('invoices')}
          >
            Számlák
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'incomes' ? ' active' : ''}`}
            onClick={() => setActiveTab('incomes')}
          >
            Bevételek
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'activity' ? ' active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Aktivitás
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'ev-status' ? ' active' : ''}`}
            onClick={() => setActiveTab('ev-status')}
          >
            EV jogi státusz
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'ev-activity' ? ' active' : ''}`}
            onClick={() => setActiveTab('ev-activity')}
          >
            Szüneteltetés
          </button>
        </div>

        <div className="details-actions inline">
          <button type="button" className="btn ghost" onClick={onViewTickets} title="Ticketek">
            Ticketek: {ticketCount}
          </button>
          <button type="button" className="btn ghost" onClick={onCreateTicket}>
            Új ticket
          </button>
          <button type="button" className="btn" onClick={onEdit}>
            Szerkesztés
          </button>
        </div>
      </div>

      {tabContent}

      {evStatusModalOpen ? (
        <Modal
          onClose={() => {
            setEvStatusModalOpen(false)
            setEditingEvStatus(null)
            setEvStatusError('')
          }}
          title={editingEvStatus ? 'EV státusz szerkesztése' : 'Új EV státusz'}
        >
          <EvStatusForm
            initialValues={editingEvStatus}
            loading={evSaving}
            error={evStatusError}
            onSubmit={handleSaveEvStatus}
          />
        </Modal>
      ) : null}

      {evActivityModalOpen ? (
        <Modal
          onClose={() => {
            setEvActivityModalOpen(false)
            setEditingEvActivity(null)
            setEvActivityError('')
          }}
          title={editingEvActivity ? 'Időszak szerkesztése' : 'Új időszak'}
        >
          <EvActivityForm
            initialValues={editingEvActivity}
            loading={evActivitySaving}
            error={evActivityError}
            onSubmit={handleSaveEvActivity}
          />
        </Modal>
      ) : null}
    </div>
  )
}

function toDateInputValue(value) {
  if (!value) return ''
  if (value.toDate) {
    return value.toDate().toISOString().slice(0, 10)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function EvStatusForm({ initialValues, onSubmit, loading, error }) {
  const codeFromState = (state) => {
    if (state.isPensioner) return '1343'
    if (state.isMainActivity) return '1341'
    return '1342'
  }

  const applyCode = (code) => {
    if (code === '1343') {
      return { isMainActivity: false, isPensioner: true, hasOtherEmployment: false }
    }
    if (code === '1342') {
      return { isMainActivity: false, isPensioner: false, hasOtherEmployment: true }
    }
    return { isMainActivity: true, isPensioner: false, hasOtherEmployment: false }
  }

  const [form, setForm] = useState(() => ({
    validFrom: toDateInputValue(initialValues?.validFrom) || '',
    validTo: toDateInputValue(initialValues?.validTo) || '',
    isMainActivity: Boolean(initialValues?.isMainActivity),
    isPensioner: Boolean(initialValues?.isPensioner),
    hasOtherEmployment: Boolean(initialValues?.hasOtherEmployment),
    evCode: codeFromState({
      isMainActivity: Boolean(initialValues?.isMainActivity),
      isPensioner: Boolean(initialValues?.isPensioner),
    }),
  }))

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...form,
      validFrom: form.validFrom,
      validTo: form.validTo || null,
      isMainActivity: form.isMainActivity,
      isPensioner: form.isPensioner,
      hasOtherEmployment: form.hasOtherEmployment,
    })
  }

  return (
    <form className="stacked-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Érvényes -től</span>
        <input type="date" value={form.validFrom} onChange={(e) => handleChange('validFrom', e.target.value)} required />
      </label>
      <label className="form-field">
        <span>Érvényes -ig</span>
        <input type="date" value={form.validTo} onChange={(e) => handleChange('validTo', e.target.value)} />
        <span className="muted">Üresen hagyva nyitott időszak.</span>
      </label>
      <label className="form-field">
        <span>EV jogviszony kód</span>
        <select
          value={form.evCode}
          onChange={(e) => {
            const code = e.target.value
            const mapped = applyCode(code)
            setForm((prev) => ({
              ...prev,
              evCode: code,
              ...mapped,
            }))
          }}
        >
          <option value="1341">1341 – Főfoglalkozású egyéni vállalkozó</option>
          <option value="1342">1342 – Mellékfoglalkozású egyéni vállalkozó</option>
          <option value="1343">1343 – Nyugdíjas egyéni vállalkozó</option>
        </select>
        <span className="muted">A kód állítja a főfoglalkozás/nyugdíjas jelölést.</span>
      </label>
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      <div className="form-actions">
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Mentés...' : 'Mentés'}
        </button>
      </div>
    </form>
  )
}

function EvActivityForm({ initialValues, onSubmit, loading, error }) {
  const [form, setForm] = useState(() => ({
    from: toDateInputValue(initialValues?.from) || '',
    to: toDateInputValue(initialValues?.to) || '',
    state: initialValues?.state || 'ACTIVE',
  }))

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({
      ...form,
      from: form.from,
      to: form.to || null,
    })
  }

  return (
    <form className="stacked-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>Kezdő dátum</span>
        <input type="date" value={form.from} onChange={(e) => handleChange('from', e.target.value)} required />
      </label>
      <label className="form-field">
        <span>Záró dátum</span>
        <input type="date" value={form.to} onChange={(e) => handleChange('to', e.target.value)} />
        <span className="muted">Üresen hagyva nyitott időszak.</span>
      </label>
      <label className="form-field">
        <span>Állapot</span>
        <select value={form.state} onChange={(e) => handleChange('state', e.target.value)}>
          <option value="ACTIVE">Aktív</option>
          <option value="SUSPENDED">Szüneteltetett</option>
        </select>
      </label>
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      <div className="form-actions">
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Mentés...' : 'Mentés'}
        </button>
      </div>
    </form>
  )
}

function normalizeInputDate(value) {
  const d = value ? new Date(value) : null
  if (!d || Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function dateInRange(period, dateStr) {
  const target = normalizeInputDate(dateStr)
  if (!target) return false
  const start = normalizeInputDate(period.from || period.validFrom)
  const end = normalizeInputDate(period.to || period.validTo) || new Date(8640000000000000)
  if (!start) return false
  return start <= target && target <= end
}

export default ClientDetails
