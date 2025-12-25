export const normalizeNumericId = (value) => (value || '').toString().replace(/\D/g, '')

export const normalizeTaxId = (value) => normalizeNumericId(value).slice(0, 8)
