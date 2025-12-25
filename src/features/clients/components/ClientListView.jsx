import React, { useEffect, useRef } from 'react'
import { statusClass } from '../../../components/ClientCards'

function ClientListView({
  clients,
  onSelect,
  onToggleSelect,
  selectedIds = [],
  allVisibleSelected = false,
  someVisibleSelected = false,
  onToggleSelectAll,
  formatStartDate,
  onLongPress,
  selectionMode = false,
}) {
  const selectAllRef = useRef(null)

  useEffect(() => {
    if (!selectionMode || !selectAllRef.current) return
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected, allVisibleSelected, selectionMode])

  return (
    <div className={`client-list${selectionMode ? ' has-selection' : ''}`}>
      <div className="client-list__toolbar">
        <div>
          <p className="eyebrow">Lista</p>
          <h2>Ügyfelek</h2>
        </div>
        <span className="pill">{clients.length}</span>
      </div>
      <div className="client-list__header">
        {selectionMode ? (
          <span className="client-list__select">
            {onToggleSelectAll ? (
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected && clients.length > 0}
                onChange={onToggleSelectAll}
                aria-label="Összes kijelölése"
              />
            ) : null}
          </span>
        ) : null}
        <span>Név</span>
        <span>Adószám</span>
        <span>E-mail</span>
        <span>Kezdés dátuma</span>
      </div>
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
            className={`client-list__row${selectionMode && isSelected ? ' is-selected' : ''}`}
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
            {selectionMode ? (
              <span className="client-list__select">
                {onToggleSelect ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    aria-label="Kijelölés"
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleSelect(client.id)}
                  />
                ) : null}
              </span>
            ) : null}
            <span className="client-list__name">
              <span className={statusClass(client.statusz)} aria-hidden="true" /> {client.nev || 'N/A'}
            </span>
            <span className="client-list__tax">{client.adoszam || '-'}</span>
            <span className="client-list__email">{client.email || '-'}</span>
            <span className="client-list__date">{formatStartDate(client)}</span>
          </div>
        )
      })}
      {!clients.length ? <div className="client-list__empty">Nincs megjeleníthető ügyfél.</div> : null}
    </div>
  )
}

export default ClientListView
