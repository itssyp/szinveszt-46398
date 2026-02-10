import React, { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import Modal from './Modal'
import { parseWorkbook } from '../utils/xlsxParser'
import { clientImportSchema, REQUIRED_FIELDS } from '../constants/clientImportSchema'
import { buildAutoMapping } from '../utils/columnMatching'
import { applyMapping, buildColumns, buildErrorCsv } from '../utils/clientImport'
import { db } from '../firebase'
import {
  buildDedupIndexes,
  classifyActions,
  headerSignature,
  loadTemplates,
  saveTemplates,
} from '../features/imports/utils/clientImport'

const PREVIEW_LIMIT = 10

function ClientImportWizard({ onClose, clients = [], onComplete, variant = 'modal' }) {
  const [step, setStep] = useState('upload')
  const [parsed, setParsed] = useState(null)
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [columns, setColumns] = useState([])
  const [mapping, setMapping] = useState({})
  const [scores, setScores] = useState({})
  const [preview, setPreview] = useState({ normalizedRows: [], validRows: [], invalidRows: [] })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState(loadTemplates())
  const [templateName, setTemplateName] = useState('')
  const fileInputRef = useRef(null)

  const requiredUnmapped = useMemo(
    () => REQUIRED_FIELDS.filter((key) => !mapping[key]),
    [mapping]
  )

  const currentSheetRows = useMemo(() => {
    if (!parsed) return []
    return parsed.sheets[selectedSheet]?.rows || []
  }, [parsed, selectedSheet])

  useEffect(() => {
    if (currentSheetRows.length) {
      const cols = buildColumns(currentSheetRows, headerRowIndex)
      setColumns(cols)
      const { mapping: autoMap, scores: autoScores } = buildAutoMapping(cols)
      setMapping(autoMap)
      setScores(autoScores)

      const sig = headerSignature(cols)
      const match = templates.find((t) => t.signature === sig)
      if (match) setMapping(match.mapping)
    }
  }, [currentSheetRows, headerRowIndex, templates])

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const parsedWorkbook = await parseWorkbook(file)
      setParsed(parsedWorkbook)
      setSelectedSheet(0)
      setHeaderRowIndex(0)
      setStep('map')
    } catch (err) {
      setError(err.message || 'Nem sikerült beolvasni a fájlt.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleMappingChange = (fieldKey, columnId) => {
    setMapping((prev) => ({ ...prev, [fieldKey]: columnId }))
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return
    const next = [
      ...templates.filter((t) => t.name !== templateName.trim()),
      { name: templateName.trim(), mapping, signature: headerSignature(columns) },
    ]
    setTemplates(next)
    saveTemplates(next)
  }

  const handleDeleteTemplate = (name) => {
    const next = templates.filter((t) => t.name !== name)
    setTemplates(next)
    saveTemplates(next)
  }

  const handlePreview = () => {
    const result = applyMapping(currentSheetRows, mapping, columns, { headerRowIndex })
    const dedup = buildDedupIndexes(clients)
    const withActions = classifyActions(result.normalizedRows, dedup)
    setPreview({
      ...result,
      normalizedRows: withActions,
      validRows: withActions.filter((r) => !r.errors.length),
      invalidRows: withActions.filter((r) => r.errors.length),
    })
    setStep('preview')
  }

  const downloadErrors = () => {
    const csv = buildErrorCsv(preview.invalidRows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-errors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const canImport = useMemo(
    () => requiredUnmapped.length === 0 && preview.invalidRows.length === 0 && preview.validRows.length > 0,
    [requiredUnmapped, preview]
  )

  const handleImport = async () => {
    if (!canImport) return
    setImporting(true)
    setError('')
    const coll = collection(db, 'clients')
    const BATCH_SIZE = 200
    let batch = writeBatch(db)
    let pending = 0
    let created = 0
    let updated = 0
    let failed = 0
    let activityBatch = writeBatch(db)
    let activityPending = 0

    const flush = async () => {
      if (pending === 0) return
      await batch.commit()
      batch = writeBatch(db)
      pending = 0
    }

    const flushActivities = async () => {
      if (activityPending === 0) return
      await activityBatch.commit()
      activityBatch = writeBatch(db)
      activityPending = 0
    }

    try {
      for (const row of preview.validRows) {
        const payload = row.data
        let clientIdForActivity = row.targetId || payload.id || payload.clientId || ''
        if (row.action === 'update' && row.targetId) {
          const ref = doc(coll, row.targetId)
          batch.update(ref, payload)
          updated += 1
        } else {
          const ref = doc(coll)
          batch.set(ref, payload)
          clientIdForActivity = ref.id
          created += 1
        }
        pending += 1
        if (pending >= BATCH_SIZE) await flush()

        const actRef = doc(collection(db, 'clientActivities'))
        activityBatch.set(actRef, {
          clientId: clientIdForActivity,
          type: 'import',
          message: row.action === 'update' ? 'Import: frissítés' : 'Import: létrehozás',
          meta: { action: row.action },
          actor: 'Import',
          createdAt: serverTimestamp(),
        })
        activityPending += 1
        if (activityPending >= BATCH_SIZE) await flushActivities()
      }
      await flush()
      await flushActivities()
      const result = { created, updated, skipped: preview.invalidRows.length, failed }
      setImportResult(result)
      if (onComplete) onComplete(result)
      setStep('summary')
    } catch (err) {
      setError(err.message || 'Import hiba')
    } finally {
      setImporting(false)
    }
  }

  const previewRows = useMemo(() => preview.normalizedRows.slice(0, PREVIEW_LIMIT), [preview])
  const title = 'Excel import varázsló'

  const inner = (
    <div className="wizard">
        {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

        {step === 'upload' ? (
          <div className="upload-step">
            <p>Tölts fel egy .xlsx fájlt. Többlapos fájl esetén választhatsz lapot a következő lépésben.</p>
            <label className="btn">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                ref={fileInputRef}
                style={{ display: 'none' }}
              />
              Fájl kiválasztása
            </label>
          </div>
        ) : null}

        {step === 'map' ? (
          <div className="map-step">
            <div className="map-controls">
              <label className="form-field">
                <span>Lap</span>
                <select value={selectedSheet} onChange={(e) => setSelectedSheet(Number(e.target.value))}>
                  {parsed?.sheets.map((sheet, idx) => (
                    <option key={sheet.name} value={idx}>
                      {sheet.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Fejléc sora</span>
                <select value={headerRowIndex} onChange={(e) => setHeaderRowIndex(Number(e.target.value))}>
                  {(currentSheetRows || []).slice(0, 5).map((_, idx) => (
                    <option key={idx} value={idx}>
                      {idx + 1}. sor
                    </option>
                  ))}
                </select>
              </label>
              <div className="template-controls compact-row">
                <label className="form-field">
                  <span>Sablon</span>
                  <select
                    onChange={(e) => {
                      const name = e.target.value
                      const tpl = templates.find((t) => t.name === name)
                      if (tpl) setMapping(tpl.mapping)
                    }}
                    value=""
                  >
                    <option value="">Válassz...</option>
                    {templates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  type="text"
                  placeholder="Új sablon neve"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  style={{ maxWidth: 180 }}
                />
                <button className="btn ghost" type="button" onClick={handleSaveTemplate}>
                  Mentés
                </button>
                {templates.length ? (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => {
                      const name = templateName.trim()
                      if (name) handleDeleteTemplate(name)
                    }}
                  >
                    Sablon törlése
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mapping-table compact">
              <div className="mapping-header">
                <span>Mező</span>
                <span>Oszlop</span>
                <span>Bizalom</span>
              </div>
              {clientImportSchema.map((field) => (
                <div key={field.key} className="mapping-row">
                  <div>
                    <strong>{field.label}</strong> {field.required ? <span className="pill pill-quiet">Kötelező</span> : null}
                    <div className="muted">{field.key}</div>
                  </div>
                  <select
                    value={mapping[field.key] || ''}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                  >
                    <option value="">Ne importáld</option>
                    {columns.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.header}
                      </option>
                    ))}
                  </select>
                  <span className="muted">
                    {scores[field.key]?.score ? Math.round(scores[field.key].score * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
            {requiredUnmapped.length ? (
              <div className="banner banner-error">
                Kötelező mezők nincsenek hozzárendelve: {requiredUnmapped.join(', ')}
              </div>
            ) : null}
            <div className="wizard-actions">
              <button className="btn ghost" type="button" onClick={() => setStep('upload')}>
                Vissza
              </button>
              <button className="btn" type="button" onClick={handlePreview}>
                Tovább az előnézethez
              </button>
            </div>
          </div>
        ) : null}

        {step === 'preview' ? (
          <div className="preview-step">
            <div className="metric-bar">
              <div className="metric-card">
                <span className="metric-label">Érvényes sor</span>
                <span className="metric-value">{preview.validRows.length}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Hibás sor</span>
                <span className="metric-value">{preview.invalidRows.length}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Összes</span>
                <span className="metric-value">{preview.normalizedRows.length}</span>
              </div>
            </div>

            {preview.invalidRows.length ? (
              <div className="banner banner-error">
                Van {preview.invalidRows.length} hibás sor. Javítsd a megfeleltetést vagy töltsd le a hibákat CSV-ben.
                <button className="btn ghost" type="button" onClick={downloadErrors} style={{ marginLeft: 8 }}>
                  Hibák letöltése
                </button>
              </div>
            ) : null}

            <div className="preview-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Állapot</th>
                    {clientImportSchema.map((f) => (
                      <th key={f.key}>{f.label}</th>
                    ))}
                    <th>Havi bevételek</th>
                    <th>Művelet</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td className={row.errors.length ? 'text-error' : 'text-success'}>
                        {row.errors.length ? 'Hibás' : 'OK'}
                      </td>
                      {clientImportSchema.map((f) => (
                        <td key={f.key}>{String(row.data[f.key] || '')}</td>
                      ))}
                      <td>
                        {Array.isArray(row.data.monthlyIncomes) && row.data.monthlyIncomes.length
                          ? row.data.monthlyIncomes
                              .map((m) => `${m.month}: ${m.amount}`)
                              .join(', ')
                          : ''}
                      </td>
                      <td>{row.action === 'update' ? 'Frissítés' : 'Létrehozás'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.normalizedRows.length > previewRows.length ? (
                <div className="muted">Csak az első 10 sor jelenik meg.</div>
              ) : null}
            </div>

            <div className="wizard-actions">
              <button className="btn ghost" type="button" onClick={() => setStep('map')}>
                Vissza
              </button>
              <button className="btn" type="button" onClick={handleImport} disabled={!canImport || importing}>
                {importing ? 'Importálás...' : 'Importálás'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'summary' ? (
          <div className="summary-step">
            <div className="metric-bar">
              <div className="metric-card">
                <span className="metric-label">Létrehozva</span>
                <span className="metric-value">{importResult?.created || 0}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Frissítve</span>
                <span className="metric-value">{importResult?.updated || 0}</span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Kihagyva</span>
                <span className="metric-value">{importResult?.skipped || 0}</span>
              </div>
            </div>
            <div className="wizard-actions">
              <button className="btn" type="button" onClick={onClose || (() => setStep('upload'))}>
                Kész
              </button>
            </div>
          </div>
        ) : null}
    </div>
  )

  if (variant === 'page') {
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Import</p>
            <h1 className="section-title">{title}</h1>
            <p className="section-subtitle">Töltsd fel az Excel fájlt, majd párosítsd a mezőket az ügyféladatokhoz.</p>
          </div>
          {onClose ? (
            <button className="btn ghost" type="button" onClick={onClose}>
              Vissza
            </button>
          ) : null}
        </div>
        {inner}
      </section>
    )
  }

  return (
    <Modal title={title} onClose={onClose}>
      {inner}
    </Modal>
  )
}

export default ClientImportWizard

