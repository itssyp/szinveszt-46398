import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import {
  buildEmptyClient,
  defaultFieldDefinitions,
  defaultFieldGroups,
  defaultFieldKeys,
} from '../constants/clientFields'
import { db } from '../firebase'

const ClientSchemaContext = createContext(null)

const LABEL_ACCENTS = {
  torzs: 'Törzs',
  nev: 'Név',
  statusz: 'Státusz',
  nyelv: 'Nyelv',
  munkavegzesJellege: 'Munkavégzés jellege',
  adoszam: 'Adószám',
  adoazonosito: 'Adóazonosító',
  tajszam: 'TAJ-szám',
  kapuseged: 'Kapusegéd',
  viki: 'Viki',
  relax: 'Relax',
  foodora: 'Foodora',
  wolt: 'Wolt',
  egyebTevekenyseg: 'Egy?b tev?kenys?g',
  jogviszonyValtozas: 'Jogviszony valtozas',
  hozzarendeltSzemely: 'Hozzarendelt szemely',
  meghat: 'Meghatalmazás',
  kezdesDatuma: 'Kezdés dátuma',
  szuletesiIdo: 'Születési idő',
  szekhely: 'Székhely',
  adozasiForma: 'Adózási forma',
  afa: 'ÁFA',
  koltseghanyad: 'Költséghányad',
  ipa: 'IPA',
  email: 'E-mail cím',
  telefonszam: 'Telefonszám',
  cegSzamlazas: 'Cég - számlázás',
  utalandoGyakorisag: 'Utalando gyakorisag',
  szamlazas: 'Számlázás',
  tartozas: 'Tartozás',
  tartozasOsszeg2025: 'Tartozás havidíj 2025',
  kedvezmenyek: 'Kedvezmények',
  megszunesDatuma: 'Megszűnés dátuma',
  szunetKezdete: 'Szünet kezdete',
  lemondasDatuma: 'Lemondas datuma',
  jogviszonyvaltasDatuma: 'Jogviszonyvaltas datuma',
  navOnlineActive: 'NAV 2.0 adatkeresés aktív',
  navOnlineUser: 'NAV felhasználónév',
  navOnlinePassword: 'NAV jelszó',
  navOnlineSignerKey: 'NAV aláírási kulcs',
  navOnlineExchangeKey: 'NAV cserekulcs',
  navOnlineStartDate: 'NAV kezdő dátum',
}

const OPTION_ACCENTS = {
  statusz: {
    Aktiv: 'Aktív',
    Szunetel: 'Szünetel',
    Megszunt: 'Megszűnt',
  },
  meghat: {
    Elfogadva: 'Elfogadva',
    'Jovahagyasra var': 'Jóváhagyásra vár',
    Leveve: 'Levéve',
    Hianyzik: 'Hiányzik',
  },
  adozasiForma: {
    Atalanyado: 'Átalányadó',
    Egyeb: 'Egyéb',
  },
  afa: {
    'Alanyi adomentes': 'Alanyi adómentes',
    AFAS: 'ÁFÁS',
  },
  ipa: {
    Savos: 'Sávos',
    Altalanos: 'Általános',
    'Meg nem valasztott': 'Még nem választott',
    Hianyzik: 'Hiányzik',
  },
  szamlazas: {
    'Fel evi': 'Félévi',
    Eves: 'Éves',
    Egyeb: 'Egyéb',
  },
  tartozas: {
    Megszunes: 'Megszűnés',
    Szunet: 'Szünet',
    Egyeb: 'Egyéb',
  },
  tartozasOsszeg2025: {
    Januar: 'Január',
    Februar: 'Február',
    Marcius: 'Március',
    Aprilis: 'Április',
    Majus: 'Május',
    Junius: 'Június',
    Julius: 'Július',
    Oktober: 'Október',
    December: 'December',
  },
}

const GROUP_ACCENTS = {
  Altalanos: 'Általános',
  Adozas: 'Adózás',
  Datumok: 'Dátumok',
  Penzugy: 'Pénzügy',
  Egyeb: 'Egyéb',
  'NAV online szamla': 'NAV online számla',
}

const SCHEMA_DOC = doc(db, 'config', 'clientSchema')

const normalizeField = (field, fallback) => {
  const base = fallback || {}
  return {
    key: field.key || base.key,
    label: field.label || base.label || field.key,
    type: base.type || field.type || 'text',
    options: field.options || base.options || [],
    system: defaultFieldKeys.has(field.key),
  }
}

const ensureAllFieldsGrouped = (groups, fieldList) => {
  const assigned = new Set(groups.flatMap((g) => g.keys))
  const missingKeys = fieldList.map((f) => f.key).filter((key) => !assigned.has(key))
  if (!missingKeys.length) return groups
  const fallbackTitle = 'Egyéb'
  const existing = groups.find((g) => g.title === fallbackTitle)
  if (existing) {
    existing.keys.push(...missingKeys)
    return [...groups]
  }
  return [...groups, { title: fallbackTitle, keys: missingKeys }]
}

