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

export const normalizeTax = (value) => (value || '').toString().replace(/\D/g, '').slice(0, 8)

export const headerNorm = (text) =>
  text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

export const toNumber = (value) => {
  if (value === undefined || value === null) return NaN
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/\s+/g, '').replace(/[^0-9\-,\.]/g, '').replace(',', '.')
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : NaN
}

export function normalizeMonthHeader(text) {
  if (!text) return null
  const norm = headerNorm(text)
  const direct = norm.match(/(20\d{2})[\s\.\-\/]?(\d{1,2})/)
  if (direct) {
    const year = direct[1]
    const month = direct[2].padStart(2, '0')
    return `${year}-${month}`
  }
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

export function detectColumns(headerRow) {
  const cols = headerRow.map((h, idx) => ({
    header: h === undefined || h === null ? '' : String(h),
    index: idx,
    norm: headerNorm(h || ''),
  }))
  const taxCol =
    cols.find((c) => c.norm.includes('adoszam') || c.norm.includes('tax')) ||
    cols.find((c) => c.norm.includes('ado') && c.norm.includes('szam'))
  const nameCol = cols.find((c) => c.norm.includes('nev') || c.norm.includes('name'))
  const monthCols = cols
    .map((c) => ({ col: c, month: normalizeMonthHeader(c.header) }))
    .filter((m) => m.month)
  return { cols, taxCol, nameCol, monthCols }
}

export function mergeMonthlyIncomes(existing = [], incoming = []) {
  const map = new Map()
  existing.forEach((entry) => {
    if (entry?.month) map.set(entry.month, Number(entry.amount) || 0)
  })
  incoming.forEach((entry) => {
    if (entry?.month && Number.isFinite(entry.amount)) {
      map.set(entry.month, Number(entry.amount))
    }
  })
  return Array.from(map.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function parseIncomeRows(rows = []) {
  if (!rows.length) return []
  const headerRow = rows[0] || []
  const { taxCol, nameCol, monthCols } = detectColumns(headerRow)
  if (!taxCol || !monthCols.length) return []
  const dataRows = rows.slice(1)
  const out = []
  dataRows.forEach((row, idx) => {
    const tax = normalizeTax(row[taxCol.index])
    if (!tax) return
    const name = nameCol ? row[nameCol.index] || '' : ''
    const incomes = []
    monthCols.forEach(({ col, month }) => {
      const amount = toNumber(row[col.index])
      if (!Number.isFinite(amount) || amount === 0) return
      incomes.push({ month, amount })
    })
    if (incomes.length) out.push({ row: idx + 2, tax, name, incomes })
  })
  return out
}
