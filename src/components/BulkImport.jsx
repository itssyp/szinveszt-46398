import React, { useState } from 'react'
import * as XLSX from 'xlsx'

function BulkImport({ fields, onImport, importing, variant = 'card' }) {
  const [fileName, setFileName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const parseRows = (rows) => {
    const headerRow = rows[0] || []
    const headerMap = {}
    headerRow.forEach((header, index) => {
      const normalized = String(header || '').trim().toLowerCase()
      const match = fields.find(
        (field) =>
          field.label.toLowerCase() === normalized ||
          field.key.toLowerCase() === normalized
      )
      if (match) headerMap[index] = match.key
    })

    if (!Object.keys(headerMap).length) {
      throw new Error('Nem találtam ismert oszlopfejlécet.')
    }

    const records = []
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i] || []
      const record = fields.reduce((acc, field) => {
        if (field.type === 'boolean') {
          acc[field.key] = false
        } else if (field.type === 'multiselect') {
          acc[field.key] = []
        } else {
          acc[field.key] = ''
        }
        return acc
      }, {})

      let hasValue = false
      Object.entries(headerMap).forEach(([colIndex, key]) => {
        const value = row[colIndex]
        if (value !== undefined && value !== null) {
          const fieldMeta = fields.find((f) => f.key === key)
          if (fieldMeta?.type === 'boolean') {
            const text = String(value).toLowerCase()
            const boolVal = ['true', '1', 'active', 'aktív', 'yes', 'igen'].includes(text)
            record[key] = boolVal
            if (boolVal) hasValue = true
          } else if (fieldMeta?.type === 'multiselect') {
            const parts = String(value)
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
            record[key] = parts
            if (parts.length) hasValue = true
          } else {
            const text = String(value)
            record[key] = text
            if (text.trim()) hasValue = true
          }
        }
      })

      if (hasValue) records.push(record)
    }

    return records
  }

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setMessage('')
    setError('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      const records = parseRows(rows)

      if (!records.length) {
        setMessage('A fájl üres vagy nincs adat a megadott oszlopokban.')
        return
      }

      await onImport(records)
      setMessage(`Sikeres import: ${records.length} sor.`)
    } catch (err) {
      setError(err.message || 'Nem sikerült beolvasni a fájlt.')
    } finally {
      event.target.value = ''
    }
  }

  const inlineView = (
    <div className="inline-import">
      <label className="btn ghost file-trigger">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          disabled={importing}
        />
        {importing ? 'Importálás...' : 'Excel import'}
      </label>
      {fileName ? <span className="filename">Fájl: {fileName}</span> : null}
      {message ? <span className="import-message">{message}</span> : null}
      {error ? <span className="import-error">Hiba: {error}</span> : null}
    </div>
  )

  const cardView = (
    <div className="panel import-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Excel</p>
          <h2>Excel import</h2>
          <p className="section-subtitle">Töltsd fel az ügyfelek adatait .xlsx fájlból.</p>
        </div>
        <label className="upload-button">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={importing}
          />
          {importing ? 'Feldolgozás...' : 'Fájl kiválasztása'}
        </label>
      </div>
      {fileName ? <p className="filename">Fájl: {fileName}</p> : null}
      {message ? <p className="import-message">{message}</p> : null}
      {error ? <p className="import-error">Hiba: {error}</p> : null}
      <p className="hint">
        Fejléceknek használd a mezőneveket (pl. "Név", "Státusz", "Telefonszám"). Ismeretlen oszlopokat kihagyok.
      </p>
    </div>
  )

  return variant === 'inline' ? inlineView : cardView
}

export default BulkImport
