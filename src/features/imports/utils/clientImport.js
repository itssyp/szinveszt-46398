const TEMPLATE_STORAGE_KEY = 'client-import-templates'

const normalizeTax = (value) => (value || '').toString().replace(/\D/g, '')
const normalizeEmail = (value) => (value || '').toString().trim().toLowerCase()
const normalizePhone = (value) => (value || '').toString().replace(/[^\d]/g, '')

export const clientImportNormalizers = {
  normalizeTax,
  normalizeEmail,
  normalizePhone,
}

export function loadTemplates() {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch (_e) {
    // ignore localStorage parsing errors
  }
  return []
}

export function saveTemplates(templates) {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))
}

export function headerSignature(columns) {
  return columns.map((c) => c.norm).join('|')
}

export function buildDedupIndexes(clients) {
  const byTax = new Map()
  const byEmail = new Map()
  const byPhone = new Map()
  clients.forEach((client) => {
    const tax = normalizeTax(client.adoszam)
    if (tax) byTax.set(tax, client.id)
    const email = normalizeEmail(client.email)
    if (email) byEmail.set(email, client.id)
    const phone = normalizePhone(client.telefonszam)
    if (phone) byPhone.set(phone, client.id)
  })
  return { byTax, byEmail, byPhone }
}

export function classifyActions(rows, dedup) {
  return rows.map((row) => {
    const tax = normalizeTax(row.data.adoszam)
    const email = normalizeEmail(row.data.email)
    const phone = normalizePhone(row.data.telefonszam)
    const existingId =
      (tax && dedup.byTax.get(tax)) || (email && dedup.byEmail.get(email)) || (phone && dedup.byPhone.get(phone))
    return { ...row, action: existingId ? 'update' : 'create', targetId: existingId || null }
  })
}
