import { getAliasForEmail } from '../constants/userAliases'

function addIdentity(target, value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized) target.add(normalized)
}

function addEmailIdentities(target, email) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) return

  addIdentity(target, normalizedEmail)

  const localPart = normalizedEmail.split('@')[0] || ''
  addIdentity(target, localPart)
  addIdentity(target, getAliasForEmail(normalizedEmail))
}

export function buildUserIdentitySet(user, profile) {
  const identities = new Set()

  addIdentity(identities, profile?.username)
  addIdentity(identities, user?.displayName)
  addIdentity(identities, profile?.email)
  addIdentity(identities, user?.email)

  addEmailIdentities(identities, profile?.email)
  addEmailIdentities(identities, user?.email)

  return identities
}
