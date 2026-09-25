const TEMPLATE_STORAGE_KEY = 'client-import-templates'

const normalizeTax = (value) => (value || '').toString().replace(/\D/g, '')
const normalizeTorzs = (value) => (value || '').toString().trim().toLowerCase()
const normalizeEmail = (value) => (value || '').toString().trim().toLowerCase()
const normalizePhone = (value) => (value || '').toString().replace(/[^\d]/g, '')

export const clientImportNormalizers = {
  normalizeTax,
  normalizeTorzs,
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
  const byTorzs = new Map()
  const byTax = new Map()
  const byEmail = new Map()
  const byPhone = new Map()
  clients.forEach((client) => {
    const torzs = normalizeTorzs(client.torzs)
    if (torzs) byTorzs.set(torzs, client.id)
    const tax = normalizeTax(client.adoszam)
    if (tax) byTax.set(tax, client.id)
    const email = normalizeEmail(client.email)
    if (email) byEmail.set(email, client.id)
    const phone = normalizePhone(client.telefonszam)
    if (phone) byPhone.set(phone, client.id)
  })
  return { byTorzs, byTax, byEmail, byPhone }
}

export function classifyActions(rows, dedup) {
  return rows.map((row) => {
    const torzs = normalizeTorzs(row.data.torzs)
    const existingId = torzs ? dedup.byTorzs.get(torzs) : null
    return { ...row, action: existingId ? 'update' : 'create', targetId: existingId || null }
  })
}

export function flagDuplicateTorzs(rows) {
  const counts = new Map()
  rows.forEach((row) => {
    const torzs = normalizeTorzs(row.data?.torzs)
    if (torzs) counts.set(torzs, (counts.get(torzs) || 0) + 1)
  })
  return rows.map((row) => {
    const torzs = normalizeTorzs(row.data?.torzs)
    if (!torzs || counts.get(torzs) < 2) return row
    return { ...row, errors: [...(row.errors || []), 'Törzsszám: Duplikált érték az importfájlban'] }
  })
}
