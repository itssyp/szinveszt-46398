import React from 'react'

function ClientSkeletons({ variant = 'cards', count = 6, filteredCount = 0 }) {
  if (variant === 'cards') {
    return (
      <div className="client-grid">
        {Array.from({ length: count }).map((_, idx) => (
          <div className="client-card skeleton-card" key={idx}>
            <div className="client-header">
              <span className="skeleton circle" />
              <div className="skeleton lg wide" style={{ width: '70%' }} />
            </div>
            <div className="skeleton md wide" style={{ width: '60%' }} />
            <div className="skeleton sm wide" style={{ width: '42%' }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="client-list">
      <div className="client-list__toolbar">
        <div>
          <p className="eyebrow">Lista</p>
          <h2>Гgyfelek</h2>
        </div>
        <span className="pill">{filteredCount || '...'}</span>
      </div>
      <div className="client-list__header">
        <span>Nйv</span>
        <span>Adуszбm</span>
        <span>E-mail</span>
        <span>Kezdйs dбtuma</span>
      </div>
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="client-list__row">
          <span className="client-list__name">
            <span className="skeleton circle" />
            <span className="skeleton md wide" style={{ width: '60%' }} />
          </span>
          <span className="client-list__tax">
            <span className="skeleton sm wide" style={{ width: '70%' }} />
          </span>
          <span className="client-list__email">
            <span className="skeleton sm wide" style={{ width: '80%' }} />
          </span>
          <span className="client-list__date">
            <span className="skeleton sm wide" style={{ width: '50%' }} />
          </span>
        </div>
      ))}
    </div>
  )
}

export default ClientSkeletons
