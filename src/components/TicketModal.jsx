import React, { useEffect, useMemo, useState } from 'react'
import { Timestamp, arrayUnion, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { logClientActivity } from '../utils/clientActivity'
import { t } from '../i18n'

function formatDueLabel(dueDate) {
  if (!dueDate) return t('tickets.noDueDate')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return t('tickets.noDueDate')

  const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return t('tickets.overdue')
  if (diffDays === 0) return t('tickets.dueToday')
  if (diffDays === 1) return t('tickets.dueTomorrow')
  return t('tickets.dueInDays', { days: diffDays })
}

function formatTaskLinkLabel(taskContext) {
  if (!taskContext || !taskContext.type) return ''
  if (taskContext.type === 'utalando') {
    return t('tickets.taskUtalandoForMonth', { monthKey: taskContext.monthKey || '' })
  }
  if (taskContext.type === 'szja') {
    return t('tickets.taskSzjaForYear', { year: taskContext.year || '' })
  }
  return ''
}

function TicketModal({ ticket, onClose, currentUser, assigneeOptions = [] }) {
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [localTicket, setLocalTicket] = useState(ticket)
  const [updatingAssignee, setUpdatingAssignee] = useState(false)
  const [updatingPriority, setUpdatingPriority] = useState(false)
  const [updatingDueDate, setUpdatingDueDate] = useState(false)

  useEffect(() => {
    setLocalTicket(ticket)
  }, [ticket])

  const toggleResolved = async () => {
    try {
      setSaving(true)
      const newValue = !localTicket.resolved
      setLocalTicket((prev) => ({ ...prev, resolved: newValue }))
      await updateDoc(doc(db, 'tickets', ticket.id), {
        resolved: newValue,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
      })
      if (ticket.clientId) {
        await logClientActivity({
          clientId: ticket.clientId,
          type: 'ticket_resolved',
          message: newValue ? 'Ticket lezárva' : 'Ticket újranyitva',
          meta: { ticketId: ticket.id },
          actor: currentUser || 'Ismeretlen',
        })
      }
    } catch (err) {
      setError(err.message || t('tickets.modal.updateError'))
    } finally {
      setSaving(false)
    }
  }

  const updateAssignee = async (value) => {
    try {
      setUpdatingAssignee(true)
      setLocalTicket((prev) => ({ ...prev, assignedTo: value }))
      await updateDoc(doc(db, 'tickets', ticket.id), {
        assignedTo: value,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
      })
    } catch (err) {
      setError(err.message || t('tickets.modal.updateAssigneeError'))
    } finally {
      setUpdatingAssignee(false)
    }
  }

  const updatePriority = async (value) => {
    try {
      setUpdatingPriority(true)
      setLocalTicket((prev) => ({ ...prev, priority: value }))
      await updateDoc(doc(db, 'tickets', ticket.id), {
        priority: value,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
      })
    } catch (err) {
      setError(err.message || t('tickets.modal.updatePriorityError'))
    } finally {
      setUpdatingPriority(false)
    }
  }

  const updateDueDate = async (value) => {
    try {
      setUpdatingDueDate(true)
      setLocalTicket((prev) => ({ ...prev, dueDate: value }))
      await updateDoc(doc(db, 'tickets', ticket.id), {
        dueDate: value || '',
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
      })
    } catch (err) {
      setError(err.message || t('tickets.modal.updateDueDateError'))
    } finally {
      setUpdatingDueDate(false)
    }
  }

  const deleteTicket = async () => {
    try {
      setSaving(true)
      await deleteDoc(doc(db, 'tickets', ticket.id))
      onClose()
    } catch (err) {
      setError(err.message || t('tickets.modal.deleteError'))
    } finally {
      setSaving(false)
    }
  }

  const addComment = async (event) => {
    event.preventDefault()
    if (!comment.trim()) return
    try {
      setSaving(true)
      await updateDoc(doc(db, 'tickets', ticket.id), {
        comments: arrayUnion({
          text: comment.trim(),
          createdAt: Timestamp.now(),
          author: currentUser || 'Ismeretlen',
        }),
        updatedAt: serverTimestamp(),
        updatedBy: currentUser || 'Ismeretlen',
      })
      setComment('')
    } catch (err) {
      setError(err.message || t('tickets.modal.commentSaveError'))
    } finally {
      setSaving(false)
    }
  }

  const created =
    localTicket.createdAt?.toDate && localTicket.createdAt.toDate().toLocaleString
      ? localTicket.createdAt.toDate().toLocaleString()
      : t('tickets.noDate')

  const statusLabel = localTicket.resolved ? t('tickets.solved') : t('tickets.open')
  const creator = localTicket.createdBy || 'Ismeretlen'
  const availableAssignees = Array.from(new Set([...(assigneeOptions || []), localTicket.assignedTo || ''].filter(Boolean)))

  const priorityValue = localTicket.priority || 'medium'
  const dueDateValue = localTicket.dueDate || ''
  const dueLabel = useMemo(() => formatDueLabel(dueDateValue), [dueDateValue])
  const taskLinkLabel = useMemo(() => formatTaskLinkLabel(localTicket.taskContext), [localTicket.taskContext])

  return (
    <div className="details">
      {error ? <div className="banner banner-error">{t('common.errorPrefix')} {error}</div> : null}
      <div className="details-section">
        <div className="details-header">
          <h3>{t('tickets.modal.ticket')}</h3>
          <div className="details-actions inline">
            <div className="spacer" />
            <button className="btn ghost danger" type="button" onClick={deleteTicket} disabled={saving}>
              {t('tickets.modal.delete')}
            </button>
          </div>
        </div>
        <div className="ticket-meta-panel">
          <div className="meta-card wide">
            <div className="meta-label">{t('tickets.create.client')}</div>
            <div className="meta-value emphasis">{localTicket.clientName || t('tickets.unknownClient')}</div>
          </div>
          <div className="meta-card">
            <div className="meta-label">{t('tickets.modal.status')}</div>
            <button
              type="button"
              className={`meta-pill status ${localTicket.resolved ? 'status-done' : 'status-open'}`}
              onClick={toggleResolved}
              disabled={saving}
            >
              {statusLabel}
            </button>
          </div>
          <div className="meta-card">
            <div className="meta-label">{t('tickets.modal.assignee')}</div>
            <select
              className="meta-select"
              value={localTicket.assignedTo || ''}
              onChange={(event) => updateAssignee(event.target.value)}
              disabled={updatingAssignee || saving}
            >
              <option value="">{t('tickets.modal.notProvided')}</option>
              {availableAssignees.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="meta-card">
            <div className="meta-label">{t('tickets.priority')}</div>
            <select
              className="meta-select"
              value={priorityValue}
              onChange={(event) => updatePriority(event.target.value)}
              disabled={updatingPriority || saving}
            >
              <option value="low">{t('tickets.priorityLow')}</option>
              <option value="medium">{t('tickets.priorityMedium')}</option>
              <option value="high">{t('tickets.priorityHigh')}</option>
            </select>
          </div>
          <div className="meta-card">
            <div className="meta-label">{t('tickets.dueDate')}</div>
            <input
              className="meta-select"
              type="date"
              value={dueDateValue}
              onChange={(event) => updateDueDate(event.target.value)}
              disabled={updatingDueDate || saving}
            />
            <div className="meta-value muted">{dueLabel}</div>
          </div>
          <div className="meta-card">
            <div className="meta-label">{t('tickets.modal.creator')}</div>
            <div className="meta-value">{creator}</div>
          </div>
          <div className="meta-card">
            <div className="meta-label">{t('tickets.modal.createdAt')}</div>
            <div className="meta-value muted">{created}</div>
          </div>
          {taskLinkLabel ? (
            <div className="meta-card wide">
              <div className="meta-label">{t('tickets.modal.linkedTask')}</div>
              <div className="meta-value">{taskLinkLabel}</div>
            </div>
          ) : null}
        </div>
        <p className="details-value ticket-description">{localTicket.description || t('tickets.noDescription')}</p>
      </div>

      <div className="details-section">
        <h3>{t('tickets.modal.comments')}</h3>
        <form className="ticket-form" onSubmit={addComment}>
          <textarea
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t('tickets.modal.commentsPlaceholder')}
          />
          <div className="form-actions">
            <button className="btn" type="submit" disabled={saving || !comment.trim()}>
              {saving ? t('tasks.detail.saving') : t('tickets.modal.addComment')}
            </button>
            <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
              {t('tickets.modal.close')}
            </button>
          </div>
        </form>
        <div className="chat-list">
          {localTicket.comments?.map((entry, idx) => (
            <div key={idx} className={`chat-row ${entry.author === currentUser ? 'chat-own' : 'chat-other'}`}>
              <div className="chat-meta">
                <span className="chat-author">{entry.author || 'Ismeretlen'}</span>
                <span className="chat-time">
                  {entry.createdAt?.toDate ? entry.createdAt.toDate().toLocaleString() : t('tickets.noDate')}
                </span>
              </div>
              <div className="chat-bubble">{entry.text}</div>
            </div>
          ))}
          {!localTicket.comments?.length ? <p className="muted">{t('tickets.modal.noComments')}</p> : null}
        </div>
      </div>
    </div>
  )
}

export default TicketModal
