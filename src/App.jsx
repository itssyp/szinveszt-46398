import React from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import './style.css'
import ClientsPage from './pages/ClientsPage'
import TicketsPage from './pages/TicketsPage'
import DebtsPage from './pages/DebtsPage'

const USERS = ['Szindi', 'Fanni', 'Szilveszter']

function App() {
  const [currentUser, setCurrentUser] = React.useState(USERS[0])

  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="app-bar">
          <div className="app-brand">SZINVESZT</div>
          <div className="nav-controls">
            <label className="user-select">
              <span>Belépve:</span>
              <select value={currentUser} onChange={(e) => setCurrentUser(e.target.value)}>
                {USERS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          </div>
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
        </nav>
        <Routes>
          <Route path="/" element={<ClientsPage currentUser={currentUser} />} />
          <Route path="/tickets" element={<TicketsPage currentUser={currentUser} />} />
          <Route path="/debts" element={<DebtsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
