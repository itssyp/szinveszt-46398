export const toNumber = (x) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

export const normalizeTaxcode = (value) => (value || '').toString().replace(/\D/g, '')
export const normalizeEmail = (value) => (value || '').toString().trim().toLowerCase()

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

export function addToDebtMap(map, partner, amount, invoiceCountInc = 1) {
  if (!partner?.id) return
  const prev = map.get(partner.id) || {
    id: partner.id,
    name: partner.name || '',
    email: partner.email || '',
    taxcode: partner.taxcode || '',
    debt: 0,
    invoiceCount: 0,
  }

  map.set(partner.id, {
    ...prev,
    email: prev.email || partner.email || '',
    name: prev.name || partner.name || '',
    taxcode: prev.taxcode || partner.taxcode || '',
    debt: toNumber(prev.debt) + toNumber(amount),
    invoiceCount: (prev.invoiceCount || 0) + invoiceCountInc,
  })
}
