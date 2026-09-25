import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { TbArrowLeft } from 'react-icons/tb'
import { collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import ClientDetails from '../components/ClientDetails'
import { useClientsCache } from '../hooks/useClientsCache'
import { useClientActivities } from '../hooks/useClientActivities'
import TicketCreateModal from '../components/TicketCreateModal'
import { db } from '../firebase'
import { createTicket } from '../services/tickets'
import { logClientActivity } from '../utils/clientActivity'
import { useAuth } from '../hooks/useAuth.jsx'
import { useUserProfile } from '../hooks/useUserProfile.jsx'
import { normalizeTaxId } from '../utils/id'
import { useClientSchema } from '../hooks/useClientSchema.jsx'
import { useEvStatusSegments, useEvActivityPeriods } from '../hooks/useEvData'
import { t } from '../i18n'

const NAV_KEYS = [
  'navOnlineActive',
  'navOnlineUser',
  'navOnlinePassword',
  'navOnlineSignerKey',
  'navOnlineExchangeKey',
  'navOnlineStartDate',
]

function ClientDetailsPage() {
  const { taxNumber, clientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { clients, loading: clientsLoading, error: clientsError } = useClientsCache()
  const { fields, groups, loading: schemaLoading, error: schemaError } = useClientSchema()
  const [client, setClient] = useState(null)
  const [docId, setDocId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ticketClient, setTicketClient] = useState(null)
  const [ticketDescription, setTicketDescription] = useState('')
  const [ticketAssignee, setTicketAssignee] = useState('')
  const [ticketPriority, setTicketPriority] = useState('medium')
  const [ticketDueDate, setTicketDueDate] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)
  const [ticketError, setTicketError] = useState('')
  const [ticketCount, setTicketCount] = useState(0)
  const { activities, loading: activitiesLoading } = useClientActivities(docId)
  const { user } = useAuth()
  const { profile, profiles } = useUserProfile()
  const {
    segments: evStatusSegments,
    loading: evStatusLoading,
    error: evStatusError,
  } = useEvStatusSegments(docId)
  const {
    periods: evActivityPeriods,
    loading: evActivityLoading,
    error: evActivityError,
  } = useEvActivityPeriods(docId)

  const actorName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return 'Ismeretlen'
  }, [user, profile])

  useEffect(() => {
    if (clientsError || schemaError) {
      setError(clientsError || schemaError)
      setLoading(false)
      return
    }
    if (!clientsLoading && !schemaLoading) {
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
  }, [clients, clientsLoading, clientsError, schemaLoading, schemaError, taxNumber, clientId])

  useEffect(() => {
    if (!docId) return undefined
    const q = query(collection(db, 'tickets'), where('clientId', '==', docId))
    const unsub = onSnapshot(
      q,
      (snap) => setTicketCount(snap.size),
      () => setTicketCount(0)
    )
    return () => unsub()
  }, [docId])

  const title = useMemo(() => client?.nev || 'Ügyfél', [client])
  const assigneeOptions = useMemo(() => {
    const names = (profiles || [])
      .map((p) => (p.username || p.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [profiles])

  const generalGroups = useMemo(
    () =>
      (groups || [])
        .map((g) => ({
          ...g,
          keys: (g.keys || []).filter((key) => !NAV_KEYS.includes(key)),
        }))
        .filter((g) => g.keys.length > 0),
    [groups]
  )

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
    setTicketPriority('medium')
    setTicketDueDate('')
    setTicketDescription('')
    setTicketError('')
  }

  const handleCreateTicket = async (attachments = []) => {
    if (!docId || !ticketClient) return
    if (!ticketDescription.trim() || !ticketAssignee) {
      setTicketError(t('tickets.create.requiredError'))
      return
    }
    try {
      setTicketSaving(true)
      setTicketError('')
      const ref = await createTicket({
        clientId: docId,
        clientName: ticketClient.nev || 'Ismeretlen ügyfél',
        description: ticketDescription.trim(),
        status: 'Nyitott',
        createdBy: actorName || 'Ismeretlen',
        assignedTo: ticketAssignee,
        priority: ticketPriority || 'medium',
        dueDate: ticketDueDate || '',
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actorName || 'Ismeretlen',
        comments: [],
      }, attachments)
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
      setTicketPriority('medium')
      setTicketDueDate('')
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

  const handleBack = () => {
    const returnTo = location.state?.returnTo
    if (typeof returnTo === 'string' && returnTo.trim()) {
      navigate(returnTo)
      return
    }
    navigate('/clients')
  }

  return (
    <main className="page-container slide-in-right">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <button
            type="button"
            className="back-arrow"
            aria-label="Vissza"
            onClick={handleBack}
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
      {loading || schemaLoading ? <div className="banner">Betöltés...</div> : null}
      {evStatusError ? <div className="banner banner-error">EV státusz hiba: {evStatusError}</div> : null}
      {evActivityError ? <div className="banner banner-error">Szüneteltetés hiba: {evActivityError}</div> : null}

      {!loading && client ? (
        <section className="panel">
          <ClientDetails
            client={client}
            actorName={actorName}
            onEdit={goToEditPage}
            onCreateTicket={handleCreateTicketClick}
            onViewTickets={handleViewTickets}
            ticketCount={ticketCount}
            fields={fields}
            groups={generalGroups}
            navKeys={NAV_KEYS}
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
            activitiesLoading={activitiesLoading}
            evStatusSegments={evStatusSegments}
            evStatusLoading={evStatusLoading}
            evActivityPeriods={evActivityPeriods}
            evActivityLoading={evActivityLoading}
            clientId={docId}
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
          priority={ticketPriority}
          onChangePriority={setTicketPriority}
          dueDate={ticketDueDate}
          onChangeDueDate={setTicketDueDate}
          currentUser={actorName}
          assigneeOptions={assigneeOptions}
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
