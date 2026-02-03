import * as XLSX from 'xlsx'
import { clientImportSchema } from '../constants/clientImportSchema'

const formatExportValue = (value) => {
  if (value === null || value === undefined) return ''
  if (value?.toDate && typeof value.toDate === 'function') {
    const date = value.toDate()
    return Number.isNaN(date?.getTime()) ? '' : date.toISOString().slice(0, 10)
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'igen' : 'nem'
  return String(value).trim()
}

export function exportClientsToExcel(clients) {
  const headers = clientImportSchema.map((field) => field.label)
  const keys = clientImportSchema.map((field) => field.key)
  const rows = clients.map((client) => keys.map((key) => formatExportValue(client[key])))
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ugyfelek')

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(workbook, `ugyfelek-export-${stamp}.xlsx`)
}
