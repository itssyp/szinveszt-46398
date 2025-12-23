import { clientImportSchema, REQUIRED_FIELDS } from '../constants/clientImportSchema'
import { headerNorm } from './columnMatching'

export const DEFAULT_PREVIEW_ROWS = 50

export function normalizeCell(field, raw) {
  if (!field) return ''
  try {
    return field.normalizer ? field.normalizer(raw) : raw
  } catch (_e) {
    return ''
  }
}

export function validateField(field, value) {
  if (!field) return null
  if (field.required && (!value || (Array.isArray(value) && !value.length))) {
    return 'Kötelező mező hiányzik'
  }
  for (const validator of field.validators || []) {
    const res = validator(value)
    if (res) return res
  }
  return null
}

export function buildColumns(rows, headerRowIndex = 0) {
  const headerRow = rows[headerRowIndex] || []
  const seen = {}
  return headerRow.map((header, idx) => {
    const raw = header === undefined || header === null ? '' : String(header)
    const base = raw.trim() || `Oszlop ${idx + 1}`
    const norm = headerNorm(base)
    seen[norm] = (seen[norm] || 0) + 1
    const disambiguated = seen[norm] > 1 ? `${base} (${seen[norm]})` : base
    return {
      id: `col-${idx}`,
      index: idx,
      header: disambiguated,
      norm,
      sample: rows[headerRowIndex + 1]?.[idx] ?? '',
    }
  })
}

export function applyMapping(rows, mapping, columns, { headerRowIndex = 0 } = {}) {
  const dataStart = headerRowIndex + 1
  const fieldByKey = clientImportSchema.reduce((acc, f) => ({ ...acc, [f.key]: f }), {})
  const normalizedRows = []
  const validRows = []
  const invalidRows = []

  for (let i = dataStart; i < rows.length; i += 1) {
    const row = rows[i] || []
    const out = {}
    const errors = []
    Object.entries(mapping).forEach(([fieldKey, columnId]) => {
      if (!columnId) return
      const field = fieldByKey[fieldKey]
      const column = columns.find((c) => c.id === columnId)
      if (!field || !column) return
      const raw = row[column.index]
      const value = normalizeCell(field, raw)
      out[fieldKey] = value
      const err = validateField(field, value)
      if (err) errors.push(`${field.label}: ${err}`)
    })

    REQUIRED_FIELDS.forEach((reqKey) => {
      if (mapping[reqKey] && !out[reqKey]) {
        const field = fieldByKey[reqKey]
        errors.push(`${field.label}: Kötelező mező hiányzik`)
      }
    })

    const entry = { rowNumber: i + 1, data: out, errors }
    normalizedRows.push(entry)
    if (errors.length) invalidRows.push(entry)
    else validRows.push(entry)
  }

  return { normalizedRows, validRows, invalidRows }
}

export function buildErrorCsv(invalidRows) {
  if (!invalidRows.length) return ''
  const headers = ['row', 'errors']
  const lines = [headers.join(',')]
  invalidRows.forEach((row) => {
    const rowNum = row.rowNumber
    const errs = row.errors.join('; ').replace(/"/g, '""')
    lines.push(`${rowNum},"${errs}"`)
  })
  return lines.join('\n')
}
