import React, { useEffect, useState } from 'react'

function Login({ onSubmit, error, loading }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const root = document.getElementById('root')
    document.body.classList.add('login-page')
    document.documentElement.classList.add('login-page')
    root?.classList.add('login-page-root')
    return () => {
      document.body.classList.remove('login-page')
      document.documentElement.classList.remove('login-page')
      root?.classList.remove('login-page-root')
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!email || !password) return
    await onSubmit(email, password)
  }

  return (
    <div className="login-layout">
      <div className="login-brand">
        <div className="login-brand__content">
          <img src="/szinveszt-logo.png" alt="Szinveszt" className="login-brand__logo" />
          <div className="login-brand__text">
            <h1>SZINVESZT</h1>
            <p className="login-brand__subtitle">Adatvezérelt ügyfélkezelés, egyetlen biztonságos felületen.</p>
            <p className="login-brand__copy">
              Kövesd a státuszokat, rögzítsd az ügyeket és importáld az adatokat egy lépésben. Minden, mindenre, egyhelyen.
            </p>
          </div>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-card">
          <div className="login-card__header">
            <p className="eyebrow">Belépés</p>
            <h1 className="section-title">Bejelentkezés</h1>
            <p className="section-subtitle">
              Csak létező Firebase felhasználók léphetnek be. Nincs regisztráció.
            </p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
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
            <button className="btn login-submit" type="submit" disabled={loading}>
              {loading ? 'Bejelentkezés...' : 'Belépés'}
            </button>
            <p className="login-help">Segítségre van szükséged? Fordulj a rendszergazdához.</p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
