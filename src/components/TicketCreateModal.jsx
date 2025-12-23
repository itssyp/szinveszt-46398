import React from 'react'
import { TbSend, TbX } from 'react-icons/tb'
import Modal from './Modal'

function TicketCreateModal({
  client,
  description,
  onChangeDescription,
  assignedTo,
  onChangeAssignedTo,
  currentUser,
  saving,
  error,
  onCancel,
  onSubmit,
}) {
  return (
    <Modal title={`Új ticket - ${client?.nev || 'Ismeretlen ügyfél'}`} onClose={onCancel}>
      <div className="details">
        {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
        <div className="details-section">
          <h3>Ticket adatai</h3>
          <div className="ticket-form">
            <div className="form-field">
              <span>Ügyfél</span>
              <input type="text" value={client?.nev || 'Ismeretlen ügyfél'} disabled />
            </div>
            <div className="form-field">
              <span>Felelős</span>
              <select value={assignedTo} onChange={(e) => onChangeAssignedTo(e.target.value)}>
                <option value="">Válassz...</option>
                {[currentUser, 'Szindi', 'Fanni', 'Szilveszter']
                  .filter(Boolean)
                  .filter((v, idx, arr) => arr.indexOf(v) === idx)
                  .map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-field">
              <span>Leírás</span>
              <textarea
                rows={5}
                placeholder="Írd le a problémát vagy kérést..."
                value={description}
                onChange={(e) => onChangeDescription(e.target.value)}
              />
            </div>
          </div>
        <div className="form-actions">
          <button className="btn" type="button" disabled={saving} onClick={onSubmit}>
            <TbSend />
            {saving ? 'Mentés...' : 'Ticket létrehozása'}
          </button>
          <button className="btn ghost" type="button" onClick={onCancel} disabled={saving}>
            <TbX />
            Mégse
          </button>
        </div>
        </div>
      </div>
    </Modal>
  )
}

export default TicketCreateModal
