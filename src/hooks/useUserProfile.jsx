import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from './useAuth.jsx'

export const DEFAULT_THEME_COLOR = '#0f9a8a'

const UserProfileContext = createContext(null)

const buildDefaultProfile = (user) => {
  const email = user?.email || ''
  const username =
    user?.displayName || (email ? email.split('@')[0] : 'Felhasznalo')

  return {
    uid: user?.uid || '',
    email,
    username,
    themeColor: DEFAULT_THEME_COLOR,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function UserProfileProvider({ children }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [directory, setDirectory] = useState([])
  const [directoryError, setDirectoryError] = useState('')
  const [directoryLoading, setDirectoryLoading] = useState(false)

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setProfileLoading(false)
      return undefined
    }

    setProfileLoading(true)
    setProfileError('')
    const ref = doc(db, 'users', user.uid)
    let unsub = () => {}

    const ensureProfile = async () => {
      try {
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          await setDoc(ref, buildDefaultProfile(user))
        }
        unsub = onSnapshot(
          ref,
          (next) => {
            setProfile({ id: next.id, ...next.data() })
            setProfileLoading(false)
          },
          (err) => {
            setProfileError(err.message || 'Nem sikerult betolteni a profilt')
            setProfileLoading(false)
          }
        )
      } catch (err) {
        setProfileError(err.message || 'Nem sikerult betolteni a profilt')
        setProfileLoading(false)
      }
    }

    ensureProfile()
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!user) {
      setDirectory([])
      setDirectoryError('')
      setDirectoryLoading(false)
      return undefined
    }

    setDirectoryLoading(true)
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setDirectory(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        )
        setDirectoryError('')
        setDirectoryLoading(false)
      },
      (err) => {
        setDirectoryError(err.message || 'Nem sikerult beolvasni a felhasznalokat')
        setDirectoryLoading(false)
      }
    )

    return () => unsub()
  }, [user])

  const updateProfile = async (updates) => {
    if (!user) throw new Error('Nincs bejelentkezett felhasznalo')

    const payload = { ...updates }
    if (typeof payload.themeColor === 'string') {
      payload.themeColor = payload.themeColor.trim()
    }
    setProfileSaving(true)
    setProfileError('')

    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { ...payload, updatedAt: serverTimestamp() },
        { merge: true }
      )
    } catch (err) {
      const message = err?.message || 'Nem sikerult menteni a profilt'
      setProfileError(message)
      throw err
    } finally {
      setProfileSaving(false)
    }
  }

  const directoryMap = useMemo(() => {
    const map = {}
    directory.forEach((entry) => {
      const key = (entry.username || entry.email || '').trim().toLowerCase()
      if (key) map[key] = entry
    })
    return map
  }, [directory])

  const avatarLetter = useMemo(() => {
    const source = profile?.username || profile?.email || ''
    return source ? source.trim().charAt(0).toUpperCase() : '?'
  }, [profile])

  const primaryColor = profile?.themeColor || DEFAULT_THEME_COLOR

  const value = useMemo(
    () => ({
      profile,
      profileError,
      profileLoading,
      profileSaving,
      updateProfile,
      profiles: directory,
      profilesByName: directoryMap,
      profilesError: directoryError,
      profilesLoading: directoryLoading,
      avatarLetter,
      primaryColor,
    }),
    [
      profile,
      profileError,
      profileLoading,
      profileSaving,
      updateProfile,
      directory,
      directoryMap,
      directoryError,
      directoryLoading,
      avatarLetter,
      primaryColor,
    ]
  )

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

export const useUserProfile = () => {
  const ctx = useContext(UserProfileContext)
  if (!ctx) throw new Error('useUserProfile must be used within a UserProfileProvider')
  return ctx
}
