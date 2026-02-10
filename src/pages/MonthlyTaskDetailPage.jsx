import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { useClientsCache } from '../hooks/useClientsCache'
import { formatAmount } from '../hooks/useDebtsData'
import { db } from '../firebase'

const MONTH_LABELS = [
  'Január',
  'Február',
  'Március',
  'Április',
  'Május',
  'Június',
  'Július',
  'Augusztus',
  'Szeptember',
  'Október',
  'November',
  'December',
]

function MonthlyTaskDetailPage() {
  const navigate = useNavigate()
  const { year, month } = useParams()
  const { clients, loading, error } = useClientsCache()
  const [updatingId, setUpdatingId] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [notifiedMap, setNotifiedMap] = useState({})
  const [nullasMap, setNullasMap] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [nullasFilter, setNullasFilter] = useState('')
  const monthIndex = Number(month) - 1
  const monthLabel = useMemo(() => MONTH_LABELS[monthIndex] || `Month ${month}`, [monthIndex, month])
  const normalizedMonth = String(month).padStart(2, '0')
  const notificationKey = `${year}-${normalizedMonth}`
  const [isClosed, setIsClosed] = useState(false)
  const isQuarterMonth = useMemo(() => new Set([3, 6, 9, 12]).has(Number(month)), [month])
  const isUtalandoMonth = normalizedMonth === '02'

  const utalandoClients = useMemo(() => {
    if (!isUtalandoMonth) return []
    return clients
      .filter((client) => {
        const raw = String(client.utalandoGyakorisag || '').toLowerCase()
        const debt = Number(client.billingoDebt || 0)
        return raw === 'havonta' && debt === 0
      })
      .sort((a, b) => (a.nev || '').localeCompare(b.nev || '', 'hu'))
  }, [clients, isUtalandoMonth])

  const assigneeOptions = useMemo(() => {
    const names = new Set()
    utalandoClients.forEach((client) => {
      if (client.hozzarendeltSzemely) names.add(client.hozzarendeltSzemely)
    })
    return Array.from(names)
  }, [utalandoClients])

  const filteredUtalandoClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return utalandoClients.filter((client) => {
      const name = (client.nev || '').toLowerCase()
      const assignee = (client.hozzarendeltSzemely || '').toLowerCase()
      const notified = Boolean(notifiedMap[client.id])
      const nullas = Boolean(nullasMap[client.id])
      const matchesName = !term || name.includes(term)
      const matchesAssignee = assigneeFilter ? assignee === assigneeFilter.toLowerCase() : true
      const matchesStatus =
        statusFilter === '' ? true : statusFilter === 'sent' ? notified : !notified
      const matchesNullas =
        nullasFilter === '' ? true : nullasFilter === 'yes' ? nullas : !nullas

      return matchesName && matchesAssignee && matchesStatus && matchesNullas
    })
  }, [
    utalandoClients,
    searchTerm,
    assigneeFilter,
    statusFilter,
    nullasFilter,
    notifiedMap,
    nullasMap,
  ])

  const utalandoProgress = useMemo(() => {
    const total = utalandoClients.length
    if (!total) return { total: 0, notified: 0, percent: 0 }
    const notified = utalandoClients.filter((client) => Boolean(notifiedMap[client.id])).length
    const percent = Math.round((notified / total) * 100)
    return { total, notified, percent }
  }, [utalandoClients, notifiedMap])

  useEffect(() => {
    const monthRef = doc(db, 'monthTasks', notificationKey)
    const unsubMonth = onSnapshot(monthRef, (snap) => {
      setIsClosed(Boolean(snap.data()?.closed))
    })
    const notifiedRef = collection(db, 'monthTasks', notificationKey, 'utalando')
    const unsubNotified = onSnapshot(notifiedRef, (snap) => {
      const next = {}
      const nextNullas = {}
      snap.forEach((docSnap) => {
        const data = docSnap.data()
        next[docSnap.id] = Boolean(data?.notified)
        nextNullas[docSnap.id] = Boolean(data?.nullas)
      })
      setNotifiedMap(next)
      setNullasMap(nextNullas)
    })
    return () => {
      unsubMonth()
      unsubNotified()
    }
  }, [notificationKey])

  const handleNotifyToggle = async (clientId, nextValue) => {
    setUpdateError('')
    setUpdatingId(clientId)
    try {
      await setDoc(
        doc(db, 'monthTasks', notificationKey, 'utalando', clientId),
        {
          notified: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } catch (err) {
      setUpdateError(err?.message || 'Nem sikerült menteni az értesítés állapotát.')
    } finally {
      setUpdatingId('')
    }
  }

  const handleNullasToggle = async (clientId, nextValue) => {
    setUpdateError('')
    setUpdatingId(clientId)
    try {
      await setDoc(
        doc(db, 'monthTasks', notificationKey, 'utalando', clientId),
        {
          nullas: nextValue,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )
    } catch (err) {
      setUpdateError(err?.message || 'Nem sikerült menteni a nullás állapotát.')
    } finally {
      setUpdatingId('')
    }
  }

  const handleCloseToggle = () => {
    const next = !isClosed
    setIsClosed(next)
    setDoc(
      doc(db, 'monthTasks', notificationKey),
      { closed: next, year: Number(year), month: Number(normalizedMonth), updatedAt: serverTimestamp() },
      { merge: true }
    ).catch((err) => {
      setUpdateError(err?.message || 'Nem sikerült menteni a hónap állapotát.')
      setIsClosed(!next)
    })
  }

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <button type="button" className="back-arrow" onClick={() => navigate(-1)}>
            {'<'}
          </button>
          <div className="section-header__intro">
            <p className="eyebrow">Feladatok</p>
            <h1 className="section-title">
              {monthLabel} {year}
            </h1>
            <p className="section-subtitle">Havi feladatok áttekintése és követése.</p>
          </div>
        </div>
      </header>

      {isUtalandoMonth ? (
        <section className="panel task-month-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Utalandók</p>
              <h2>Február</h2>
            </div>
            <div className="section-actions">
              <span className={`pill ${isClosed ? 'pill-active' : 'pill-quiet'}`}>
                {isClosed ? 'Hónap lezárva' : 'Nyitott hónap'}
              </span>
              <button type="button" className="btn ghost" onClick={handleCloseToggle}>
                {isClosed ? 'Megnyitás' : 'Hónap lezárása'}
              </button>
              <span className="pill">
                {filteredUtalandoClients.length}/{utalandoClients.length} ügyfél
              </span>
            </div>
          </div>
          {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
          {updateError ? <div className="banner banner-error">Hiba: {updateError}</div> : null}
          {loading ? <p className="muted">Adatok betöltése...</p> : null}
          {!loading && !utalandoClients.length ? (
            <p className="muted">Nincs értesítendő ügyfél ebben a hónapban.</p>
          ) : null}

          {!loading && utalandoClients.length ? (
            <div className="utalando-progress">
              <div className="utalando-progress__row">
                <span>
                  Kiküldve: {utalandoProgress.notified}/{utalandoProgress.total}
                </span>
                <span>{utalandoProgress.percent}%</span>
              </div>
              <div className="utalando-progress__bar">
                <div
                  className="utalando-progress__fill"
                  style={{ width: `${utalandoProgress.percent}%` }}
                />
              </div>
            </div>
          ) : null}

          {!loading && utalandoClients.length ? (
            <div className="filter-bar utalando-filters">
              <div className="input-shell search-field">
                <input
                  type="search"
                  placeholder="Keresés név alapján..."
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>
              <label className="filter-control">
                <span>Felelős</span>
                <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                  <option value="">Mind</option>
                  {assigneeOptions.map((name) => (
                    <option key={name} value={name.toLowerCase()}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-control">
                <span>Állapot</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">Mind</option>
                  <option value="sent">Kiküldve</option>
                  <option value="pending">Nincs kiküldve</option>
                </select>
              </label>
              <label className="filter-control">
                <span>Nullás</span>
                <select value={nullasFilter} onChange={(event) => setNullasFilter(event.target.value)}>
                  <option value="">Mind</option>
                  <option value="yes">Nullás</option>
                  <option value="no">Nem nullás</option>
                </select>
              </label>
            </div>
          ) : null}

          {!loading && utalandoClients.length && !filteredUtalandoClients.length ? (
            <p className="muted">Nincs találat a szűrésre.</p>
          ) : null}

          {!loading && utalandoClients.length ? (
            <div className="ticket-list utalando-list">
              {filteredUtalandoClients.map((client) => {
                const notified = Boolean(notifiedMap[client.id])
                const nullas = Boolean(nullasMap[client.id])
                const frequency = client.utalandoGyakorisag || 'Nincs megadva'
                return (
                  <div key={client.id} className="ticket-row debt-row utalando-row">
                    <div className="ticket-head">
                      <div className="ticket-client">{client.nev || 'Ismeretlen ügyfél'}</div>
                      <div className="ticket-status is-open">
                        {formatAmount(Number(client.billingoDebt || 0))}
                      </div>
                    </div>
                    <div className="ticket-meta">
                      {client.adoszam ? <span className="muted">Adószám: {client.adoszam}</span> : null}
                      {client.email ? <span className="muted">Email: {client.email}</span> : null}
                      {client.hozzarendeltSzemely ? (
                        <span className="muted">Felelős: {client.hozzarendeltSzemely}</span>
                      ) : null}
                      <span className="muted">Utalás gyakorisága: {frequency}</span>
                    </div>
                    <div className="utalando-actions">
                      <label className="switch utalando-switch">
                        <input
                          type="checkbox"
                          checked={notified}
                          onChange={(event) => handleNotifyToggle(client.id, event.target.checked)}
                          disabled={updatingId === client.id}
                        />
                        <span className="switch-slider" />
                      </label>
                      <span className={`pill ${notified ? 'pill-active' : 'pill-quiet'}`}>
                        {notified ? 'Kiküldve' : 'Nincs kiküldve'}
                      </span>
                      <label className="switch utalando-switch">
                        <input
                          type="checkbox"
                          checked={nullas}
                          onChange={(event) => handleNullasToggle(client.id, event.target.checked)}
                          disabled={updatingId === client.id}
                        />
                        <span className="switch-slider" />
                      </label>
                      <span className={`pill ${nullas ? 'pill-active' : 'pill-quiet'}`}>
                        {nullas ? 'Nullás' : 'Nem nullás'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

        </section>
      ) : (
        <section className="panel task-month-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Havi fókusz</p>
              <h2>{monthLabel} feladatai</h2>
            </div>
            <div className="section-actions">
              <span className={`pill ${isClosed ? 'pill-active' : 'pill-quiet'}`}>
                {isClosed ? 'Hónap lezárva' : 'Nyitott hónap'}
              </span>
              <button type="button" className="btn ghost" onClick={handleCloseToggle}>
                {isClosed ? 'Megnyitás' : 'Hónap lezárása'}
              </button>
              <span className="pill pill-quiet">0 feladat</span>
            </div>
          </div>
          <p className="muted">Még nincs feladat erre a hónapra.</p>
        </section>
      )}
    </main>
  )
}

export default MonthlyTaskDetailPage
