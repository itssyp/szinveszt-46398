import { collection, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { uploadTicketAttachments } from '../utils/ticketAttachments'

export async function createTicket(payload, files = []) {
  const ticketRef = doc(collection(db, 'tickets'))
  const attachments = await uploadTicketAttachments(ticketRef.id, files)
  await setDoc(ticketRef, { ...payload, attachments })
  return ticketRef
}
