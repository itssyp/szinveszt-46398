import React, { useEffect, useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'

function TicketModal({ ticket, onClose, currentUser }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [localTicket, setLocalTicket] = useState(ticket)

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
      setLocalTicket((prev) => ({
        ...prev,
        comments: [
          ...(prev.comments || []),
          { text: comment.trim(), createdAt: Timestamp.now(), author: currentUser || 'Ismeretlen' },
        ],
      }))
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

  return (
    <div className="details">
      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      <div className="details-section">
        <h3>Ticket</h3>
        <div className="details-grid">
          <div className="details-item">
            <span className="details-label">Ügyfél</span>
            <span className="details-value">{localTicket.clientName || 'Ismeretlen ügyfél'}</span>
          </div>
          <div className="details-item">
            <span className="details-label">Állapot</span>
            <span className="details-value">{localTicket.resolved ? 'Megoldva' : 'Nyitott'}</span>
          </div>
          <div className="details-item">
            <span className="details-label">Létrehozva</span>
            <span className="details-value">{created}</span>
          </div>
          <div className="details-item">
            <span className="details-label">Létrehozta</span>
            <span className="details-value">{localTicket.createdBy || 'Ismeretlen'}</span>
          </div>
          <div className="details-item">
            <span className="details-label">Felelős</span>
            <span className="details-value">{localTicket.assignedTo || 'Nincs megadva'}</span>
          </div>
        </div>
        <p className="details-value">{localTicket.description || 'Nincs leírás'}</p>
        <button className="btn" type="button" onClick={toggleResolved} disabled={saving}>
          {localTicket.resolved ? 'Jelölés nyitottra' : 'Jelölés megoldottra'}
        </button>
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
        <div className="ticket-list">
          {localTicket.comments?.map((c, idx) => (
            <div key={idx} className="ticket-row">
              <div className="ticket-meta">
                <span>
                  {c.createdAt?.toDate
                    ? c.createdAt.toDate().toLocaleString()
                    : 'Nincs dátum'}
                </span>
                {c.author ? <span className="muted">Írta: {c.author}</span> : null}
              </div>
              <div className="ticket-desc">{c.text}</div>
            </div>
          ))}
          {!ticket.comments?.length ? <p className="muted">Nincsenek megjegyzések.</p> : null}
        </div>
      </div>
    </div>
  )
}

export default TicketModal
