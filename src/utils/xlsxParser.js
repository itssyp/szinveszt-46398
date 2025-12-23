import * as XLSX from 'xlsx'

// Existing parser single source of truth:
// - Reads an .xlsx/.xls File/Blob
// - Parses each sheet with XLSX.utils.sheet_to_json(sheet, { header: 1 })
// - Returns rows as a 2D array of cell values (first row is the header row if present)
// - Does not coerce types; values are whatever XLSX gives back
export async function parseWorkbook(file) {
  if (!file) throw new Error('Hiányzik a fájl.')
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    return { name: sheetName, rows }
  })
  return { fileName: file.name, sheets }
}

export function disambiguateHeaders(rawHeaders = []) {
  const seen = {}
  return rawHeaders.map((header) => {
    const base = String(header || '').trim() || 'Oszlop'
    const norm = base.toLowerCase()
    seen[norm] = (seen[norm] || 0) + 1
    return seen[norm] === 1 ? base : `${base} (${seen[norm]})`
  })
}
