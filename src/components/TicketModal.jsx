import React, { useEffect, useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const ASSIGNEES = ['Szindi', 'Fanni', 'Szilveszter']

function TicketModal({ ticket, onClose, currentUser }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [localTicket, setLocalTicket] = useState(ticket)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)

  useEffect(() => {
    setLocalTicket(ticket)
  }, [ticket])

  const toggleResolved = async () => {
    try {
      setSaving(true)
      const newValue = !localTicket.resolved
      setLocalTicket((prev) => ({ ...prev, resolved: newValue }))
      await updateDoc(doc(db, 'tickets', ticket.id), { resolved: newValue })
    } catch (err) {
      setError(err.message || 'Nem sikerült frissíteni')
    } finally {
      setSaving(false)
    }
  }

  const updateAssignee = async (value) => {
    try {
      setUpdatingAssignee(true)
      setLocalTicket((prev) => ({ ...prev, assignedTo: value }))
      await updateDoc(doc(db, 'tickets', ticket.id), { assignedTo: value })
    } catch (err) {
      setError(err.message || 'Nem sikerült frissíteni a felelőst')
    } finally {
      setUpdatingAssignee(false)
    }
  }

  const deleteTicket = async () => {
    try {
      setSaving(true)
      await deleteDoc(doc(db, 'tickets', ticket.id))
      onClose()
    } catch (err) {
      setError(err.message || 'Nem sikerült törölni')
    } finally {
      setSaving(false)
    }
  }

  const addComment = async (e) => {
    e.preventDefault()
    if (!comment.trim()) return
    try {
      setSaving(true)
      await updateDoc(doc(db, 'tickets', ticket.id), {
        comments: arrayUnion({
          text: comment.trim(),
          createdAt: Timestamp.now(),
          author: currentUser || 'Ismeretlen',
        }),
      })
      setComment('')
    } catch (err) {
      setError(err.message || 'Nem sikerült menteni a megjegyzést')
    } finally {
      setSaving(false)
    }
  }

  const created =
    localTicket.createdAt?.toDate && localTicket.createdAt.toDate().toLocaleString
      ? localTicket.createdAt.toDate().toLocaleString()
      : 'Nincs dátum'

  const statusLabel = localTicket.resolved ? 'Megoldva' : 'Nyitott'
  const assignee = localTicket.assignedTo || 'Nincs megadva'
  const creator = localTicket.createdBy || 'Ismeretlen'

  return (
    <div className="details">
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      <div className="details-section">
        <div className="details-header">
          <h3>Ticket</h3>
          <div className="details-actions inline">
            <div className="spacer" />
            <button className="btn ghost danger" type="button" onClick={deleteTicket} disabled={saving}>
              Törlés
            </button>
          </div>
        </div>
        <div className="ticket-meta-row">
          <button
            type="button"
            className={`meta-chip fill ${localTicket.resolved ? 'meta-success' : 'meta-warn'}`}
            onClick={toggleResolved}
            disabled={saving}
          >
            {statusLabel}
          </button>
          <button
            type="button"
            className="meta-chip fill"
            onClick={() => updateAssignee('')}
            disabled={updatingAssignee}
          >
            Ügyfél: {localTicket.clientName || 'Ismeretlen ügyfél'}
          </button>
          {ASSIGNEES.map((u) => {
            const active = (localTicket.assignedTo || '').toLowerCase() === u.toLowerCase()
            return (
              <button
                key={u}
                type="button"
                className={`meta-chip fill assignee-chip ${active ? 'active' : ''}`}
                onClick={() => updateAssignee(u)}
                disabled={updatingAssignee}
              >
                Felelős: {u}
              </button>
            )
          })}
          <span className="meta-chip fill muted-chip">{created}</span>
        </div>
        <div className="details-grid">
          <div className="details-item">
            <span className="details-label">Létrehozta</span>
            <span className="details-value">{creator}</span>
          </div>
        </div>
        <p className="details-value">{localTicket.description || 'Nincs leírás'}</p>
      </div>

      <div className="details-section">
        <h3>Megjegyzések</h3>
        <form className="ticket-form" onSubmit={addComment}>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Írj megjegyzést..."
          />
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving || !comment.trim()}>
              {saving ? 'Mentés...' : 'Hozzáadás'}
            </button>
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
              Bezárás
            </button>
          </div>
        </form>
        <div className="chat-list">
          {localTicket.comments?.map((c, idx) => (
            <div
              key={idx}
              className={`chat-row ${c.author === currentUser ? 'chat-own' : 'chat-other'}`}
            >
              <div className="chat-meta">
                <span className="chat-author">{c.author || 'Ismeretlen'}</span>
                <span className="chat-time">
                  {c.createdAt?.toDate
                    ? c.createdAt.toDate().toLocaleString()
                    : 'Nincs dátum'}
                </span>
              </div>
              <div className="chat-bubble">{c.text}</div>
            </div>
          ))}
          {!localTicket.comments?.length ? <p className="muted">Nincsenek megjegyzések.</p> : null}
        </div>
      </div>
    </div>
  )
}

export default TicketModal
