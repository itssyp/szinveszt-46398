export const toNumber = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

export const normalizeTaxcode = (value) => (value || '').toString().replace(/\D/g, '')
export const normalizeEmail = (value) => (value || '').toString().trim().toLowerCase()

function normalizeIsoDate(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (directMatch) return raw
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatAmount(value, currency = 'Ft') {
  return `${Math.round(toNumber(value)).toLocaleString('en-US')} ${currency}`
}

export function extractPartnerFromDoc(doc) {
  const p = doc?.document_partner || doc?.partner || null
  if (!p?.id) return null
  const emails = Array.isArray(p.emails) ? p.emails : []
  return {
    id: p.id,
    name: p.name || '',
    email: emails[0] || '',
    taxcode: p.taxcode || p.tax_code || '',
  }
}

export function addToDebtMap(map, partner, amount, invoiceCountInc = 1, dueDateRaw = '') {
  if (!partner?.id) return
  const prev = map.get(partner.id) || {
    id: partner.id,
    name: partner.name || '',
    email: partner.email || '',
    taxcode: partner.taxcode || '',
    debt: 0,
    invoiceCount: 0,
    earliestDueDate: '',
    latestDueDate: '',
  }
  const dueDate = normalizeIsoDate(dueDateRaw)
  const earliestDueDate =
    prev.earliestDueDate && dueDate
      ? (dueDate < prev.earliestDueDate ? dueDate : prev.earliestDueDate)
      : dueDate || prev.earliestDueDate || ''
  const latestDueDate =
    prev.latestDueDate && dueDate
      ? (dueDate > prev.latestDueDate ? dueDate : prev.latestDueDate)
      : dueDate || prev.latestDueDate || ''

  map.set(partner.id, {
    ...prev,
    email: prev.email || partner.email || '',
    name: prev.name || partner.name || '',
    taxcode: prev.taxcode || partner.taxcode || '',
    debt: toNumber(prev.debt) + toNumber(amount),
    invoiceCount: (prev.invoiceCount || 0) + invoiceCountInc,
    earliestDueDate,
    latestDueDate,
  })
}
