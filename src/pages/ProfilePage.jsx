import React, { useEffect, useMemo, useState } from 'react'
import { TbPalette, TbUser, TbLogout } from 'react-icons/tb'
import { useAuth } from '../hooks/useAuth.jsx'
import { DEFAULT_THEME_COLOR, useUserProfile } from '../hooks/useUserProfile.jsx'

const COLOR_PRESETS = ['#0f9a8a', '#2563eb', '#f59e0b', '#ef4444', '#a855f7', '#10b981']

function ProfilePage() {
  const {
    profile,
    profileLoading,
    profileError,
    profileSaving,
    updateProfile,
    avatarLetter,
    primaryColor,
  } = useUserProfile()
  const { signOut } = useAuth()

  const [username, setUsername] = useState('')
  const [themeColor, setThemeColor] = useState(DEFAULT_THEME_COLOR)
  const [status, setStatus] = useState('')
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    if (profile) {
      setUsername(profile.username || '')
      setThemeColor(profile.themeColor || DEFAULT_THEME_COLOR)
    }
  }, [profile])

  useEffect(() => {
    setThemeColor((prev) => prev || primaryColor || DEFAULT_THEME_COLOR)
  }, [primaryColor])

  const displayEmail = profile?.email || ''
  const previewColor = themeColor || DEFAULT_THEME_COLOR

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!username.trim()) {
      setLocalError('Adj meg egy felhasznalonevet.')
      return
    }
    setLocalError('')
    setStatus('')
    try {
      await updateProfile({
        username: username.trim(),
        themeColor: previewColor,
      })
      setStatus('Profil frissítve.')
    } catch (err) {
      setLocalError(err?.message || 'Nem sikerült menteni a profilt.')
    }
  }

  const headerSubtitle = useMemo(() => {
    if (profileLoading) return 'Profil betöltése...'
    if (profileError) return 'Hiba történt a profil beolvasásakor.'
    return 'Bejelentkezési adatok és megjelenés.'
  }, [profileLoading, profileError])

  return (
    <main className="page-container slide-in-right">
      <header className="section-header">
        <div className="section-header__top section-header__top--centered">
          <div className="section-header__intro">
            <p className="eyebrow">Felhasználói profil</p>
            <h1 className="section-title">Profilbeállítások</h1>
            <p className="section-subtitle">{headerSubtitle}</p>
          </div>
        </div>
      </header>

      <section className="content-grid">
        <div className="panel profile-panel">
          <div className="profile-head">
            <div className="profile-head__info">
              <div className="profile-avatar" style={{ backgroundColor: previewColor }}>
                {avatarLetter}
              </div>
              <div>
                <p className="eyebrow">Felhasználó</p>
                <h3>{username || profile?.username || 'Felhasználó'}</h3>
                <p className="muted">{displayEmail}</p>
              </div>
            </div>
            <div className="profile-head__actions">
              <button className="btn ghost danger" type="button" onClick={signOut}>
                <TbLogout />
                Kijelentkezés
              </button>
            </div>
          </div>

          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="profile-grid">
              <label className="form-field">
                <span>Felhasználónév</span>
                <div className="input-with-icon">
                  <TbUser />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Add meg a megjelenő nevet"
                    autoComplete="name"
                  />
                </div>
              </label>
              <label className="form-field">
                <span>Téma szín</span>
                <div className="color-picker">
                  <div className="input-with-icon">
                    <TbPalette />
                    <input
                      type="color"
                      value={previewColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      aria-label="Téma szín"
                    />
                  </div>
                  <div className="color-swatches">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`color-swatch${color === previewColor ? ' active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setThemeColor(color)}
                        aria-label={`Szín: ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </label>
            </div>

            {profileError || localError ? (
              <div className="banner banner-error">
                Hiba: {localError || profileError}
              </div>
            ) : null}
            {status ? <div className="banner banner-success">{status}</div> : null}

            <div className="form-actions">
              <button className="btn" type="submit" disabled={profileSaving || profileLoading}>
                {profileSaving ? 'Mentés...' : 'Mentés'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}

export default ProfilePage
