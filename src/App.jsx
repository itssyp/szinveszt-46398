import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import './style.css'
import ClientsPage from './pages/ClientsPage'
import TicketsPage from './pages/TicketsPage'
import DebtsPage from './pages/DebtsPage'
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
          <div className="app-brand">SZINVESZT</div>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
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
          <Route path="/" element={<ClientsPage currentUser={displayName} />} />
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
