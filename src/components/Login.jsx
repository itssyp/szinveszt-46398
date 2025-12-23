import React, { useState } from 'react'

function Login({ onSubmit, error, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!email || !password) return
    await onSubmit(email, password)
  }

  return (
    <div className="page-container" style={{ maxWidth: 480 }}>
      <div className="panel" style={{ gap: 14, display: 'flex', flexDirection: 'column' }}>
        <div>
          <p className="eyebrow">Belépés</p>
          <h1 className="section-title">Bejelentkezés</h1>
          <p className="section-subtitle">Csak létező Firebase felhasználók léphetnek be. Nincs regisztráció.</p>
        </div>
        <form className="form-shell" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="form-field">
            <span>Jelszó</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <div className="banner banner-error">Hiba: {error}</div> : null}
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Bejelentkezés...' : 'Belépés'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
