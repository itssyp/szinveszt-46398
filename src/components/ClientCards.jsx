import React from 'react'

export const statusClass = (status) => {
  const value = (status || '').toString().toLowerCase()
  if (value.includes('lemondta')) return 'dot dot-blue'
  if (value.includes('akt')) return 'dot dot-green'
  if (value.includes('szun')) return 'dot dot-yellow'
  if (value.includes('hold')) return 'dot dot-yellow'
  if (value.includes('meg')) return 'dot dot-red'
  return 'dot dot-yellow'
}

function ClientCards({ clients, onSelect, selectedIds = [], onToggleSelect, onLongPress, selectionMode = false }) {
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
        {clients.map((client) => {
          const isSelected = selectedIds.includes(client.id)
          let pressTimer = null
          let longPressTriggered = false

          const startPress = () => {
            longPressTriggered = false
            if (!onLongPress) return
            pressTimer = setTimeout(() => {
              longPressTriggered = true
              onLongPress(client.id)
            }, 500)
          }

          const endPress = () => {
            if (pressTimer) clearTimeout(pressTimer)
          }

          const handleClick = () => {
            if (longPressTriggered) {
              longPressTriggered = false
              return
            }
            onSelect(client)
          }

          return (
            <div
              key={client.id}
              role="button"
              tabIndex={0}
              className={`client-card${selectionMode ? ' has-selector' : ''}`}
              data-selected={selectionMode && isSelected}
              onClick={handleClick}
              onMouseDown={startPress}
              onMouseUp={endPress}
              onMouseLeave={endPress}
              onTouchStart={startPress}
              onTouchEnd={endPress}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(client)
                }
              }}
            >
              {selectionMode && onToggleSelect ? (
                <label
                  className="client-card__checkbox"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(client.id)}
                    aria-label="Kijelölés"
                  />
                </label>
              ) : null}
              <div className="client-header">
                <span className={statusClass(client.statusz)} aria-hidden="true" />
                <div className="client-primary">{client.nev || 'Nincs név'}</div>
              </div>
              <div className="client-secondary">{client.adoszam || 'Adószám nincs megadva'}</div>
            </div>
          )
        })}
        {!clients.length ? (
          <div className="empty-grid">Nincs még adat. Adj hozzá egy ügyfelet.</div>
        ) : null}
      </div>
    </div>
  )
}

export default ClientCards
