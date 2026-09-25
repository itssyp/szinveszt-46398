function normalizeClientIpaValue(value) {
  return String(value ?? '').trim()
}

export function getClientIpaValue(client) {
  const directValue = normalizeClientIpaValue(client?.ipa)
  if (directValue) return directValue
  return normalizeClientIpaValue(client?.szja2025?.hipaValasztas)
}

export function buildClientIpaUpdateFields(value) {
  const ipa = normalizeClientIpaValue(value)
  return {
    ipa,
    'szja2025.hipaValasztas': ipa,
  }
}

export function buildClientIpaCreateFields(value, existingSzja = {}) {
  const ipa = normalizeClientIpaValue(value)
  return {
    ipa,
    szja2025: {
      ...(existingSzja || {}),
      hipaValasztas: ipa,
    },
  }
}
