import React from 'react'

function ClientCards({ clients, onSelect }) {
  return (
    <div className="card cards-card">
      <div className="list-header">
        <h2>Ügyfelek</h2>
        <span className="pill">{clients.length}</span>
      </div>
      <div className="card-grid">
        {clients.map((client) => (
          <button key={client.id} className="client-card" onClick={() => onSelect(client)}>
            <div className="client-primary">{client.nev || 'Nincs név'}</div>
            <div className="client-secondary">{client.adoszam || 'Adószám nincs megadva'}</div>
          </button>
        ))}
        {!clients.length ? <div className="empty-grid">Nincs még adat. Adj hozzá egy ügyfelet.</div> : null}
      </div>
    </div>
  )
}

export default ClientCards
