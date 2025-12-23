import React from 'react'

const typeLabel = {
  ticket_created: 'Ticket létrehozva',
  ticket_resolved: 'Ticket lezárva',
  client_updated: 'Ügyfél frissítve',
  import: 'Import',
  nav_test: 'NAV teszt',
}

function formatDate(value) {
  if (value?.toDate) return value.toDate().toLocaleString('hu-HU')
  if (value instanceof Date) return value.toLocaleString('hu-HU')
  return ''
}

function ClientActivityTimeline({ activities = [] }) {
  if (!activities.length) return <p className="muted">Nincs még aktivitás.</p>

  return (
    <div className="activity-timeline">
      {activities.map((act) => (
        <div key={act.id} className="activity-item">
          <div className="activity-meta">
            <span className="pill pill-quiet">{typeLabel[act.type] || act.type}</span>
            <span className="muted">{formatDate(act.createdAt)}</span>
          </div>
          <div className="activity-message">{act.message}</div>
          {act.actor ? <div className="muted">Által: {act.actor}</div> : null}
        </div>
      ))}
    </div>
  )
}

export default ClientActivityTimeline
