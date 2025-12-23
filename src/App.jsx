import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import './style.css'
import ClientsPage from './pages/ClientsPage'
import TicketsPage from './pages/TicketsPage'
import DebtsPage from './pages/DebtsPage'
import ClientDetailsPage from './pages/ClientDetailsPage'
import ClientEditPage from './pages/ClientEditPage'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Login from './components/Login'
import { getAliasForEmail } from './constants/userAliases'

function AppShell() {
  const { user, authReady, authError, signIn, signOut, signingIn } = useAuth()
  const [currentUser, setCurrentUser] = useState('')

  const displayName = useMemo(() => {
    if (user?.displayName) return user.displayName
    if (user?.email) return getAliasForEmail(user.email)
    return currentUser || 'Felhasználó'
  }, [user, currentUser])

  useEffect(() => {
    if (user) {
      const next = user.displayName || getAliasForEmail(user.email) || ''
      setCurrentUser(next)
    } else {
      setCurrentUser('')
    }
  }, [user])

  if (!authReady) {
    return (
      <div className="page-container">
        <div className="panel">
          <p className="eyebrow">Bejelentkezés</p>
          <h2>Kapcsolódás...</h2>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login onSubmit={signIn} loading={signingIn} error={authError} />
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="app-bar">
          <div className="app-brand">
            <img src="/szinveszt-logo.png" alt="Szinveszt" className="app-brand__logo" />
            <span>SZINVESZT</span>
          </div>
          <div className="nav-links">
            <NavLink to="/clients" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              Ügyfelek
            </NavLink>
            <NavLink
              to="/tickets"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Ticketek
            </NavLink>
            <NavLink
              to="/debts"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              Kintlévőségek
            </NavLink>
          </div>
          <div className="nav-controls">
            <div className="user-select">
              <span>Belépve:</span>
              <strong>{displayName}</strong>
            </div>
            <button className="btn ghost" type="button" onClick={signOut}>
              Kilépés
            </button>
          </div>
        </nav>
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<ClientsPage currentUser={displayName} />} />
          <Route path="/clients/tax/:taxNumber" element={<ClientDetailsPage />} />
          <Route path="/clients/id/:clientId" element={<ClientDetailsPage />} />
          <Route path="/clients/id/:clientId/edit" element={<ClientEditPage />} />
          <Route path="/tickets" element={<TicketsPage currentUser={displayName} />} />
          <Route path="/debts" element={<DebtsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
