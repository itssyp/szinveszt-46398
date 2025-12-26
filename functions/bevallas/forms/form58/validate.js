function validateClient(client) {
  const messages = []
  if (!client) {
    messages.push('Hiányzó ügyfél adat.')
    return { ok: false, messages }
  }
  if (!client.nev) messages.push('Hiányzó név.')
  if (!client.adoszam) {
    messages.push('Hiányzó adószám.')
  } else if (!/^[0-9]{8}/.test(client.adoszam)) {
    messages.push('Érvénytelen adószám formátum (8 számjegy).')
  }

  return { ok: messages.length === 0, messages }
}

module.exports = { validateClient }
