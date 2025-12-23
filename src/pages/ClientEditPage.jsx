import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbArrowLeft } from 'react-icons/tb'
import { doc, updateDoc } from 'firebase/firestore'
import ClientForm from '../components/ClientForm'
import { db } from '../firebase'
import { fieldDefinitions, emptyClient } from '../constants/clientFields'
import { useClientsCache } from '../hooks/useClientsCache'

const normalizeId = (value) => (value || '').toString().replace(/\D/g, '')

const buildFormDataFromClient = (client) =>
  fieldDefinitions.reduce(
    (acc, field) => {
      const current = client?.[field.key]
      if (field.type === 'boolean') {
        const normalized =
          typeof current === 'boolean'
            ? current
            : typeof current === 'string'
              ? ['true', '1', 'active', 'aktiv', 'akt¡v'].includes(current.toLowerCase())
              : false
        acc[field.key] = normalized
      } else if (field.type === 'multiselect') {
        if (Array.isArray(current)) acc[field.key] = current
        else if (typeof current === 'string') {
          acc[field.key] = current
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        } else {
          acc[field.key] = []
        }
      } else if (field.type === 'date') {
        if (current && typeof current === 'object' && current.toDate) {
          acc[field.key] = current.toDate().toISOString().slice(0, 10)
        } else if (current instanceof Date) {
          acc[field.key] = current.toISOString().slice(0, 10)
        } else if (typeof current === 'string') {
          acc[field.key] = current.slice(0, 10)
        } else {
          acc[field.key] = ''
        }
      } else {
        acc[field.key] = current ?? ''
      }
      return acc
    },
    { ...emptyClient }
  )

function ClientEditPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [formData, setFormData] = useState(emptyClient)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formInitialized, setFormInitialized] = useState(false)

  const client = useMemo(() => clients.find((c) => c.id === clientId) || null, [clients, clientId])

  const detailPath = useMemo(() => {
    const tax = client?.adoszam
    const shortTax = tax ? normalizeId(tax).slice(0, 8) : ''
    return shortTax ? `/clients/tax/${encodeURIComponent(shortTax)}` : clientId ? `/clients/id/${clientId}` : '/clients'
  }, [client, clientId])

  useEffect(() => {
    if (clientsError) setError(clientsError)
  }, [clientsError])

  useEffect(() => {
    if (client && !formInitialized) {
      setFormData(buildFormDataFromClient(client))
      setFormInitialized(true)
      setError('')
    } else if (!client && !clientsLoading && !clientsError) {
      setError('Nem tal lhat¢ gyf‚l.')
    }
  }, [client, clientsLoading, clientsError, formInitialized])

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!clientId) return
    setSaving(true)
    setError('')
    try {
      await updateDoc(doc(db, 'clients', clientId), formData)
      navigate(detailPath)
    } catch (err) {
      setError(err.message || 'Ment‚si hiba')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="page-container slide-in-right">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <button
            type="button"
            className="back-arrow"
            aria-label="Vissza"
            onClick={() => navigate(detailPath)}
          >
            <TbArrowLeft />
          </button>
          <div className="section-header__intro">
            <p className="eyebrow">gyf‚l</p>
            <h1 className="section-title">{client?.nev || 'gyf‚l szerkeszt‚se'}</h1>
            <p className="section-subtitle">Adatok szerkeszt‚se kグl別n oldalon</p>
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}

      <section className="panel">
        {clientsLoading && !formInitialized ? (
          <div className="banner">Betグlt‚s...</div>
        ) : null}

        {client ? (
          <ClientForm
            fields={fieldDefinitions}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onReset={() => navigate(detailPath)}
            editingId={clientId}
            saving={saving}
          />
        ) : null}
      </section>
    </main>
  )
}

export default ClientEditPage
