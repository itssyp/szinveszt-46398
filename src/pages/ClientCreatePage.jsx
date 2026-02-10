import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection } from 'firebase/firestore'
import ClientForm from '../components/ClientForm'
import { useClientSchema } from '../hooks/useClientSchema.jsx'
import { useClientsCache } from '../hooks/useClientsCache'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { buildExistingIdSet } from '../features/clients/utils/clientDates'
import { normalizeNumericId } from '../utils/id'
import { db } from '../firebase'

function ClientCreatePage() {
  const navigate = useNavigate()
  const { fields, groups, emptyClientTemplate, loading: schemaLoading, error: schemaError } = useClientSchema()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const { profiles } = useUserProfile()
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (emptyClientTemplate) {
      setFormData(emptyClientTemplate)
    }
  }, [emptyClientTemplate])

  const existingIds = useMemo(() => buildExistingIdSet(clients), [clients])
  const assigneeOptions = useMemo(() => {
    const names = (profiles || [])
      .map((p) => (p.username || p.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])
  const fieldsWithAssignees = useMemo(
    () =>
      fields.map((field) => {
        if (field.key !== 'hozzarendeltSzemely') return field
        const baseOptions = Array.isArray(field.options) ? field.options : []
        const mergedOptions = Array.from(new Set([...baseOptions, ...assigneeOptions]))
        return { ...field, options: mergedOptions }
      }),
    [fields, assigneeOptions]
  )

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setStatus('')
    try {
      const normalizedTax = normalizeNumericId(formData.adoszam)
      const normalizedPid = normalizeNumericId(formData.adoazonosito)

      if (normalizedTax && existingIds.has(`tax:${normalizedTax}`)) {
        throw new Error('Már létezik ügyfél ezzel az adószámmal.')
      }
      if (normalizedPid && existingIds.has(`pid:${normalizedPid}`)) {
        throw new Error('Már létezik ügyfél ezzel az adóazonosítóval.')
      }

      await addDoc(collection(db, 'clients'), formData)
      setStatus('Új ügyfél rögzítve.')
      if (emptyClientTemplate) {
        setFormData(emptyClientTemplate)
      }
    } catch (err) {
      setError(err.message || 'Mentési hiba')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page-container">
      {schemaError ? <div className="banner banner-error">Séma hiba: {schemaError}</div> : null}
      {clientsError ? <div className="banner banner-error">Hiba: {clientsError}</div> : null}
      {status ? <div className="banner banner-info">{status}</div> : null}
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Új ügyfél</p>
            <h1 className="section-title">Ügyfél rögzítése</h1>
          </div>
          <button className="btn ghost" type="button" onClick={() => navigate('/clients')}>
            Vissza a listához
          </button>
        </div>
        <ClientForm
          fields={fieldsWithAssignees}
          groups={groups}
          formData={formData}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onReset={() => setFormData(emptyClientTemplate)}
          editingId={null}
          saving={saving || schemaLoading || clientsLoading}
        />
        {schemaLoading ? <p className="muted">Séma betöltése...</p> : null}
      </section>
    </main>
  )
}

export default ClientCreatePage
