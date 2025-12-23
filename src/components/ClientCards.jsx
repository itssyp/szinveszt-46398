import React from 'react'

export const statusClass = (status) => {
  const value = (status || '').toString().toLowerCase()
  if (value.includes('akt')) return 'dot dot-green'
  if (value.includes('szun')) return 'dot dot-yellow'
  if (value.includes('hold')) return 'dot dot-yellow'
  if (value.includes('meg')) return 'dot dot-red'
  return 'dot dot-yellow'
}

function ClientCards({ clients, onSelect }) {
  return (
    <div className="panel cards-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Lista</p>
          <h2>Ügyfelek</h2>
        </div>
        <span className="pill">{clients.length}</span>
      </div>
      <div className="client-grid">
        {clients.map((client) => (
          <div
            key={client.id}
            role="button"
            tabIndex={0}
            className="client-card"
            onClick={() => onSelect(client)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(client)
              }
            }}
          >
            <div className="client-header">
              <span className={statusClass(client.statusz)} aria-hidden="true" />
              <div className="client-primary">{client.nev || 'Nincs név'}</div>
            </div>
            <div className="client-secondary">{client.adoszam || 'Adószám nincs megadva'}</div>
          </div>
        ))}
        {!clients.length ? (
          <div className="empty-grid">Nincs még adat. Adj hozzá egy ügyfelet.</div>
        ) : null}
      </div>
    </div>
  )
}

export default ClientCards
