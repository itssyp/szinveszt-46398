import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth'
import { firebaseApp } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    const auth = getAuth(firebaseApp)
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)
    })
    return () => unsub()
  }, [])

  const signIn = async (email, password) => {
    const auth = getAuth(firebaseApp)
    setSigningIn(true)
    setAuthError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      const message = e?.message || 'Sikertelen bejelentkezés.'
      setAuthError(message)
      throw e
    } finally {
      setSigningIn(false)
    }
  }

  const signOut = async () => {
    const auth = getAuth(firebaseApp)
    await fbSignOut(auth)
  }

  const value = useMemo(
    () => ({ user, authReady, authError, signIn, signOut, signingIn }),
    [user, authReady, authError, signingIn]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
