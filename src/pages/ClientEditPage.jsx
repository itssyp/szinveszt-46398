import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbArrowLeft } from 'react-icons/tb'
import { doc, updateDoc } from 'firebase/firestore'
import ClientForm from '../components/ClientForm'
import { db } from '../firebase'
import { useClientsCache } from '../hooks/useClientsCache'
import { logClientActivity } from '../utils/clientActivity'
import { useAuth } from '../hooks/useAuth.jsx'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { normalizeTaxId } from '../utils/id'
import { useClientSchema } from '../hooks/useClientSchema.jsx'

const CLIENT_STATUS_OPTIONS = ['akt\u00edv', 'lemondta/ kir\u00fagva', 'megsz\u0171nt', 'sz\u00fcnet']

function normalizeClientStatusOption(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (CLIENT_STATUS_OPTIONS.includes(raw)) return raw

  const normalized = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()

  if (normalized.startsWith('aktiv')) return 'akt\u00edv'
  if (normalized.includes('lemondta') || normalized.includes('kirugva')) return 'lemondta/ kir\u00fagva'
  if (normalized.startsWith('megsz')) return 'megsz\u0171nt'
  if (normalized.startsWith('szunet')) return 'sz\u00fcnet'
  return ''
}

const buildFormDataFromClient = (client, fields) =>
  fields.reduce(
    (acc, field) => {
      const current = client?.[field.key]
      if (field.type === 'boolean') {
        const normalized =
          typeof current === 'boolean'
            ? current
            : typeof current === 'string'
              ? ['true', '1', 'active', 'aktiv'].includes(current.toLowerCase())
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
        if (field.key === 'statusz') {
          acc[field.key] = normalizeClientStatusOption(current)
        } else {
          acc[field.key] = current ?? ''
        }
      }
      return acc
    },
    fields.reduce((base, f) => ({ ...base, [f.key]: f.type === 'boolean' ? false : f.type === 'multiselect' ? [] : '' }), {})
  )

function ClientEditPage() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const { fields, groups, emptyClientTemplate, loading: schemaLoading, error: schemaError } = useClientSchema()
  const [formData, setFormData] = useState(emptyClientTemplate)
  const [pristineData, setPristineData] = useState(emptyClientTemplate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [formInitialized, setFormInitialized] = useState(false)
  const { user } = useAuth()
  const { profile, profiles } = useUserProfile()
  const [showConfirmLeave, setShowConfirmLeave] = useState(false)
  const [pendingNav, setPendingNav] = useState(null)

  const client = useMemo(() => clients.find((c) => c.id === clientId) || null, [clients, clientId])

  const detailPath = useMemo(() => {
    const tax = client?.adoszam
    const shortTax = tax ? normalizeTaxId(tax) : ''
    return shortTax ? `/clients/tax/${encodeURIComponent(shortTax)}` : clientId ? `/clients/id/${clientId}` : '/clients'
  }, [client, clientId])

  const actorName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return 'Ismeretlen'
  }, [user, profile])
  const assigneeOptions = useMemo(() => {
    const names = (profiles || [])
      .map((p) => (p.username || p.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])
  const fieldsWithAssignees = useMemo(
    () =>
      fields.map((field) => {
        if (field.key === 'statusz') return { ...field, options: CLIENT_STATUS_OPTIONS }
        if (field.key !== 'hozzarendeltSzemely') return field
        const baseOptions = Array.isArray(field.options) ? field.options : []
        const mergedOptions = Array.from(new Set([...baseOptions, ...assigneeOptions]))
        return { ...field, options: mergedOptions }
      }),
    [fields, assigneeOptions]
  )

  useEffect(() => {
    if (clientsError) setError(clientsError)
    if (schemaError) setError(schemaError)
  }, [clientsError, schemaError])

  useEffect(() => {
    if (!client || !fields.length || formInitialized) return
    const built = buildFormDataFromClient(client, fields)
    setFormData(built)
    setPristineData(built)
    setFormInitialized(true)
    setError('')
  }, [client, fields, formInitialized])

  const handleChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: key === 'statusz' ? normalizeClientStatusOption(value) : value,
    }))
  }

  const isDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(pristineData),
    [formData, pristineData]
  )

  const requestNavigate = (path) => {
    if (saving) return
    if (isDirty) {
      setPendingNav(() => () => navigate(path))
      setShowConfirmLeave(true)
    } else {
      navigate(path)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!clientId) return
    setSaving(true)
    setError('')
    try {
      await updateDoc(doc(db, 'clients', clientId), formData)
      await logClientActivity({
        clientId,
        type: 'client_updated',
        message: 'Ügyfél adat frissítve',
        meta: {},
        actor: actorName,
      })
      setPristineData(formData)
      if (pendingNav) {
        const go = pendingNav
        setPendingNav(null)
        go()
      } else {
        navigate(detailPath)
      }
    } catch (err) {
      setError(err.message || 'Mentési hiba')
    } finally {
      setSaving(false)
      setShowConfirmLeave(false)
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
            onClick={() => requestNavigate(detailPath)}
          >
            <TbArrowLeft />
          </button>
          <div className="section-header__intro">
            <p className="eyebrow">Ügyfél</p>
            <h1 className="section-title">{client?.nev || 'Ügyfél szerkesztése'}</h1>
            <p className="section-subtitle">Adatok szerkesztése</p>
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {schemaLoading && !formInitialized ? <div className="banner">Séma betöltése...</div> : null}

      <section className="panel">
        {clientsLoading && !formInitialized ? <div className="banner">Betöltés...</div> : null}

        {client ? (
          <ClientForm
            fields={fieldsWithAssignees}
            groups={groups}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onReset={() => requestNavigate(detailPath)}
            editingId={clientId}
            saving={saving || schemaLoading}
          />
        ) : null}
      </section>

      {showConfirmLeave ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <header className="modal-header">
              <h2>Változások mentése?</h2>
            </header>
            <div className="modal-body">
              <p>Nem mentett módosításaid vannak. Mit szeretnél tenni?</p>
              <div className="form-actions">
                <button className="btn" type="button" onClick={handleSubmit} disabled={saving}>
                  Mentés
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setShowConfirmLeave(false)
                    setPendingNav(null)
                  }}
                  disabled={saving}
                >
                  Mégse
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setShowConfirmLeave(false)
                    if (pendingNav) pendingNav()
                  }}
                  disabled={saving}
                >
                  Elvetés
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default ClientEditPage
