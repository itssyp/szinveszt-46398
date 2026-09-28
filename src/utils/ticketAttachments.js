import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { getAuth } from 'firebase/auth'
import { firebaseApp, storage } from '../firebase'
import { functionUrl } from '../config/firebaseTargets'

export const MAX_TICKET_ATTACHMENT_COUNT = 10
export const MAX_TICKET_ATTACHMENT_SIZE = 25 * 1024 * 1024

function makeSafeFileName(name) {
  return String(name || 'attachment')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 160) || 'attachment'
}

function makeAttachmentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function validateTicketAttachmentFiles(files) {
  const list = Array.from(files || [])
  if (list.length > MAX_TICKET_ATTACHMENT_COUNT) {
    throw new Error(`Legfeljebb ${MAX_TICKET_ATTACHMENT_COUNT} csatolmány tölthető fel.`)
  }
  const oversized = list.find((file) => file.size > MAX_TICKET_ATTACHMENT_SIZE)
  if (oversized) {
    throw new Error(`A csatolmányok maximális mérete fájlonként ${MAX_TICKET_ATTACHMENT_SIZE / 1024 / 1024} MB.`)
  }
  return list
}

export async function uploadTicketAttachments(ticketId, files) {
  const list = validateTicketAttachmentFiles(files)
  if (!list.length) return []

  const uploaded = []
  try {
    for (const file of list) {
      const storagePath = `tickets/${ticketId}/${makeAttachmentId()}-${makeSafeFileName(file.name)}`
      const storageRef = ref(storage, storagePath)
      await uploadBytes(storageRef, file, {
        contentType: file.type || 'application/octet-stream',
      })
      uploaded.push({
        name: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        storagePath,
        uploadedAt: new Date().toISOString(),
      })
    }
    return uploaded
  } catch (error) {
    await Promise.all(uploaded.map((attachment) => deleteObject(ref(storage, attachment.storagePath)).catch(() => undefined)))
    throw error
  }
}

export async function downloadTicketAttachment(attachment) {
  if (!attachment.storagePath?.startsWith('tickets/')) {
    throw new Error('Attachment path is missing.')
  }
  const user = getAuth(firebaseApp).currentUser
  if (!user) throw new Error('Authentication required.')
  const url = new URL(functionUrl('ticketAttachmentDownload'))
  url.searchParams.set('path', attachment.storagePath)
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } })
  if (!response.ok) throw new Error('Attachment download failed.')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = attachment.name || 'attachment'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
}
