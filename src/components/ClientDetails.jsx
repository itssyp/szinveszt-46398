import React from 'react'
import { fieldGroups } from '../constants/clientFields'
import { useNavOnlineConnectionTest } from '../hooks/useNavOnlineConnectionTest'

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

function ClientDetails({ client, onEdit, onCreateTicket, fields }) {
  const labels = fields.reduce((acc, f) => ({ ...acc, [f.key]: f.label }), {})
  const [activeTab, setActiveTab] = React.useState('general')

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
    endpoint: 'http://127.0.0.1:5001/szinveszt-46398/europe-west3/navProxy/test-connection',
  })


  return (
    <div className="details">
      <div className="details-actions">
        {onCreateTicket ? (
          <button type="button" className="btn ghost" onClick={onCreateTicket} title="Uj ticket">
            Uj ticket
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onEdit}>
          Szerkesztes
        </button>
      </div>

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
      </div>

      {activeTab === 'general' ? (
        fieldGroups.map((group) => (
          <div key={group.title} className="details-section">
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
      ) : (
        <div className="details-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>NAV online számla</h3>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="btn ghost"
                onClick={navTest.run}
                disabled={!navTest.canTest || navTest.status === 'running'}
                title={!navTest.canTest ? 'Hiányzó NAV adatok (felhasználónév, jelszó, aláírókulcs).' : 'NAV kapcsolat teszt'}
              >
                {navTest.status === 'running' ? 'Teszt folyamatban…' : 'Kapcsolat teszt'}
              </button>

              {(navTest.status === 'success' || navTest.status === 'error') && (
                <button type="button" className="btn ghost" onClick={navTest.reset} title="Eredmény törlése">
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Status banner */}
          {navTest.status === 'success' ? (
            <div className="details-banner success" style={{ marginTop: 12 }}>
              ✅ NAV kapcsolat OK
              {navTest.result?.checks ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                  {navTest.result.checks.query ? `Lekérdezés: ${navTest.result.checks.query.ok ? 'OK' : 'HIBA'}` : null}
                  {navTest.result.checks.tokenExchange
                    ? ` • TokenExchange: ${navTest.result.checks.tokenExchange.ok ? 'OK' : 'HIBA'}`
                    : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {navTest.status === 'error' ? (
            <div className="details-banner error" style={{ marginTop: 12 }}>
              ❌ NAV teszt sikertelen
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {navTest.error?.errorCode ? <div><b>Kód:</b> {navTest.error.errorCode}</div> : null}
                {navTest.error?.status ? <div><b>HTTP:</b> {navTest.error.status}</div> : null}
                {navTest.error?.message ? <div><b>Üzenet:</b> {navTest.error.message}</div> : null}
              </div>
            </div>
          ) : null}

          <div className="details-grid" style={{ marginTop: 12 }}>
            {navKeys.map((key) => (
              <div key={key} className="details-item">
                <span className="details-label">{labels[key] || key}</span>
                <span className="details-value">{formatValue(key, client[key], fields)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientDetails
