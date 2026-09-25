import React, { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore'
import { TbAlertTriangle, TbArrowLeft, TbCircleCheck, TbFileImport, TbPlus, TbTrash } from 'react-icons/tb'
import Modal from './Modal'
import { parseWorkbook } from '../utils/xlsxParser'
import { clientImportSchema, REQUIRED_FIELDS } from '../constants/clientImportSchema'
import { buildAutoMapping } from '../utils/columnMatching'
import { applyMapping, buildColumns, buildErrorCsv } from '../utils/clientImport'
import { db } from '../firebase'
import { buildDedupIndexes, classifyActions, flagDuplicateTorzs, headerSignature, loadTemplates, saveTemplates } from '../features/imports/utils/clientImport'

const PREVIEW_LIMIT = 10
const STEP_ORDER = ['upload', 'map', 'preview', 'summary']
const STEP_LABELS = ['Fájl', 'Párosítás', 'Ellenőrzés', 'Eredmény']

const hasImportValue = (value) => {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

const formatFileSize = (size) => {
  if (!Number.isFinite(size)) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const formatTemplateDate = (value) => {
  if (!value) return 'korábban mentve'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'korábban mentve' : new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium' }).format(date)
}

const formatImportValue = (value) => {
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' ? `${item.month}: ${item.amount}` : String(item))).join(', ')
  if (value === true) return 'Igen'
  if (value === false) return 'Nem'
  return String(value ?? '—')
}

function ClientImportWizard({ onClose, clients = [], onComplete, variant = 'modal' }) {
  const [step, setStep] = useState('upload')
  const [parsed, setParsed] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [selectedSheet, setSelectedSheet] = useState(0)
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [columns, setColumns] = useState([])
  const [mapping, setMapping] = useState({})
  const [scores, setScores] = useState({})
  const [preview, setPreview] = useState({ normalizedRows: [], validRows: [], invalidRows: [] })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [templates, setTemplates] = useState(loadTemplates())
  const [templateName, setTemplateName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [excludedRowNumbers, setExcludedRowNumbers] = useState([])
  const [reviewFilter, setReviewFilter] = useState('all')
  const [reviewSearch, setReviewSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState([])
  const fileInputRef = useRef(null)

  const requiredUnmapped = useMemo(() => REQUIRED_FIELDS.filter((key) => !mapping[key]), [mapping])
  const currentSheetRows = useMemo(() => parsed?.sheets[selectedSheet]?.rows || [], [parsed, selectedSheet])
  const previewFields = useMemo(() => clientImportSchema.filter((field) => mapping[field.key]).slice(0, 6), [mapping])
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])
  const excludedRowSet = useMemo(() => new Set(excludedRowNumbers), [excludedRowNumbers])
  const importableRows = useMemo(() => preview.validRows.filter((row) => !excludedRowSet.has(row.rowNumber)), [preview.validRows, excludedRowSet])
  const impact = useMemo(() => ({
    created: importableRows.filter((row) => row.action === 'create').length,
    updated: importableRows.filter((row) => row.action === 'update').length,
    invalid: preview.invalidRows.length,
    excluded: excludedRowNumbers.length,
  }), [importableRows, preview.invalidRows.length, excludedRowNumbers.length])
  const visiblePreviewRows = useMemo(() => {
    const query = reviewSearch.trim().toLocaleLowerCase('hu')
    return preview.normalizedRows.filter((row) => {
      const excluded = excludedRowSet.has(row.rowNumber)
      const matchesFilter = reviewFilter === 'all'
        || (reviewFilter === 'error' && row.errors.length)
        || (reviewFilter === 'excluded' && excluded)
        || (reviewFilter === 'create' && !row.errors.length && !excluded && row.action === 'create')
        || (reviewFilter === 'update' && !row.errors.length && !excluded && row.action === 'update')
      if (!matchesFilter) return false
      return !query || [row.rowNumber, ...Object.values(row.data || {})].join(' ').toLocaleLowerCase('hu').includes(query)
    })
  }, [preview.normalizedRows, reviewFilter, reviewSearch, excludedRowSet])
  const previewRows = reviewFilter === 'all' && !reviewSearch.trim()
    ? visiblePreviewRows.slice(0, PREVIEW_LIMIT)
    : visiblePreviewRows
  const columnSamples = useMemo(() => {
    const dataRows = currentSheetRows.slice(headerRowIndex + 1, headerRowIndex + 4)
    return new Map(columns.map((column) => [column.id, dataRows.map((row) => row?.[column.index]).filter(hasImportValue).map(String)]))
  }, [columns, currentSheetRows, headerRowIndex])
  const mappingGroups = useMemo(() => {
    const required = clientImportSchema.filter((field) => field.required)
    const optional = clientImportSchema.filter((field) => !field.required)
    const needsAttention = optional.filter((field) => !mapping[field.key] || (scores[field.key]?.score || 0) < 0.85)
    const recognized = optional.filter((field) => mapping[field.key] && (scores[field.key]?.score || 0) >= 0.85)
    return { required, needsAttention, recognized }
  }, [mapping, scores])

  useEffect(() => {
    if (!currentSheetRows.length) return
    const nextColumns = buildColumns(currentSheetRows, headerRowIndex)
    const { mapping: autoMap, scores: autoScores } = buildAutoMapping(nextColumns)
    const matchingTemplate = templates.find((template) => template.signature === headerSignature(nextColumns))
    setColumns(nextColumns)
    setMapping(matchingTemplate?.mapping || autoMap)
    setScores(autoScores)
    setSelectedTemplate(matchingTemplate?.name || '')
  }, [currentSheetRows, headerRowIndex, templates])

  const resetWizard = () => {
    setStep('upload'); setParsed(null); setFileMeta(null); setSelectedSheet(0); setHeaderRowIndex(0); setColumns([])
    setMapping({}); setScores({}); setPreview({ normalizedRows: [], validRows: [], invalidRows: [] }); setImportResult(null)
    setError(''); setTemplateName(''); setSelectedTemplate(''); setExcludedRowNumbers([]); setReviewFilter('all'); setReviewSearch(''); setExpandedRows([])
  }

  const handleFile = async (file) => {
    if (!file) return
    setError('')
    try {
      const parsedWorkbook = await parseWorkbook(file)
      setParsed(parsedWorkbook)
      setFileMeta({ name: file.name, size: file.size })
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
    setMapping((previous) => {
      const next = { ...previous, [fieldKey]: columnId }
      if (!columnId) return next
      Object.keys(next).forEach((key) => { if (key !== fieldKey && next[key] === columnId) next[key] = '' })
      return next
    })
  }

  const handleTemplateSelect = (name) => {
    setSelectedTemplate(name)
    const template = templates.find((item) => item.name === name)
    if (template) setMapping(template.mapping)
  }

  const handleSaveTemplate = () => {
    const name = templateName.trim()
    if (!name) return
    const existing = templates.find((template) => template.name === name)
    const now = new Date().toISOString()
    const next = [...templates.filter((template) => template.name !== name), { name, mapping, signature: headerSignature(columns), createdAt: existing?.createdAt || now, updatedAt: now }]
    setTemplates(next); saveTemplates(next); setSelectedTemplate(name); setTemplateName('')
  }

  const handleDeleteTemplate = () => {
    if (!selectedTemplate) return
    const next = templates.filter((template) => template.name !== selectedTemplate)
    setTemplates(next); saveTemplates(next); setSelectedTemplate('')
  }

  const handlePreview = () => {
    const result = applyMapping(currentSheetRows, mapping, columns, { headerRowIndex })
    const withActions = flagDuplicateTorzs(classifyActions(result.normalizedRows, buildDedupIndexes(clients)))
    setPreview({ ...result, normalizedRows: withActions, validRows: withActions.filter((row) => !row.errors.length), invalidRows: withActions.filter((row) => row.errors.length) })
    setStep('preview')
  }

  const downloadErrors = () => {
    const rows = preview.invalidRows.map((row) => ({ ...row, errors: [...row.errors, ...columns.map((column) => `${column.header}: ${row.source?.[column.index] ?? ''}`)] }))
    const url = URL.createObjectURL(new Blob([buildErrorCsv(rows)], { type: 'text/csv' }))
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'import-errors.csv'; anchor.click(); URL.revokeObjectURL(url)
  }

  const canImport = useMemo(() => requiredUnmapped.length === 0 && preview.invalidRows.length === 0 && importableRows.length > 0, [requiredUnmapped, preview.invalidRows.length, importableRows.length])

  const handleImport = async () => {
    if (!canImport) return
    setImporting(true); setError('')
    const coll = collection(db, 'clients')
    const batchSize = 200
    let batch = writeBatch(db); let pending = 0; let created = 0; let updated = 0; let failed = 0
    let activityBatch = writeBatch(db); let activityPending = 0
    const flush = async () => { if (!pending) return; await batch.commit(); batch = writeBatch(db); pending = 0 }
    const flushActivities = async () => { if (!activityPending) return; await activityBatch.commit(); activityBatch = writeBatch(db); activityPending = 0 }
    try {
      for (const row of importableRows) {
        const payload = Object.fromEntries(Object.entries(row.data || {}).filter(([, value]) => hasImportValue(value)))
        let clientIdForActivity = row.targetId || payload.id || payload.clientId || ''
        if (row.action === 'update' && row.targetId) { batch.update(doc(coll, row.targetId), payload); updated += 1 } else { const ref = doc(coll); batch.set(ref, payload); clientIdForActivity = ref.id; created += 1 }
        pending += 1
        if (pending >= batchSize) await flush()
        activityBatch.set(doc(collection(db, 'clientActivities')), { clientId: clientIdForActivity, type: 'import', message: row.action === 'update' ? 'Import: frissítés' : 'Import: létrehozás', meta: { action: row.action }, actor: 'Import', createdAt: serverTimestamp() })
        activityPending += 1
        if (activityPending >= batchSize) await flushActivities()
      }
      await flush(); await flushActivities()
      const result = { created, updated, skipped: preview.invalidRows.length + excludedRowNumbers.length, failed }
      setImportResult(result); onComplete?.(result); setStep('summary')
    } catch (err) {
      setError(err.message || 'Import hiba')
    } finally {
      setImporting(false)
    }
  }

  const renderMappingRow = (field) => {
    const score = scores[field.key]?.score || 0
    const isMapped = Boolean(mapping[field.key])
    const status = !isMapped ? 'Párosítás szükséges' : score >= 0.85 ? 'Automatikusan felismerve' : 'Ellenőrzés javasolt'
    const statusClass = !isMapped ? 'needs-action' : score >= 0.85 ? 'confirmed' : 'check'
    const samples = columnSamples.get(mapping[field.key]) || []
    return <div key={field.key} className="client-import-mapping-row"><div className="client-import-mapping-field"><strong>{field.label}</strong>{field.required ? <span className="client-import-required">Kötelező</span> : null}<span className={`client-import-mapping-status ${statusClass}`}>{status}</span></div><label className="sr-only" htmlFor={`mapping-${field.key}`}>{field.label} oszlopa</label><select id={`mapping-${field.key}`} value={mapping[field.key] || ''} onChange={(event) => handleMappingChange(field.key, event.target.value)}><option value="">Ne importáld</option>{columns.map((column) => <option key={column.id} value={column.id}>{column.header}</option>)}</select><span className="client-import-samples">{samples.length ? samples.join(' · ') : 'Nincs mintaérték'}</span></div>
  }

  const title = 'Excel import'
  const currentStepIndex = STEP_ORDER.indexOf(step)
  const importLabel = `Importálás: ${impact.created} új, ${impact.updated} frissítés`
  const inner = <div className="client-import-wizard">
    <ol className="client-import-stepper" aria-label="Import lépései">{STEP_LABELS.map((label, index) => <li key={label} className={index < currentStepIndex ? 'is-complete' : index === currentStepIndex ? 'is-current' : ''}><span>{index < currentStepIndex ? <TbCircleCheck aria-hidden="true" /> : index + 1}</span><strong>{label}</strong></li>)}</ol>
    {step === 'preview' ? <div className="client-import-review-tools"><div className="client-import-review-filters" aria-label="Import sorok szűrése">{[['all', 'Összes'], ['create', 'Új'], ['update', 'Frissítés'], ['error', 'Hibás'], ['excluded', 'Kihagyott']].map(([value, label]) => <button key={value} className={`btn ghost${reviewFilter === value ? ' is-active' : ''}`} type="button" onClick={() => setReviewFilter(value)}>{label}</button>)}</div><input aria-label="Import sorok keresése" placeholder="Keresés sor, név vagy törzsszám alapján" value={reviewSearch} onChange={(event) => setReviewSearch(event.target.value)} /><span className="muted">{visiblePreviewRows.length} sor látható</span></div> : null}
    {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
    {step === 'upload' ? <div className={`client-import-dropzone${isDragging ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false) }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleFile(event.dataTransfer.files?.[0]) }}><TbFileImport aria-hidden="true" /><h2>Ügyféladatok feltöltése</h2><p>Húzd ide az Excel fájlt, vagy válaszd ki a számítógépről.</p><label className="btn" htmlFor="client-import-file">Fájl kiválasztása<input id="client-import-file" type="file" accept=".xlsx,.xls" onChange={(event) => handleFile(event.target.files?.[0])} ref={fileInputRef} /></label><small>Elfogadott formátum: .xlsx, .xls. Az üres Excel cellák nem írják felül a meglévő ügyféladatokat.</small></div> : null}
    {step === 'map' ? <div className="client-import-map-step"><div className="client-import-file-summary"><TbFileImport aria-hidden="true" /><div><strong>{fileMeta?.name || parsed?.fileName}</strong><span>{formatFileSize(fileMeta?.size)} · {parsed?.sheets.length || 0} munkalap</span></div><button className="btn ghost" type="button" onClick={() => fileInputRef.current?.click()}>Csere</button><input ref={fileInputRef} className="sr-only" type="file" accept=".xlsx,.xls" onChange={(event) => handleFile(event.target.files?.[0])} /></div><div className="client-import-controls"><label className="form-field"><span>Munkalap</span><select value={selectedSheet} onChange={(event) => setSelectedSheet(Number(event.target.value))}>{parsed?.sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}</select></label><label className="form-field"><span>Fejléc sora</span><select value={headerRowIndex} onChange={(event) => setHeaderRowIndex(Number(event.target.value))}>{currentSheetRows.slice(0, 5).map((_, index) => <option key={index} value={index}>{index + 1}. sor</option>)}</select></label><label className="form-field"><span>Mentett sablon</span><select value={selectedTemplate} onChange={(event) => handleTemplateSelect(event.target.value)}><option value="">Válassz...</option>{templates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}</select></label>{selectedTemplate ? <button className="btn ghost icon-btn" type="button" onClick={handleDeleteTemplate} title="Sablon törlése" aria-label="Sablon törlése"><TbTrash aria-hidden="true" /></button> : null}</div><section className="client-import-mapping-section"><div className="client-import-mapping-section__heading"><div><h2>Azonosítás</h2><p>Minden sor ezzel a mezővel kapcsolódik egy meglévő ügyfélhez.</p></div></div><div className="client-import-mapping-list">{mappingGroups.required.map(renderMappingRow)}</div></section>{mappingGroups.needsAttention.length ? <section className="client-import-mapping-section"><div className="client-import-mapping-section__heading"><div><h2>Figyelmet igényel</h2><p>Az alábbi oszlopokat ellenőrizd, mielőtt továbblépsz.</p></div><span>{mappingGroups.needsAttention.length}</span></div><div className="client-import-mapping-list">{mappingGroups.needsAttention.map(renderMappingRow)}</div></section> : null}{mappingGroups.recognized.length ? <details className="client-import-recognized"><summary><TbCircleCheck aria-hidden="true" /> Automatikusan felismert mezők ({mappingGroups.recognized.length})</summary><div className="client-import-mapping-list">{mappingGroups.recognized.map(renderMappingRow)}</div></details> : null}<div className="client-import-template-save"><input type="text" placeholder="Új sablon neve" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /><button className="btn ghost" type="button" onClick={handleSaveTemplate} disabled={!templateName.trim()}><TbPlus aria-hidden="true" /> Sablon mentése</button></div>{requiredUnmapped.length ? <div className="banner banner-error">A kötelező mező nincs párosítva: {requiredUnmapped.join(', ')}.</div> : null}<div className="wizard-actions"><button className="btn ghost" type="button" onClick={resetWizard}><TbArrowLeft aria-hidden="true" /> Másik fájl</button><button className="btn" type="button" onClick={handlePreview} disabled={requiredUnmapped.length > 0}>Ellenőrzés</button></div></div> : null}
    {step === 'preview' ? <div className="client-import-preview-step"><div className="client-import-impact-grid"><div className="client-import-impact-card is-create"><span>Új ügyfél</span><strong>{impact.created}</strong></div><div className="client-import-impact-card is-update"><span>Frissülő ügyfél</span><strong>{impact.updated}</strong></div><div className={`client-import-impact-card ${impact.invalid ? 'is-error' : ''}`}><span>Hibás sor</span><strong>{impact.invalid}</strong></div><div className="client-import-impact-card"><span>Összes sor</span><strong>{preview.normalizedRows.length}</strong></div></div>{preview.invalidRows.length ? <div className="client-import-error-summary"><TbAlertTriangle aria-hidden="true" /><div><strong>{preview.invalidRows.length} hibás sor miatt az import nem indítható el.</strong><span>Javítsd a párosítást, vagy töltsd le a hibajegyzéket.</span></div><button className="btn ghost" type="button" onClick={downloadErrors}>Hibák letöltése</button></div> : <div className="client-import-ready-summary"><TbCircleCheck aria-hidden="true" /> Az import ellenőrzése sikeres. Az üres Excel cellák nem írják felül a meglévő értékeket.</div>}<div className="preview-table client-import-preview-table"><table><thead><tr><th>Sor</th><th>Állapot</th>{previewFields.map((field) => <th key={field.key}>{field.label}</th>)}<th>Művelet</th></tr></thead><tbody>{previewRows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td><span className={`client-import-row-status${row.errors.length ? ' is-error' : ''}`}>{row.errors.length ? 'Hibás' : 'Rendben'}</span></td>{previewFields.map((field) => <td key={field.key}>{String(row.data[field.key] || '—')}</td>)}<td>{row.action === 'update' ? 'Frissítés' : 'Létrehozás'}</td></tr>)}</tbody></table>{preview.normalizedRows.length > previewRows.length ? <div className="muted">Csak az első {PREVIEW_LIMIT} sor látható.</div> : null}</div><div className="wizard-actions"><button className="btn ghost" type="button" onClick={() => setStep('map')}><TbArrowLeft aria-hidden="true" /> Párosítás módosítása</button><button className="btn" type="button" onClick={handleImport} disabled={!canImport || importing}>{importing ? 'Importálás...' : importLabel}</button></div></div> : null}
    {step === 'summary' ? <div className="client-import-summary"><TbCircleCheck aria-hidden="true" /><h2>Az import elkészült</h2><p>Az ügyféladatok frissítése sikeresen befejeződött.</p><div className="client-import-impact-grid"><div className="client-import-impact-card is-create"><span>Létrehozva</span><strong>{importResult?.created || 0}</strong></div><div className="client-import-impact-card is-update"><span>Frissítve</span><strong>{importResult?.updated || 0}</strong></div><div className="client-import-impact-card"><span>Kihagyva</span><strong>{importResult?.skipped || 0}</strong></div></div><div className="wizard-actions"><button className="btn ghost" type="button" onClick={resetWizard}>Új import</button><button className="btn" type="button" onClick={onClose}>Ügyfelek megnyitása</button></div></div> : null}
  </div>

  if (variant === 'page') return <section className="panel client-import-panel"><div className="panel-head"><div><p className="eyebrow">Import</p><h1 className="section-title">{title}</h1><p className="section-subtitle">Töltsd fel az Excel fájlt, ellenőrizd a párosítást, majd nézd át a változásokat importálás előtt.</p></div>{onClose ? <button className="btn ghost" type="button" onClick={onClose}>Vissza</button> : null}</div>{inner}</section>
  return <Modal title={title} onClose={onClose}>{inner}</Modal>
}

export default ClientImportWizard
