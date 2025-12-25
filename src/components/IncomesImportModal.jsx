import React, { useMemo, useState } from 'react'
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import Modal from './Modal'
import { parseWorkbook } from '../utils/xlsxParser'
import { db } from '../firebase'

const normalizeTax = (value) => (value || '').toString().replace(/\D/g, '').slice(0, 8)

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

const headerNorm = (text) =>
  text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const toNumber = (value) => {
  if (value === undefined || value === null) return NaN
  if (typeof value === 'number') return value
  const cleaned = String(value).replace(/\s+/g, '').replace(/[^0-9\-,\.]/g, '').replace(',', '.')
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : NaN
}

function normalizeMonthHeader(text) {
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

function detectColumns(headerRow) {
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

function mergeMonthlyIncomes(existing = [], incoming = []) {
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

function IncomesImportModal({ onClose, clients = [] }) {
  const [step, setStep] = useState('upload') // upload | preview | summary
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState({ updated: 0, skipped: 0, missing: 0 })

  const clientByTax = useMemo(() => {
    const map = new Map()
    clients.forEach((c) => {
      const t = normalizeTax(c.adoszam)
      if (t) map.set(t, c)
    })
    return map
  }, [clients])

  const parsedRows = useMemo(() => {
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
  }, [rows])

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const parsedWorkbook = await parseWorkbook(file)
      const sheet = parsedWorkbook.sheets[0]
      if (!sheet?.rows?.length) throw new Error('Üres vagy érvénytelen munkafüzet.')
      setRows(sheet.rows)
      setStep('preview')
    } catch (err) {
      setError(err.message || 'Nem sikerült beolvasni a fájlt.')
    }
  }

  const handleImport = async () => {
    if (!parsedRows.length) return
    setImporting(true)
    setError('')
    const batch = writeBatch(db)
    let updated = 0
    let missing = 0
    const BATCH_LIMIT = 400
    let pending = 0

    const flush = async () => {
      if (pending === 0) return
      await batch.commit()
    }

    try {
      parsedRows.forEach((row) => {
        const client = clientByTax.get(row.tax)
        if (!client) {
          missing += 1
          return
        }
        const ref = doc(db, 'clients', client.id)
        const merged = mergeMonthlyIncomes(client.monthlyIncomes, row.incomes)
        batch.update(ref, { monthlyIncomes: merged, monthlyIncomesUpdatedAt: serverTimestamp() })
        updated += 1
        pending += 1
      })

      if (pending) await flush()
      setSummary({ updated, missing, skipped: parsedRows.length - updated })
      setStep('summary')
    } catch (err) {
      setError(err.message || 'Import hiba')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal title="Bevételek import" onClose={onClose}>
      <div className="wizard">
        {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

        {step === 'upload' ? (
          <div className="upload-step">
            <p>Tölts fel egy .xlsx fájlt. Az első sor fejlécként lesz kezelve.</p>
            <label className="btn">
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
              Fájl kiválasztása
            </label>
          </div>
        ) : null}

        {step === 'preview' ? (
          <div className="preview-step">
            <p className="muted">
              Sorok száma: {rows.length - 1}. Érvényes import sorok: {parsedRows.length}. A többiek hiányzó adószám vagy
              bevétel miatt kimaradnak.
            </p>
            <div className="preview-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Adószám</th>
                    <th>Név</th>
                    <th>Bevételek</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 15).map((row) => (
                    <tr key={`${row.tax}-${row.row}`}>
                      <td>{row.row}</td>
                      <td>{row.tax}</td>
                      <td>{row.name || '-'}</td>
                      <td>{row.incomes.map((m) => `${m.month}: ${m.amount}`).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 15 ? <div className="muted">Csak az első 15 sor látható.</div> : null}
            </div>
            <div className="wizard-actions">
              <button className="btn ghost" type="button" onClick={() => setStep('upload')}>
                Vissza
              </button>
              <button className="btn" type="button" onClick={handleImport} disabled={importing || !parsedRows.length}>
                {importing ? 'Importálás...' : 'Importálás'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'summary' ? (
          <div className="summary-step">
            <div className="metric-bar">
              <div className="metric-card">
                <span className="metric-label">Frissítve</span>
                <span className="metric-value">{summary.updated}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Hiányzó ügyfél</span>
                <span className="metric-value">{summary.missing}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Kihagyva</span>
                <span className="metric-value">{summary.skipped}</span>
              </div>
            </div>
            <div className="wizard-actions">
              <button className="btn" type="button" onClick={onClose}>
                Kész
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

export default IncomesImportModal
