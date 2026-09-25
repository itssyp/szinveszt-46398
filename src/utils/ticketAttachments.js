import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase'

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
      const url = await getDownloadURL(storageRef)
      uploaded.push({
        name: file.name,
        size: file.size,
        contentType: file.type || 'application/octet-stream',
        storagePath,
        url,
        uploadedAt: new Date().toISOString(),
      })
    }
    return uploaded
  } catch (error) {
    await Promise.all(uploaded.map((attachment) => deleteObject(ref(storage, attachment.storagePath)).catch(() => undefined)))
    throw error
  }
}
