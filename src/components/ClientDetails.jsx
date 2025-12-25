import React, { useEffect, useRef, useState } from 'react'
import { fieldGroups } from '../constants/clientFields'
import { useNavOnlineConnectionTest } from '../hooks/useNavOnlineConnectionTest'
import ClientActivityTimeline from './ClientActivityTimeline'
import useNavInvoices from '../hooks/useNavInvoices'

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
    return value ? 'Aktív' : 'Inaktív'
  }
  if (fieldMeta?.type === 'multiselect') {
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'string') return value
  }
  return value || '-'
}

function ClientDetails({
  client,
  onEdit,
  onCreateTicket,
  onViewTickets,
  ticketCount = 0,
  fields,
  onNavTestLog,
  activities = [],
  activitiesLoading = false,
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

  const navKeys = [
    'navOnlineActive',
    'navOnlineUser',
    'navOnlinePassword',
    'navOnlineSignerKey',
    'navOnlineExchangeKey',
    'navOnlineStartDate',
  ]

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

  const generalGroups = fieldGroups.filter((group) => group.title !== 'NAV online számla')

  const formatAmount = (amount, currency) => {
    if (amount == null) return '-'
    const num = Number(amount)
    if (Number.isNaN(num)) return '-'
    return `${num.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency || 'HUF'}`
  }

  let tabContent = null
  if (activeTab === 'general') {
    tabContent = generalGroups.map((group) => (
      <div key={group.title} className="details-section details-section--line">
        <h3>{group.title}</h3>
        <div className="details-grid">
          {group.keys.map((key) => (
            <div key={key} className="details-item">
              <span className="details-label">{labels[key] || key}</span>
              <span className="details-value">{formatValue(key, client[key], fields)}</span>
            </div>
          ))}
        </div>
      </div>
    ))
  } else if (activeTab === 'nav') {
    tabContent = (
      <div className="details-section details-section--line">
        <div className="details-header">
          <h3>NAV online számla</h3>

          <div className="details-actions inline">
            <button
              type="button"
              className="btn ghost"
              onClick={navTest.run}
              disabled={!navTest.canTest || navTest.status === 'running'}
              title={!navTest.canTest ? 'Hiányzó NAV adatok (felhasználónév, jelszó, aláírókulcs).' : 'NAV kapcsolat teszt'}
            >
              {navTest.status === 'running' ? 'Teszt folyamatban.' : 'Kapcsolat teszt'}
            </button>

            {(navTest.status === 'success' || navTest.status === 'error') && (
              <button type="button" className="btn ghost" onClick={navTest.reset} title="Eredmény törlése">
                Reset
              </button>
            )}
          </div>
        </div>

        {navTest.status === 'success' ? (
          <div className="details-banner success">
            NAV kapcsolat OK
            {navTest.result?.checks ? (
              <div className="helper-text">
                {navTest.result.checks.query ? `Lekérdezés: ${navTest.result.checks.query.ok ? 'OK' : 'HIBA'}` : null}
                {navTest.result.checks.tokenExchange
                  ? ` TokenExchange: ${navTest.result.checks.tokenExchange.ok ? 'OK' : 'HIBA'}`
                  : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {navTest.status === 'error' ? (
          <div className="details-banner error">
            NAV teszt sikertelen
            <div className="helper-text">
              {navTest.error?.errorCode ? (
                <div>
                  <b>Kód:</b> {navTest.error.errorCode}
                </div>
              ) : null}
              {navTest.error?.status ? (
                <div>
                  <b>HTTP:</b> {navTest.error.status}
                </div>
              ) : null}
              {navTest.error?.message ? (
                <div>
                  <b>Üzenet:</b> {navTest.error.message}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="details-grid details-grid-spaced">
          {navKeys.map((key) => (
            <div key={key} className="details-item">
              <span className="details-label">{labels[key] || key}</span>
              <span className="details-value">{formatValue(key, client[key], fields)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  } else if (activeTab === 'invoices') {
    tabContent = (
      <div className="details-section details-section--line">
        <div className="details-header">
          <h3>Számlák</h3>
          <div className="details-actions inline">
            <label className="filter-control inline-select">
              <span>Irány</span>
              <select
                value={invoiceDirection}
                onChange={(e) => setInvoiceDirection(e.target.value)}
                disabled={invoicesQuery.loading}
              >
                <option value="OUTBOUND">Kimenő</option>
                <option value="INBOUND">Bejövő</option>
              </select>
            </label>
            <label className="filter-control inline-select">
              <span>Dátum -tól</span>
              <input
                type="date"
                value={invoiceRange.from}
                onChange={(e) => setInvoiceRange((prev) => ({ ...prev, from: e.target.value }))}
                disabled={invoicesQuery.loading}
              />
            </label>
            <label className="filter-control inline-select">
              <span>Dátum -ig</span>
              <input
                type="date"
                value={invoiceRange.to}
                onChange={(e) => setInvoiceRange((prev) => ({ ...prev, to: e.target.value }))}
                disabled={invoicesQuery.loading}
              />
            </label>
            <button
              type="button"
              className="btn ghost"
              onClick={invoicesQuery.refresh}
              disabled={invoicesQuery.loading || !invoicesQuery.hasCreds}
            >
              {invoicesQuery.loading ? 'Betöltés...' : 'Frissítés'}
            </button>
          </div>
        </div>

        {!invoicesQuery.hasCreds ? (
          <div className="details-banner error">
            Hiányzó NAV adatok (felhasználónév, jelszó, aláírókulcs) a lekérdezéshez.
          </div>
        ) : null}

        {invoicesQuery.error ? <div className="details-banner error">Hiba: {invoicesQuery.error}</div> : null}

        <div className="details-grid details-grid-spaced">
          {invoicesQuery.loading ? (
            <p className="muted">Számlák betöltése...</p>
          ) : invoicesQuery.invoices.length ? (
            invoicesQuery.invoices.map((inv) => (
              <div key={inv.invoiceNumber || inv.id} className="meta-card">
                <div className="meta-label">Számlaszám</div>
                <div className="meta-value emphasis">{inv.invoiceNumber || 'Ismeretlen'}</div>
                <div className="meta-label">Dátum</div>
                <div className="meta-value muted">{inv.invoiceIssueDate || inv.insDate || '-'}</div>
                <div className="meta-label">Partner adószám</div>
                <div className="meta-value muted">
                  {invoiceDirection === 'OUTBOUND' ? inv.customerTaxNumber || '-' : inv.supplierTaxNumber || '-'}
                </div>
                <div className="meta-label">Bruttó</div>
                <div className="meta-value">{formatAmount(inv.grossAmountHUF || inv.grossAmount, inv.currency)}</div>
                <div className="meta-label">Irány</div>
                <div className="meta-value">{inv.direction || invoiceDirection}</div>
              </div>
            ))
          ) : (
            <p className="muted">Nincs megjeleníthető számla ebben az időszakban.</p>
          )}
        </div>
      </div>
    )
  } else if (activeTab === 'incomes') {
    const incomes = Array.isArray(client.monthlyIncomes) ? [...client.monthlyIncomes] : []
    incomes.sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
    tabContent = (
      <div className="details-section details-section--line">
        <div className="details-header">
          <h3>Bevételek</h3>
        </div>
        {!incomes.length ? (
          <p className="muted">Nincs rögzített bevétel.</p>
        ) : (
          <div className="details-grid details-grid-spaced">
            {incomes.map((row, idx) => (
              <div key={`${row.month || idx}-${row.amount || 0}`} className="meta-card">
                <div className="meta-label">Hónap</div>
                <div className="meta-value emphasis">{row.month || '-'}</div>
                <div className="meta-label">Összeg</div>
                <div className="meta-value">{formatAmount(row.amount || 0, 'HUF')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  } else {
    tabContent = (
      <div className="details-section details-section--line">
        <div className="details-header">
          <h3>Aktivitás</h3>
        </div>
        {activitiesLoading ? <p className="muted">Betöltés...</p> : <ClientActivityTimeline activities={activities} />}
      </div>
    )
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
            Általános
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'nav' ? ' active' : ''}`}
            onClick={() => setActiveTab('nav')}
          >
            NAV online számla
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
    </div>
  )
}

export default ClientDetails
