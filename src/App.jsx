import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { orderBy, query } from 'firebase/firestore'
import { TbBell, TbBellRinging, TbChecks, TbTrash } from 'react-icons/tb'
import './style.css'
import ClientsPage from './pages/ClientsPage'
import TicketsPage from './pages/TicketsPage'
import DebtsPage from './pages/DebtsPage'
import ClientDetailsPage from './pages/ClientDetailsPage'
import ClientEditPage from './pages/ClientEditPage'
import ProfilePage from './pages/ProfilePage.jsx'
import ClientSchemaPage from './pages/ClientSchemaPage.jsx'
import ClientImportPage from './pages/ClientImportPage.jsx'
import IncomeImportPage from './pages/IncomeImportPage.jsx'
import ClientCreatePage from './pages/ClientCreatePage.jsx'
import ClientExportPage from './pages/ClientExportPage.jsx'
import Bevallas58Page from './pages/Bevallas58Page.jsx'
import MonthlyTasksPage from './pages/MonthlyTasksPage.jsx'
import MonthlyTaskDetailPage from './pages/MonthlyTaskDetailPage.jsx'
import SzjaTasksPage from './pages/SzjaTasksPage.jsx'
import CalendarPage from './pages/CalendarPage.jsx'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { UserProfileProvider, useUserProfile } from './hooks/useUserProfile.jsx'
import { ClientSchemaProvider } from './hooks/useClientSchema.jsx'
import useCollectionSubscription from './hooks/useCollectionSubscription'
import { t } from './i18n'
import Login from './components/Login'

