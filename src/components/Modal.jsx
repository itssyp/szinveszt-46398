import React from 'react'

function Modal({ title, onClose, children, className = '', bodyClassName = '' }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className={`modal${className ? ` ${className}` : ''}`} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="btn ghost icon-btn" type="button" onClick={onClose} aria-label="Bezárás">
            X
          </button>
        </header>
        <div className={`modal-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
      </div>
    </div>
  )
}

export default Modal
