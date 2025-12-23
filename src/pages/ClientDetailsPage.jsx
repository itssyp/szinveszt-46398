import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbArrowLeft } from 'react-icons/tb'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import ClientDetails from '../components/ClientDetails'
import ClientForm from '../components/ClientForm'
import Modal from '../components/Modal'
import { fieldDefinitions, emptyClient } from '../constants/clientFields'
import { useClientsCache } from '../hooks/useClientsCache'
import TicketCreateModal from '../components/TicketCreateModal'

const normalizeId = (value) => (value || '').toString().replace(/\D/g, '')

function ClientDetailsPage() {
  const { taxNumber, clientId } = useParams()
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [client, setClient] = useState(null)
  const [docId, setDocId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [formData, setFormData] = useState(emptyClient)
  const [saving, setSaving] = useState(false)
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')

  useEffect(() => {
    if (clientsError) {
      setError(clientsError)
      setLoading(false)
      return
    }
    if (!clientsLoading) {
      let match = null
      if (taxNumber) {
        match = clients.find((c) => normalizeId(c.adoszam).slice(0, 8) === taxNumber) || null
      }
      if (!match && clientId) {
        match = clients.find((c) => c.id === clientId) || null
      }
      if (match) {
        setClient(match)
        setDocId(match.id)
        setError('')
      } else {
        setClient(null)
        setError('Nem található ügyfél.')
      }
      setLoading(false)
    }
  }, [clients, clientsLoading, clientsError, taxNumber, clientId])

  const startEdit = () => {
    if (!client) return
    const data = fieldDefinitions.reduce((acc, field) => {
      const current = client[field.key]
      if (field.type === 'boolean') {
        const normalized =
          typeof current === 'boolean'
            ? current
            : typeof current === 'string'
              ? ['true', '1', 'active', 'aktiv', 'aktív'].includes(current.toLowerCase())
              : false
        acc[field.key] = normalized
      } else if (field.type === 'multiselect') {
        if (Array.isArray(current)) acc[field.key] = current
        else if (typeof current === 'string')
          acc[field.key] = current
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        else acc[field.key] = []
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
    }, {})
    setFormData(data)
    setShowEdit(true)
  }

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!docId) return
    setSaving(true)
    setError('')
    try {
      await updateDoc(doc(db, 'clients', docId), formData)
      setShowEdit(false)
    } catch (err) {
      setError(err.message || 'Mentési hiba')
    } finally {
      setSaving(false)
    }
  }

  const title = useMemo(() => client?.nev || 'Ügyfél', [client])

  return (
    <main className="page-container slide-in-right">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <button
            type="button"
            className="back-arrow"
            aria-label="Vissza"
            onClick={() => navigate('/clients')}
          >
            <TbArrowLeft />
          </button>
          <div className="section-header__intro">
            <p className="eyebrow">Ügyfél</p>
            <h1 className="section-title">{title}</h1>
            {taxNumber ? <p className="section-subtitle">Adószám: {taxNumber}</p> : null}
            {clientId && !taxNumber ? <p className="section-subtitle">ID: {clientId}</p> : null}
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
      {loading ? <div className="banner">Betöltés...</div> : null}

      {!loading && client ? (
        <section className="panel">
          <div className="details-actions" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setTicketClient(client)
                setTicketAssignee('')
                setTicketDescription('')
                setTicketError('')
              }}
              title="Új ticket"
            >
              Új ticket
            </button>
            <button type="button" className="btn" onClick={startEdit}>
              Szerkesztés
            </button>
          </div>
          <ClientDetails client={client} onEdit={startEdit} fields={fieldDefinitions} />
        </section>
      ) : null}

      {showEdit ? (
        <Modal onClose={() => setShowEdit(false)} title="Ügyfél szerkesztése">
          <ClientForm
            fields={fieldDefinitions}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSave}
            onReset={() => setShowEdit(false)}
            editingId={docId}
            saving={saving}
          />
        </Modal>
      ) : null}

      {ticketClient ? (
        <TicketCreateModal
          client={ticketClient}
          description={ticketDescription}
          onChangeDescription={setTicketDescription}
          assignedTo={ticketAssignee}
          onChangeAssignedTo={setTicketAssignee}
          currentUser={ticketAssignee || 'Ismeretlen'}
          saving={ticketSaving}
          error={ticketError}
          onCancel={() => setTicketClient(null)}
          onSubmit={() => setTicketClient(null)}
        />
      ) : null}
    </main>
  )
}

export default ClientDetailsPage
