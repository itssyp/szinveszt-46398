import React from 'react'
import { fieldGroups } from '../constants/clientFields'

function formatValue(key, value, fields) {
  const fieldMeta = fields.find((f) => f.key === key)
  if (fieldMeta?.type === 'boolean') {
    return value ? 'Aktív' : 'Inaktív'
  }
  if (fieldMeta?.type === 'multiselect') {
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'string') return value
  }
  return value || '—'
}

function ClientDetails({ client, onEdit, onCreateTicket, fields }) {
  const labels = fields.reduce((acc, f) => ({ ...acc, [f.key]: f.label }), {})

  return (
    <div className="details">
      <div className="details-actions">
        {onCreateTicket ? (
          <button type="button" className="btn ghost" onClick={onCreateTicket} title="Új ticket">
            Új ticket
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onEdit}>
          Szerkesztés
        </button>
      </div>
      {fieldGroups.map((group) => (
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
      ))}
    </div>
  )
}

export default ClientDetails
