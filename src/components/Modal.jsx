import React from 'react'

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="ghost" type="button" onClick={onClose} aria-label="Bezárás">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default Modal
