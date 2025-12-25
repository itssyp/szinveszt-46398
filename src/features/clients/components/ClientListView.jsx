import React from 'react'
import { statusClass } from '../../../components/ClientCards'

function ClientListView({ clients, onSelect, formatStartDate }) {
  return (
    <div className="client-list">
      <div className="client-list__toolbar">
        <div>
          <p className="eyebrow">Lista</p>
          <h2>Гgyfelek</h2>
        </div>
        <span className="pill">{clients.length}</span>
      </div>
      <div className="client-list__header">
        <span>Nйv</span>
        <span>Adуszбm</span>
        <span>E-mail</span>
        <span>Kezdйs dбtuma</span>
      </div>
      {clients.map((client) => (
        <button
          key={client.id}
          type="button"
          className="client-list__row"
          onClick={() => onSelect(client)}
        >
          <span className="client-list__name">
            <span className={statusClass(client.statusz)} aria-hidden="true" /> {client.nev || 'N/A'}
          </span>
          <span className="client-list__tax">{client.adoszam || '-'}</span>
          <span className="client-list__email">{client.email || '-'}</span>
          <span className="client-list__date">{formatStartDate(client)}</span>
        </button>
      ))}
      {!clients.length ? <div className="client-list__empty">Nincs megjelenнthető Гgyfйl.</div> : null}
    </div>
  )
}

export default ClientListView
