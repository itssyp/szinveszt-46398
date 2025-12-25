import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TbArrowLeft } from 'react-icons/tb'
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import ClientDetails from '../components/ClientDetails'
import { fieldDefinitions } from '../constants/clientFields'
import { useClientsCache } from '../hooks/useClientsCache'
import { useClientActivities } from '../hooks/useClientActivities'
import TicketCreateModal from '../components/TicketCreateModal'
import { db } from '../firebase'
import { logClientActivity } from '../utils/clientActivity'
import { useAuth } from '../hooks/useAuth.jsx'
import { getAliasForEmail } from '../constants/userAliases'
import { normalizeTaxId } from '../utils/id'

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
  const { activities, loading: activitiesLoading } = useClientActivities(docId)
  const { user } = useAuth()

  const actorName = useMemo(() => {
    if (user?.displayName) return user.displayName
    if (user?.email) return getAliasForEmail(user.email)
    return 'Ismeretlen'
  }, [user])

  useEffect(() => {
    if (clientsError) {
      setError(clientsError)
      setLoading(false)
      return
    }
    if (!clientsLoading) {
      let match = null
      if (taxNumber) {
        match = clients.find((c) => normalizeTaxId(c.adoszam) === taxNumber) || null
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

  const handleViewTickets = () => {
    if (!docId) return
    const params = new URLSearchParams()
    params.set('clientId', docId)
    if (client?.nev) params.set('clientName', client.nev)
    navigate(`/tickets?${params.toString()}`)
  }

  const handleCreateTicketClick = () => {
    if (!client) return
    setTicketClient(client)
    setTicketAssignee(actorName || '')
    setTicketDescription('')
    setTicketError('')
  }

  const handleCreateTicket = async () => {
    if (!docId || !ticketClient) return
    if (!ticketDescription.trim() || !ticketAssignee) {
      setTicketError('Add meg a leírást és a felelőst.')
      return
    }
    try {
      setTicketSaving(true)
      setTicketError('')
      const ref = await addDoc(collection(db, 'tickets'), {
        clientId: docId,
        clientName: ticketClient.nev || 'Ismeretlen ügyfél',
        description: ticketDescription.trim(),
        status: 'Nyitott',
        createdBy: actorName || 'Ismeretlen',
        assignedTo: ticketAssignee,
        resolved: false,
        createdAt: serverTimestamp(),
        comments: [],
      })
      await logClientActivity({
        clientId: docId,
        type: 'ticket_created',
        message: `Ticket: ${ticketDescription.trim().slice(0, 80)}`,
        meta: { ticketId: ref.id, assignedTo: ticketAssignee },
        actor: actorName || 'Ismeretlen',
      })
      setTicketClient(null)
      setTicketDescription('')
      setTicketAssignee(actorName || '')
    } catch (err) {
      setTicketError(err.message || 'Ticket létrehozása sikertelen')
    } finally {
      setTicketSaving(false)
    }
  }

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
          <ClientDetails
            client={client}
            onEdit={goToEditPage}
            onCreateTicket={handleCreateTicketClick}
            onViewTickets={handleViewTickets}
            ticketCount={ticketCount}
            fields={fieldDefinitions}
            onNavTestLog={async (payload) => {
              if (!docId) return
              await logClientActivity({
                clientId: docId,
                type: 'nav_test',
                message: payload.message,
                meta: payload.meta || {},
                actor: actorName,
              })
            }}
            activities={activities}
            activitiesLoading={false}
          />
        </section>
      ) : null}

      {ticketClient ? (
        <TicketCreateModal
          client={ticketClient}
          description={ticketDescription}
          onChangeDescription={setTicketDescription}
          assignedTo={ticketAssignee}
          onChangeAssignedTo={setTicketAssignee}
          currentUser={actorName}
          saving={ticketSaving}
          error={ticketError}
          onCancel={() => setTicketClient(null)}
          onSubmit={handleCreateTicket}
        />
      ) : null}
    </main>
  )
}

export default ClientDetailsPage
