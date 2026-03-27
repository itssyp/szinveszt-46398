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
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ügyfelek')

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(workbook, `ugyfelek-export-${stamp}.xlsx`)
}

export function exportUtalandoClientsToExcel(rows = [], { monthKey = '', sheetName = 'Utalandok' } = {}) {
  const headers = [
    'Nev',
    'Adoszam',
    'Hozzarendelt szemely',
    'Munkavegzes jellege',
    'Utalando gyakorisag',
    'Elkuldve',
    'Nullas',
    'Nyitott ticket',
    'Nyitott ticket ID',
  ]

  const body = rows.map((row) => [
    formatExportValue(row?.name),
    formatExportValue(row?.taxId),
    formatExportValue(row?.assignee),
    formatExportValue(row?.workType),
    formatExportValue(row?.frequency),
    row?.notified ? 'igen' : 'nem',
    row?.nullas ? 'igen' : 'nem',
    row?.hasOpenTicket ? 'igen' : 'nem',
    formatExportValue(row?.openTicketId),
  ])

  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const monthPart = monthKey ? `-${monthKey}` : ''
  XLSX.writeFile(workbook, `utalandok${monthPart}-${stamp}.xlsx`)
}