function getTimestampMs(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function getTodayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseStoredMap(value) {
  try {
    const parsed = JSON.parse(value || '{}')
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    return {}
  }
  return {}
}

function AppShell() {
  const { user, authReady, authError, signIn, signingIn } = useAuth()
  const {
    profile,
    profileLoading,
    profileError,
    avatarLetter,
    primaryColor,
    profiles,
  } = useUserProfile()
  const location = useLocation()
  const [clientMenuOpen, setClientMenuOpen] = useState(false)
  const [tasksMenuOpen, setTasksMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [seenNotificationKeys, setSeenNotificationKeys] = useState({})
  const [deletedNotificationKeys, setDeletedNotificationKeys] = useState({})
  const notificationsRef = useRef(null)
  const { data: tickets } = useCollectionSubscription('tickets', (coll) =>
    query(coll, orderBy('createdAt', 'desc'))
  )
  const clientsSectionActive =
    location.pathname.startsWith('/clients') || location.pathname.startsWith('/client-schema')
  const tasksSectionActive = location.pathname.startsWith('/tasks')
  const monthlyTasksActive =
    location.pathname === '/tasks' || /^\/tasks\/\d{4}\/\d{2}$/.test(location.pathname)
  const szjaTasksActive = location.pathname === '/tasks/szja'

  const displayName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return t('app.fallbackUser')
  }, [user, profile])

  const waitingForProfile = Boolean(user) && profileLoading
  const userIdentitySet = useMemo(() => {
    const identities = new Set()
    const add = (value) => {
      const normalized = String(value || '').trim().toLowerCase()
      if (normalized) identities.add(normalized)
    }
    add(profile?.username)
    add(profile?.email)
    add(user?.displayName)
    add(user?.email)
    if (user?.email) add(user.email.split('@')[0])
    add(displayName)
    return identities
  }, [displayName, profile, user])

  const allNotifications = useMemo(() => {
    const todayIso = getTodayIso()
    const items = []

    tickets.forEach((ticket) => {
      const assignedTo = String(ticket.assignedTo || '').trim().toLowerCase()
      if (!assignedTo || !userIdentitySet.has(assignedTo)) return

      const titleClient = ticket.clientName || t('tickets.unknownClient')
      const createdMs = getTimestampMs(ticket.createdAt)
      const updatedMs = getTimestampMs(ticket.updatedAt)
      const resolved = Boolean(ticket.resolved)

      if (!resolved && String(ticket.dueDate || '') === todayIso) {
        items.push({
          key: `due-${ticket.id}-${todayIso}`,
          createdMs: updatedMs || createdMs,
          type: 'due_today',
          title: t('notifications.dueTodayTitle'),
          text: t('notifications.dueTodayText', { client: titleClient }),
        })
      }

      if (createdMs > 0) {
        items.push({
          key: `new-${ticket.id}-${createdMs}`,
          createdMs,
          type: 'new_assigned',
          title: t('notifications.newAssignedTitle'),
          text: t('notifications.newAssignedText', { client: titleClient }),
        })
      }

      if (updatedMs > createdMs) {
        items.push({
          key: `upd-${ticket.id}-${updatedMs}`,
          createdMs: updatedMs,
          type: 'updated_assigned',
          title: t('notifications.updatedTitle'),
          text: t('notifications.updatedText', { client: titleClient }),
        })
      }
    })

    items.sort((a, b) => b.createdMs - a.createdMs)
    return items
  }, [tickets, userIdentitySet])

  const notifications = useMemo(
    () =>
      allNotifications
        .filter((item) => !deletedNotificationKeys[item.key])
        .map((item) => ({
          ...item,
          seen: Boolean(seenNotificationKeys[item.key]),
        })),
    [allNotifications, deletedNotificationKeys, seenNotificationKeys]
  )

  useEffect(() => {
    setClientMenuOpen(false)
    setTasksMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!user?.uid) return
    const seenStored = window.localStorage.getItem(`notifications.seen.${user.uid}`)
    const deletedStored = window.localStorage.getItem(`notifications.deleted.${user.uid}`)
    setSeenNotificationKeys(parseStoredMap(seenStored))
    setDeletedNotificationKeys(parseStoredMap(deletedStored))
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    window.localStorage.setItem(
      `notifications.seen.${user.uid}`,
      JSON.stringify(seenNotificationKeys)
    )
  }, [seenNotificationKeys, user?.uid])

  useEffect(() => {
    if (!user?.uid) return
    window.localStorage.setItem(
      `notifications.deleted.${user.uid}`,
      JSON.stringify(deletedNotificationKeys)
    )
  }, [deletedNotificationKeys, user?.uid])

  useEffect(() => {
    if (!allNotifications.length) return
    const validKeys = new Set(allNotifications.map((item) => item.key))
    setSeenNotificationKeys((prev) => {
      const next = {}
      Object.keys(prev).forEach((key) => {
        if (validKeys.has(key) && prev[key]) next[key] = true
      })
      return next
    })
    setDeletedNotificationKeys((prev) => {
      const next = {}
      Object.keys(prev).forEach((key) => {
        if (validKeys.has(key) && prev[key]) next[key] = true
      })
      return next
    })
  }, [allNotifications])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!notificationsRef.current?.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markNotificationsSeen = (keys = notifications.map((item) => item.key)) => {
    if (!keys.length) return
    setSeenNotificationKeys((prev) => {
      const next = { ...prev }
      keys.forEach((key) => {
        next[key] = true
      })
      return next
    })
  }

  const dismissNotification = (key) => {
    setDeletedNotificationKeys((prev) => ({ ...prev, [key]: true }))
  }

  const unreadCount = notifications.filter((item) => !item.seen).length

  if (!authReady || waitingForProfile) {
    return (
      <div className="page-container">
        <div className="panel">
          <p className="eyebrow">{t('app.auth.eyebrow')}</p>
          <h2>{t('app.auth.connecting')}</h2>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login onSubmit={signIn} loading={signingIn} error={authError} />
  }

  return (
    <div className="app-shell">
      <nav className="app-bar">
        <div className="app-brand">
          <img src="/szinveszt-logo.png" alt="Szinveszt" className="app-brand__logo" />
          <span>SZINVESZT</span>
        </div>
        <div className="nav-links">
          <div
            className={`nav-dropdown${clientsSectionActive ? ' active' : ''}`}
            onMouseLeave={() => setClientMenuOpen(false)}
          >
            <button
              className={`nav-link nav-dropdown__toggle${clientsSectionActive ? ' active' : ''}`}
              type="button"
              onClick={() => setClientMenuOpen((v) => !v)}
            >
              {t('app.nav.clients')}
            </button>
            <div className={`nav-dropdown__menu${clientMenuOpen ? ' is-open' : ''}`}>
              <NavLink
                to="/clients"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                {t('app.nav.clientsList')}
              </NavLink>
              <NavLink
                to="/clients/new"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                {t('app.nav.newClient')}
              </NavLink>
              <NavLink
                to="/clients/import"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                {t('app.nav.excelImport')}
              </NavLink>
              <NavLink
                to="/clients/income-import"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                {t('app.nav.incomesImport')}
              </NavLink>
              <NavLink
                to="/client-schema"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                {t('app.nav.schemaEditor')}
              </NavLink>
              <NavLink
                to="/clients/export"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                {t('app.nav.excelExport')}
              </NavLink>
            </div>
          </div>
          {/* Bevallások tab temporarily hidden */}
          <NavLink
            to="/tickets"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {t('app.nav.tickets')}
          </NavLink>
          <div
            className={`nav-dropdown${tasksSectionActive ? ' active' : ''}`}
            onMouseLeave={() => setTasksMenuOpen(false)}
          >
            <button
              className={`nav-link nav-dropdown__toggle${tasksSectionActive ? ' active' : ''}`}
              type="button"
              onClick={() => setTasksMenuOpen((v) => !v)}
            >
              {t('app.nav.tasks')}
            </button>
            <div className={`nav-dropdown__menu${tasksMenuOpen ? ' is-open' : ''}`}>
              <NavLink
                to="/tasks"
                className={() => `nav-link${monthlyTasksActive ? ' active' : ''}`}
                onClick={() => setTasksMenuOpen(false)}
              >
                {t('app.nav.tasksMonthly')}
              </NavLink>
              <NavLink
                to="/tasks/szja"
                className={() => `nav-link${szjaTasksActive ? ' active' : ''}`}
                onClick={() => setTasksMenuOpen(false)}
              >
                {t('app.nav.tasksSzja')}
              </NavLink>
            </div>
          </div>
          <NavLink
            to="/calendar"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {t('app.nav.calendar')}
          </NavLink>
          <NavLink
            to="/debts"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {t('app.nav.debts')}
          </NavLink>
        </div>
        <div className="nav-controls">
          <div className="nav-notifications" ref={notificationsRef}>
            <button
              type="button"
              className={`nav-bell${notificationsOpen ? ' is-open' : ''}`}
              onClick={() => {
                const next = !notificationsOpen
                setNotificationsOpen(next)
                if (next) markNotificationsSeen()
              }}
              aria-label={t('notifications.title')}
            >
              {unreadCount > 0 ? <TbBellRinging /> : <TbBell />}
              {unreadCount > 0 ? <span className="nav-bell__count">{unreadCount}</span> : null}
            </button>
            <div className={`nav-notifications__menu${notificationsOpen ? ' is-open' : ''}`}>
              <div className="nav-notifications__head">
                <strong>{t('notifications.title')}</strong>
                <button type="button" className="btn ghost" onClick={markNotificationsSeen}>
                  <TbChecks />
                  {t('notifications.markAllRead')}
                </button>
              </div>
              {notifications.length ? (
                <div className="nav-notifications__list">
                  {notifications.slice(0, 12).map((item) => (
                    <div
                      key={item.key}
                      className={`nav-notification-item${item.seen ? ' is-seen' : ''}`}
                    >
                      <NavLink
                        to="/tickets"
                        className="nav-notification-item__link"
                        onClick={() => {
                          markNotificationsSeen([item.key])
                          setNotificationsOpen(false)
                        }}
                      >
                        <strong>{item.title}</strong>
                        <span>{item.text}</span>
                      </NavLink>
                      <button
                        type="button"
                        className="nav-notification-item__delete"
                        title={t('notifications.delete')}
                        aria-label={t('notifications.delete')}
                        onClick={() => dismissNotification(item.key)}
                      >
                        <TbTrash />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted nav-notifications__empty">{t('notifications.empty')}</p>
              )}
            </div>
          </div>
          <NavLink
            to="/profile"
            className={({ isActive }) => `user-select nav-user-link${isActive ? ' active' : ''}`}
          >
            <div className="user-avatar" style={{ backgroundColor: primaryColor }}>
              {avatarLetter}
            </div>
            <div className="user-labels">
              <span>{t('app.nav.loggedIn')}</span>
              <strong>{displayName}</strong>
            </div>
          </NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Navigate to="/clients" replace />} />
        <Route
          path="/clients"
          element={<ClientsPage currentUser={displayName} userProfiles={profiles || []} />}
        />
        <Route path="/clients/new" element={<ClientCreatePage />} />
        <Route path="/clients/import" element={<ClientImportPage />} />
        <Route path="/clients/export" element={<ClientExportPage />} />
        <Route path="/clients/income-import" element={<IncomeImportPage />} />
        <Route path="/clients/tax/:taxNumber" element={<ClientDetailsPage />} />
        <Route path="/clients/id/:clientId" element={<ClientDetailsPage />} />
        <Route path="/clients/id/:clientId/edit" element={<ClientEditPage />} />
        <Route path="/bevallas/58" element={<Bevallas58Page />} />
        <Route path="/tasks" element={<MonthlyTasksPage />} />
        <Route path="/tasks/szja" element={<SzjaTasksPage />} />
        <Route path="/tasks/:year/:month" element={<MonthlyTaskDetailPage />} />
        <Route path="/calendar" element={<CalendarPage currentUser={displayName} userProfiles={profiles || []} />} />
        <Route
          path="/tickets"
          element={<TicketsPage currentUser={displayName} userProfiles={profiles || []} />}
        />
        <Route path="/debts" element={<DebtsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/client-schema" element={<ClientSchemaPage />} />
      </Routes>
      {profileError ? <div className="banner banner-error top-banner">Hiba: {profileError}</div> : null}
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <UserProfileProvider>
        <ClientSchemaProvider>
          <BrowserRouter>
            <AppShell />
          </BrowserRouter>
        </ClientSchemaProvider>
      </UserProfileProvider>
    </AuthProvider>
  )
}

export default App
