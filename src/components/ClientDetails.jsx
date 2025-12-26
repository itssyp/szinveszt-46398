import React, { useEffect, useRef, useState } from 'react'
import { useNavOnlineConnectionTest } from '../hooks/useNavOnlineConnectionTest'
import useNavInvoices from '../hooks/useNavInvoices'
import {
  ActivityTab,
  GeneralTab,
  IncomesTab,
  InvoicesTab,
  NavTab,
} from '../features/clients/components/ClientDetailSections'

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
  return `${num.toLocaleString('hu-HU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${currency || 'HUF'}`
}

function ClientDetails({
  client,
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
    tabContent = <IncomesTab client={client} formatAmount={formatAmount} />
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
            NAV online szamla
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'invoices' ? ' active' : ''}`}
            onClick={() => setActiveTab('invoices')}
          >
            Szamlak
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'incomes' ? ' active' : ''}`}
            onClick={() => setActiveTab('incomes')}
          >
            Bevetelek
          </button>
          <button
            type="button"
            className={`details-tab${activeTab === 'activity' ? ' active' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            Aktivitas
          </button>
        </div>

        <div className="details-actions inline">
          <button type="button" className="btn ghost" onClick={onViewTickets} title="Ticketek">
            Ticketek: {ticketCount}
          </button>
          <button type="button" className="btn ghost" onClick={onCreateTicket}>
            Uj ticket
          </button>
          <button type="button" className="btn" onClick={onEdit}>
            Szerkesztes
          </button>
        </div>
      </div>

      {tabContent}
    </div>
  )
}

export default ClientDetails
