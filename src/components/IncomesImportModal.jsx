import React, { useMemo, useState } from 'react'
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import Modal from './Modal'
import { parseWorkbook } from '../utils/xlsxParser'
import { db } from '../firebase'
import { mergeMonthlyIncomes, normalizeTax, parseIncomeRows } from '../features/imports/utils/incomeImport'

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

  const parsedRows = useMemo(() => parseIncomeRows(rows), [rows])

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
    let batch = writeBatch(db)
    const commits = []
    let updated = 0
    let missing = 0
    const BATCH_LIMIT = 400
    let pending = 0

    const flush = async () => {
      if (!pending) return
      commits.push(batch.commit())
      batch = writeBatch(db)
      pending = 0
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
        if (pending >= BATCH_LIMIT) {
          flush()
        }
      })

      await flush()
      if (commits.length) await Promise.all(commits)
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
            <p>Tölts fel egy .xlsx fájlt. Az első sor fejléc­ként lesz kezelve.</p>
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
