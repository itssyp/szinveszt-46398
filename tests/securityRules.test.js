import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { getMetadata, ref, uploadBytes } from 'firebase/storage'

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST
const enabled = Boolean(firestoreHost && storageHost)

describe.runIf(enabled)('security rules', () => {
  let env
  let staff
  let other
  let guest

  beforeAll(async () => {
    const [firestoreIp, firestorePort] = firestoreHost.split(':')
    const [storageIp, storagePort] = storageHost.split(':')
    env = await initializeTestEnvironment({
      projectId: 'demo-szinveszt-security-pass1',
      firestore: {
        host: firestoreIp,
        port: Number(firestorePort),
        rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      },
      storage: {
        host: storageIp,
        port: Number(storagePort),
        rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'),
      },
    })
    staff = env.authenticatedContext('approved', { staff: true, email: 'staff@example.com' })
    other = env.authenticatedContext('other', { email: 'other@example.com' })
    guest = env.unauthenticatedContext()
  })

  afterAll(async () => {
    await env?.cleanup()
  })

  it('denies client data to guests and signed-in non-staff', async () => {
    const path = 'clients/rules-test-client'
    await assertSucceeds(setDoc(doc(staff.firestore(), path), { nev: 'Test' }))
    await assertFails(getDoc(doc(guest.firestore(), path)))
    await assertFails(getDoc(doc(other.firestore(), path)))
    await assertSucceeds(getDoc(doc(staff.firestore(), path)))
  })

  it('allows a staff user to edit only their own profile fields', async () => {
    const path = 'users/approved'
    await assertSucceeds(setDoc(doc(staff.firestore(), path), {
      uid: 'approved', email: 'staff@example.com', username: 'Staff',
    }))
    await assertSucceeds(updateDoc(doc(staff.firestore(), path), { username: 'Updated' }))
    await assertFails(updateDoc(doc(staff.firestore(), path), { staff: true }))
    await assertFails(setDoc(doc(other.firestore(), 'users/other'), {
      uid: 'other', email: 'other@example.com', username: 'Other',
    }))
  })

  it('limits ticket files to staff', async () => {
    const path = 'tickets/rules-test-ticket/file.txt'
    await assertSucceeds(uploadBytes(ref(staff.storage(), path), new Uint8Array([1, 2, 3])))
    await assertFails(getMetadata(ref(other.storage(), path)))
    await assertFails(getMetadata(ref(guest.storage(), path)))
    await assertSucceeds(getMetadata(ref(staff.storage(), path)))
  })
})
