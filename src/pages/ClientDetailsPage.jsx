import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbArrowLeft } from 'react-icons/tb'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import ClientDetails from '../components/ClientDetails'
import { fieldDefinitions } from '../constants/clientFields'
import { useClientsCache } from '../hooks/useClientsCache'
import TicketCreateModal from '../components/TicketCreateModal'
import { db } from '../firebase'

const normalizeId = (value) => (value || '').toString().replace(/\D/g, '')

function ClientDetailsPage() {
  const { taxNumber, clientId } = useParams()
  const navigate = useNavigate()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const [client, setClient] = useState(null)
  const [docId, setDocId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [ticketCount, setTicketCount] = useState(0)

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

  useEffect(() => {
    if (!docId) return undefined
    const q = query(collection(db, 'tickets'), where('clientId', '==', docId))
    const unsub = onSnapshot(
      q,
      (snap) => setTicketCount(snap.size),
      (_err) => setTicketCount(0)
    )
    return () => unsub()
  }, [docId])

  const title = useMemo(() => client?.nev || 'Ügyfél', [client])

  const goToEditPage = () => {
    if (!docId) return
    navigate(`/clients/id/${docId}/edit`)
  }

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
                if (!docId) return
                const params = new URLSearchParams()
                params.set('clientId', docId)
                if (client?.nev) params.set('clientName', client.nev)
                navigate(`/tickets?${params.toString()}`)
              }}
              title="Ticketek megnyitása"
            >
              Ticketek: {ticketCount}
            </button>
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
            <button type="button" className="btn" onClick={goToEditPage}>
              Szerkesztés
            </button>
          </div>
          <ClientDetails client={client} onEdit={goToEditPage} fields={fieldDefinitions} />
        </section>
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
