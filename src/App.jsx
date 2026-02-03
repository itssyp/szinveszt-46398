import React, { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
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
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import { UserProfileProvider, useUserProfile } from './hooks/useUserProfile.jsx'
import { ClientSchemaProvider } from './hooks/useClientSchema.jsx'
import Login from './components/Login'

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
  const [bevallasMenuOpen, setBevallasMenuOpen] = useState(false)
  const clientsSectionActive =
    location.pathname.startsWith('/clients') || location.pathname.startsWith('/client-schema')
  const bevallasSectionActive = location.pathname.startsWith('/bevallas')

  const displayName = useMemo(() => {
    if (profile?.username) return profile.username
    if (user?.displayName) return user.displayName
    if (user?.email) return user.email.split('@')[0]
    return 'Felhasználó'
  }, [user, profile])

  const waitingForProfile = Boolean(user) && profileLoading

  useEffect(() => {
    setClientMenuOpen(false)
    setBevallasMenuOpen(false)
  }, [location.pathname])

  if (!authReady || waitingForProfile) {
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
              Ügyfelek
            </button>
            <div className={`nav-dropdown__menu${clientMenuOpen ? ' is-open' : ''}`}>
              <NavLink
                to="/clients"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                Ügyfelek lista
              </NavLink>
              <NavLink
                to="/clients/new"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                Új ügyfél
              </NavLink>
              <NavLink
                to="/clients/import"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                Excel import
              </NavLink>
              <NavLink
                to="/clients/income-import"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                Bevételek import
              </NavLink>
              <NavLink
                to="/client-schema"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                Séma szerkesztő
              </NavLink>
              <NavLink
                to="/clients/export"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setClientMenuOpen(false)}
              >
                Excel export
              </NavLink>
            </div>
          </div>
          <div
            className={`nav-dropdown${bevallasSectionActive ? ' active' : ''}`}
            onMouseLeave={() => setBevallasMenuOpen(false)}
          >
            <button
              className={`nav-link nav-dropdown__toggle${bevallasSectionActive ? ' active' : ''}`}
              type="button"
              onClick={() => setBevallasMenuOpen((v) => !v)}
            >
              Bevallások
            </button>
            <div className={`nav-dropdown__menu${bevallasMenuOpen ? ' is-open' : ''}`}>
              <NavLink
                to="/bevallas/58"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                onClick={() => setBevallasMenuOpen(false)}
              >
                58
              </NavLink>
            </div>
          </div>
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
          <NavLink
            to="/profile"
            className={({ isActive }) => `user-select nav-user-link${isActive ? ' active' : ''}`}
          >
            <div className="user-avatar" style={{ backgroundColor: primaryColor }}>
              {avatarLetter}
            </div>
            <div className="user-labels">
              <span>Belépve:</span>
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