const applyAccents = (fields, groups) => {
  let changed = false
  const fixedFields = fields.map((f) => {
    const next = { ...f }
    if (LABEL_ACCENTS[f.key] && LABEL_ACCENTS[f.key] !== f.label) {
      next.label = LABEL_ACCENTS[f.key]
      changed = true
    }
    if (Array.isArray(f.options) && OPTION_ACCENTS[f.key]) {
      const mapping = OPTION_ACCENTS[f.key]
      const newOpts = f.options.map((opt) => mapping[opt] || opt)
      if (JSON.stringify(newOpts) !== JSON.stringify(f.options)) {
        next.options = newOpts
        changed = true
      }
    }
    return next
  })

  const fixedGroups = groups.map((g) => {
    const nextTitle = GROUP_ACCENTS[g.title] || g.title
    if (nextTitle !== g.title) {
      changed = true
    }
    return { ...g, title: nextTitle }
  })

  return { fields: fixedFields, groups: fixedGroups, changed }
}

const mergeSchema = (saved) => {
  const savedFields = Array.isArray(saved?.fields) ? saved.fields : []
  const savedFieldMap = savedFields.reduce((acc, f) => ({ ...acc, [f.key]: f }), {})

  const mergedFields = [
    ...defaultFieldDefinitions.map((base) => normalizeField(savedFieldMap[base.key] || base, base)),
    ...savedFields
      .filter((f) => !defaultFieldKeys.has(f.key))
      .map((f) => normalizeField(f, {})),
  ]

  const groups = Array.isArray(saved?.groups) && saved.groups.length ? saved.groups : defaultFieldGroups
  const cleanedGroups = groups.map((g) => ({
    title: g.title || 'Csoport',
    keys: Array.isArray(g.keys)
      ? g.keys.filter((key) => mergedFields.find((f) => f.key === key))
      : [],
  }))

  const finalGroups = ensureAllFieldsGrouped(cleanedGroups, mergedFields)

  const { fields: accentedFields, groups: accentedGroups, changed } = applyAccents(mergedFields, finalGroups)

  return {
    fields: accentedFields,
    groups: accentedGroups,
    emptyClient: buildEmptyClient(accentedFields),
    changed,
  }
}

export function ClientSchemaProvider({ children }) {
  const [fields, setFields] = useState(defaultFieldDefinitions)
  const [groups, setGroups] = useState(defaultFieldGroups)
  const [emptyClientTemplate, setEmptyClientTemplate] = useState(buildEmptyClient(defaultFieldDefinitions))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const accentMigrationRan = useRef(false)

  useEffect(() => {
    setLoading(true)
    const unsub = onSnapshot(
      SCHEMA_DOC,
      (snap) => {
        if (!snap.exists()) {
          setFields(defaultFieldDefinitions)
          setGroups(defaultFieldGroups)
          setEmptyClientTemplate(buildEmptyClient(defaultFieldDefinitions))
          setLoading(false)
          setError('')
          return
        }
        const merged = mergeSchema(snap.data())
        setFields(merged.fields)
        setGroups(merged.groups)
        setEmptyClientTemplate(merged.emptyClient)
        setError('')
        setLoading(false)
        if (merged.changed && !accentMigrationRan.current) {
          accentMigrationRan.current = true
          const payload = {
            fields: merged.fields.map((f) => ({
              key: f.key,
              label: f.label || f.key,
              type: f.system
                ? defaultFieldDefinitions.find((d) => d.key === f.key)?.type || f.type || 'text'
                : f.type || 'text',
              options: Array.isArray(f.options) ? f.options : [],
            })),
            groups: merged.groups.map((g) => ({
              title: g.title || 'Csoport',
              keys: Array.isArray(g.keys) ? g.keys : [],
            })),
            updatedAt: serverTimestamp(),
          }
          setDoc(SCHEMA_DOC, payload).catch(() => {
            // ignore background migration errors; UI still works with corrected labels
          })
        }
      },
      (err) => {
        setError(err.message || 'Nem sikerult betolteni a klienselemek sémáját')
        setLoading(false)
      }
    )

    return () => unsub()
  }, [])

  const saveSchema = async (nextFields, nextGroups) => {
    const mergedGroups = ensureAllFieldsGrouped([...nextGroups], nextFields)
    setSaving(true)
    setError('')
    try {
      const payload = {
        fields: nextFields.map((f) => ({
          key: f.key,
          label: f.label || f.key,
          type: f.system ? defaultFieldDefinitions.find((d) => d.key === f.key)?.type || f.type || 'text' : f.type || 'text',
          options: Array.isArray(f.options) ? f.options : [],
        })),
        groups: mergedGroups.map((g) => ({
          title: g.title || 'Csoport',
          keys: Array.isArray(g.keys) ? g.keys : [],
        })),
        updatedAt: serverTimestamp(),
      }
      await setDoc(SCHEMA_DOC, payload)
    } catch (err) {
      setError(err.message || 'Nem sikerult menteni a sémát')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const value = useMemo(
    () => ({
      fields,
      groups,
      defaultFieldKeys,
      emptyClientTemplate,
      loading,
      error,
      saving,
      saveSchema,
    }),
    [fields, groups, emptyClientTemplate, loading, error, saving]
  )

  return <ClientSchemaContext.Provider value={value}>{children}</ClientSchemaContext.Provider>
}

export const useClientSchema = () => {
  const ctx = useContext(ClientSchemaContext)
  if (!ctx) throw new Error('useClientSchema must be used within ClientSchemaProvider')
  return ctx
}
