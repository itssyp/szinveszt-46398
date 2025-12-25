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

const MONTH_ALIASES = {
  jan: '01',
  január: '01',
  januar: '01',
  feb: '02',
  február: '02',
  februar: '02',
  mar: '03',
  március: '03',
  marcius: '03',
  ápr: '04',
  apr: '04',
  április: '04',
  aprilis: '04',
  may: '05',
  május: '05',
  majus: '05',
  jun: '06',
  június: '06',
  junius: '06',
  jul: '07',
  július: '07',
  julius: '07',
  aug: '08',
  augusztus: '08',
  sep: '09',
  szeptember: '09',
  okt: '10',
  október: '10',
  oktober: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
}

function normalizeMonthHeader(text) {
  if (!text) return null
  const norm = headerNorm(String(text))
  // direct YYYY-MM or YYYY.MM or YYYY/MM
  const direct = norm.match(/(20\d{2})[\s\.\-\/]?(\d{1,2})/)
  if (direct) {
    const year = direct[1]
    const month = direct[2].padStart(2, '0')
    return `${year}-${month}`
  }
  // month name + optional year
  const parts = norm.split(/[\s\.\-_/]+/).filter(Boolean)
  if (!parts.length) return null
  let year = parts.find((p) => /^20\d{2}$/.test(p)) || ''
  let month = ''
  for (const p of parts) {
    if (MONTH_ALIASES[p]) {
      month = MONTH_ALIASES[p]
      break
    }
  }
  if (month) {
    if (!year) year = String(new Date().getFullYear())
    return `${year}-${month}`
  }
  return null
}

const toNumber = (value) => {
  if (value === undefined || value === null) return NaN
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/\s+/g, '').replace(/[^0-9\-,\.]/g, '').replace(',', '.')
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : NaN
}

export function applyMapping(rows, mapping, columns, { headerRowIndex = 0 } = {}) {
  const dataStart = headerRowIndex + 1
  const fieldByKey = clientImportSchema.reduce((acc, f) => ({ ...acc, [f.key]: f }), {})
  const normalizedRows = []
  const validRows = []
  const invalidRows = []

  const monthColumns = columns
    .map((col) => ({ col, month: normalizeMonthHeader(col.header) }))
    .filter((entry) => entry.month)

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

    // Collect monthly incomes from detected month columns
    const incomes = []
    monthColumns.forEach(({ col, month }) => {
      const raw = row[col.index]
      const amount = toNumber(raw)
      if (!Number.isFinite(amount) || amount === 0) return
      incomes.push({ month, amount })
    })
    if (incomes.length) {
      out.monthlyIncomes = incomes
    }

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
