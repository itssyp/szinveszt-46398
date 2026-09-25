import React, { useState } from 'react'
import { TbPaperclip, TbSend, TbX } from 'react-icons/tb'
import Modal from './Modal'
import { t } from '../i18n'
import { validateTicketAttachmentFiles } from '../utils/ticketAttachments'

function TicketCreateModal({
  client,
  clientName = '',
  onChangeClientName,
  allowClientEdit = false,
  description,
  onChangeDescription,
  assignedTo,
  onChangeAssignedTo,
  priority = 'medium',
  onChangePriority,
  dueDate = '',
  onChangeDueDate,
  currentUser,
  assigneeOptions = [],
  saving,
  error,
  onCancel,
  onSubmit,
}) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [fileError, setFileError] = useState('')
  const options = Array.from(new Set([currentUser, ...assigneeOptions].filter(Boolean)))
  const resolvedClientName = allowClientEdit ? clientName : client?.nev || t('tickets.unknownClient')
  const titleClientName = resolvedClientName || t('tickets.unknownClient')

  const handleFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || [])
    try {
      const nextSelection = [...selectedFiles, ...nextFiles]
      validateTicketAttachmentFiles(nextSelection)
      setSelectedFiles(nextSelection)
      setFileError('')
    } catch (uploadError) {
      setFileError(uploadError.message || t('tickets.create.attachmentError'))
    }
    event.target.value = ''
  }

  const removeFile = (index) => {
    setSelectedFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))
    setFileError('')
  }

  return (
    <Modal title={t('tickets.create.title', { clientName: titleClientName })} onClose={onCancel}>
      <div className="details">
        {error ? <div className="banner banner-error">{t('common.errorPrefix')} {error}</div> : null}
        <div className="details-section">
          <h3>{t('tickets.create.details')}</h3>
          <div className="ticket-form">
            <div className="form-field">
              <span>{t('tickets.create.client')}</span>
              <input
                type="text"
                value={resolvedClientName}
                onChange={(event) => onChangeClientName?.(event.target.value)}
                disabled={!allowClientEdit}
                placeholder={allowClientEdit ? t('tickets.unknownClient') : ''}
              />
            </div>
            <div className="form-field">
              <span>{t('tickets.create.assignee')}</span>
              <select value={assignedTo} onChange={(event) => onChangeAssignedTo(event.target.value)}>
                <option value="">{t('tickets.create.assigneeSelect')}</option>
                {options.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <span>{t('tickets.priority')}</span>
              <select value={priority} onChange={(event) => onChangePriority(event.target.value)}>
                <option value="low">{t('tickets.priorityLow')}</option>
                <option value="medium">{t('tickets.priorityMedium')}</option>
                <option value="high">{t('tickets.priorityHigh')}</option>
              </select>
            </div>
            <div className="form-field">
              <span>{t('tickets.dueDate')}</span>
              <input type="date" value={dueDate} onChange={(event) => onChangeDueDate(event.target.value)} />
            </div>
            <div className="form-field">
              <span>{t('tickets.create.description')}</span>
              <textarea
                rows={5}
                placeholder={t('tickets.create.descriptionPlaceholder')}
                value={description}
                onChange={(event) => onChangeDescription(event.target.value)}
              />
            </div>
            <div className="form-field">
              <span>{t('tickets.create.attachments')}</span>
              <label className="btn ghost ticket-attachment-picker">
                <TbPaperclip />
                {t('tickets.create.chooseAttachments')}
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  disabled={saving}
                  style={{ display: 'none' }}
                />
              </label>
              {fileError ? <span className="form-error">{fileError}</span> : null}
              {selectedFiles.length ? (
                <div className="ticket-attachment-list">
                  {selectedFiles.map((file, index) => (
                    <div className="ticket-attachment-item" key={`${file.name}-${index}`}>
                      <span title={file.name}>{file.name}</span>
                      <button type="button" className="btn ghost" onClick={() => removeFile(index)} disabled={saving}>
                        <TbX aria-hidden="true" />
                        <span className="sr-only">{t('tickets.create.removeAttachment')}</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" type="button" disabled={saving} onClick={() => onSubmit(selectedFiles)}>
              <TbSend />
              {saving ? t('tasks.detail.saving') : t('tickets.create.createButton')}
            </button>
            <button className="btn ghost" type="button" onClick={onCancel} disabled={saving}>
              <TbX />
              {t('tickets.create.cancel')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default TicketCreateModal
