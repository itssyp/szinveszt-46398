import { defaultFieldDefinitions } from './clientFields'

const baseNormalizer = (value) => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return String(value).trim()
  return String(value).trim()
}

const normalizeEmail = (value) => baseNormalizer(value).toLowerCase()
const normalizePhone = (value) => baseNormalizer(value).replace(/\s+/g, '').replace(/[^\d+]/g, '')
const excelSerialToIso = (serial) => {
  if (!Number.isFinite(serial) || serial <= 0) return ''
  const excelEpoch = Date.UTC(1899, 11, 30)
  const millis = excelEpoch + serial * 24 * 60 * 60 * 1000
  const date = new Date(millis)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
const normalizeDate = (value) => {
  if (!value) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') return excelSerialToIso(value)
  const str = baseNormalizer(value)
  if (!str) return ''
  if (/^\d+(\.\d+)?$/.test(str)) {
    const asNumber = Number(str)
    return excelSerialToIso(asNumber)
  }
  const d = new Date(str)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return ''
}

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value
  const text = baseNormalizer(value).toLowerCase()
  if (!text) return false
  return ['true', '1', 'yes', 'igen', 'y', 'aktív', 'aktiv'].includes(text)
}

const emailValidator = (value) => {
  if (!value) return null
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  return ok ? null : 'Érvénytelen e-mail'
}

const phoneValidator = (value) => {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits || digits === '0') return null
  if (digits.length < 7) return 'Tul rovid telefonszam'
  return null
}

const requiredValidator = (value) => {
  if (!value || (Array.isArray(value) && !value.length)) return 'Kötelező mező hiányzik'
  return null
}

const defaultSynonyms = {
  nev: ['name', 'client', 'customer', 'ugyfel', 'ügyfél', 'full name'],
  statusz: ['status', 'állapot', 'statusz'],
  nyelv: ['language', 'nyelv', 'lang'],
  torzs: ['törzs', 'torzs', 'group', 'segment'],
  munkavegzesJellege: ['munkavégzés jellege', 'munkavegzes jellege', 'work type'],
  adoszam: ['adoszam', 'adó szám', 'tax', 'tax number', 'vat', 'vat id'],
  adoazonosito: ['adoazonosito', 'adóazonosító', 'personal tax id', 'tax id'],
  tajszam: ['taj', 'tajszam', 'social security'],
  email: ['email', 'e-mail', 'mail', 'email address'],
  telefonszam: ['telefon', 'phone', 'mobile', 'cell', 'tel', 'phone number'],
  szekhely: ['székhely', 'address', 'cím', 'city', 'addr'],
  adozasiForma: ['adózási forma', 'tax type', 'adozasi forma'],
  ipa: ['ipa', 'helyi ado', 'local tax'],
  koltseghanyad: ['költséghányad', 'koltseghanyad', 'cost ratio'],
  kezdesDatuma: ['kezdes', 'start date', 'kezdes datuma'],
  szuletesiIdo: ['szuletesi ido', 'dob', 'birthdate', 'birth date'],
  megszunesDatuma: ['megszunes', 'end date', 'termination date'],
  szunetKezdete: ['szünet kezdete', 'pause start', 'pause'],
  tevekenyseg: ['tevékenység', 'tevekenyseg', 'activity', 'work type'],
  kedvezmenyek: ['kedvezmeny', 'discount', 'benefits'],
  cegSzamlazas: ['cég számlázás', 'ceg szamlazas', 'billing company'],
  szamlazas: ['szamlazas', 'billing', 'invoice period'],
  navOnlineActive: ['nav aktiv', 'nav active', 'nav 2.0', 'nav adat kerés'],
  navOnlineUser: ['nav felhasználó', 'nav user', 'nav username'],
  navOnlinePassword: ['nav jelszó', 'nav password'],
  navOnlineSignerKey: ['nav signer key', 'aláíró kulcs'],
  navOnlineExchangeKey: ['nav exchange key', 'csere kulcs'],
  navOnlineStartDate: ['nav start date', 'nav kezdete'],
}

const typeNormalizers = {
  boolean: normalizeBoolean,
  date: normalizeDate,
  multiselect: (value) => {
    if (Array.isArray(value)) return value
    const text = baseNormalizer(value)
    if (!text) return []
    return text
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  },
}

const typeValidators = {
  email: emailValidator,
  telefonszam: phoneValidator,
}

export const clientImportSchema = defaultFieldDefinitions.map((field) => {
  const normalizer = typeNormalizers[field.type] || baseNormalizer
  const validators = []
  if (field.key === 'nev') validators.push(requiredValidator)
  if (field.key === 'adoszam') validators.push(requiredValidator)
  if (field.key in typeValidators) validators.push(typeValidators[field.key])
  const synonyms = defaultSynonyms[field.key] || []

  return {
    key: field.key,
    label: field.label,
    required: field.key === 'nev' || field.key === 'adoszam',
    type: field.type || 'text',
    synonyms,
    normalizer,
    validators,
    example:
      field.key === 'email'
        ? 'pelda@example.com'
        : field.key === 'telefonszam'
          ? '+36301234567'
          : '',
  }
})

export const REQUIRED_FIELDS = clientImportSchema.filter((f) => f.required).map((f) => f.key)

