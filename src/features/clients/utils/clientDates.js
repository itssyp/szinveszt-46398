import { normalizeNumericId } from '../../../utils/id'

export const parseClientStartDate = (client) => {
  const raw = client?.kezdesDatuma
  if (raw && typeof raw === 'object' && raw.toDate) return raw.toDate()
  if (raw instanceof Date) return raw
  if (typeof raw === 'string' && raw) return new Date(raw)
  return null
}

export const formatClientStartDate = (client) => {
  const date = parseClientStartDate(client)
  if (!date) return '-'
  return date.toLocaleDateString('hu-HU')
}

export const buildExistingIdSet = (clients = []) => {
  const set = new Set()
  clients.forEach((c) => {
    const tax = normalizeNumericId(c.adoszam)
    const pid = normalizeNumericId(c.adoazonosito)
    if (tax) set.add(`tax:${tax}`)
    if (pid) set.add(`pid:${pid}`)
  })
  return set
}
