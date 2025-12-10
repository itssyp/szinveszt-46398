import React, { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../firebase'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  updateDoc,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore'
import ClientForm from '../components/ClientForm'
import StatusBadge from '../components/StatusBadge'
import BulkImport from '../components/BulkImport'
import Modal from '../components/Modal'
import ClientCards from '../components/ClientCards'
import ClientDetails from '../components/ClientDetails'
import { fieldDefinitions, emptyClient } from '../constants/clientFields'

function ClientsPage() {
  const [clients, setClients] = useState([])
  const [formData, setFormData] = useState(emptyClient)
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState({ message: 'Kapcsolodas...', ok: false })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [showFormModal, setShowFormModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const seededRef = useRef(false)
  const seedingInProgressRef = useRef(false)

  useEffect(() => {
    setStatus({ message: 'Kapcsolodas Firestore-hoz...', ok: false })
    const clientsQuery = query(collection(db, 'clients'), orderBy('nev', 'asc'))
    const unsubscribe = onSnapshot(
      clientsQuery,
      async (snapshot) => {
        const rows = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))

        setClients(rows)
        setStatus({ message: 'Kapcsolat aktiv · adatok betoltve.', ok: true })
        setError('')

        const requiredIds = ['57346717', '58397936', '57877923']
        const missing = requiredIds.filter(
          (id) => !rows.some((row) => String(row.torzs) === id || row.id === id)
        )

        if (!seededRef.current && missing.length && !seedingInProgressRef.current) {
          seededRef.current = true
          seedingInProgressRef.current = true
          try {
            await seedDefaults(true, missing)
          } catch (err) {
            setError(err.message || 'Seed hiba')
            seededRef.current = false
          } finally {
            seedingInProgressRef.current = false
          }
        }
      },
      (err) => {
        setError(err.message)
        setStatus({ message: 'Hiba a Firestore kapcsolatban.', ok: false })
      }
    )

    return () => unsubscribe()
  }, [])

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const resetForm = () => {
    setFormData(emptyClient)
    setEditingId(null)
    setShowFormModal(false)
  }

  const handleEdit = (client) => {
    setEditingId(client.id)
    setFormData(
      fieldDefinitions.reduce((acc, field) => {
        const current = client[field.key]
        if (field.type === 'boolean') {
          const normalized =
            typeof current === 'boolean'
              ? current
              : typeof current === 'string'
                ? ['true', '1', 'active', 'aktiv'].includes(current.toLowerCase())
                : false
          acc[field.key] = normalized
        } else if (field.type === 'multiselect') {
          if (Array.isArray(current)) {
            acc[field.key] = current
          } else if (typeof current === 'string') {
            acc[field.key] = current
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          } else {
            acc[field.key] = []
          }
        } else if (field.type === 'date') {
          if (current && typeof current === 'object' && current.toDate) {
            acc[field.key] = current.toDate().toISOString().slice(0, 10)
          } else if (current instanceof Date) {
            acc[field.key] = current.toISOString().slice(0, 10)
          } else if (typeof current === 'string') {
            acc[field.key] = current.slice(0, 10)
          } else {
            acc[field.key] = ''
          }
        } else {
          acc[field.key] = current ?? ''
        }
        return acc
      }, {})
    )
    setShowFormModal(true)
    setSelectedClient(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (editingId) {
        const ref = doc(db, 'clients', editingId)
        await updateDoc(ref, formData)
        setStatus({ message: 'Ugyfel frissitve.', ok: true })
      } else {
        await addDoc(collection(db, 'clients'), formData)
        setStatus({ message: 'Uj ugyfel rogzitve.', ok: true })
      }
      resetForm()
    } catch (err) {
      setError(err.message || 'Mentesi hiba')
      setStatus({ message: 'Mentes sikertelen.', ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleBulkImport = async (records) => {
    if (!records.length) return
    setImporting(true)
    setError('')
    setStatus({ message: 'Importalas folyamatban...', ok: false })

    try {
      const coll = collection(db, 'clients')
      const chunkSize = 450

      for (let i = 0; i < records.length; i += chunkSize) {
        const batch = writeBatch(db)
        const slice = records.slice(i, i + chunkSize)
        slice.forEach((record) => {
          const ref = doc(coll)
          batch.set(ref, record)
        })
        await batch.commit()
      }

      setStatus({ message: `Import sikeres · ${records.length} sor hozzaadva.`, ok: true })
    } catch (err) {
      setError(err.message || 'Import hiba')
      setStatus({ message: 'Import sikertelen.', ok: false })
      throw err
    } finally {
      setImporting(false)
    }
  }

  const summary = useMemo(() => {
    if (!clients.length) return 'Nincs rogzitett ugyfel.'
    return `${clients.length} ugyfel listazva.`
  }, [clients])

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return clients
    return clients.filter((client) => {
      const name = (client.nev || '').toLowerCase()
      const tax = (client.adoszam || '').toLowerCase()
      return name.includes(term) || tax.includes(term)
    })
  }, [clients, searchTerm])

  const seedDefaults = async (silent = false, limitToIds = null) => {
    const toIso = (text) => {
      if (!text) return ''
      const cleaned = text.replace(/\s+/g, '').replace(/\.$/, '')
      if (!cleaned.includes('.')) return cleaned
      const parts = cleaned.split('.').filter(Boolean)
      const [y, m, d] = parts
      if (y && m && d) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      return ''
    }

    const trimNum = (text) => (text ? text.replace(/\s+/g, '') : '')

    let dummy = [
      {
        torzs: '57346717',
        nev: 'Dala Milán',
        statusz: 'Aktív',
        nyelv: 'Magyar',
        munkavegzesJellege: '1341',
        adoszam: '57346717-1-40',
        adoazonosito: '8453472866',
        tajszam: 'hiányzik',
        kapuseged: true,
        viki: true,
        relax: true,
        meghat: 'Elfogadva',
        kezdesDatuma: toIso('2021.05.13.'),
        szuletesiIdo: '',
        szekhely: '8800 NAGYKANIZSA RÓZSA UTCA 14. D.lh. FS.em. 3.ajtó',
        adozasiForma: 'KATA',
        afa: 'Alanyi adómentes',
        koltseghanyad: '40',
        ipa: 'Sávos',
        email: 'mdala227@gmail.com',
        telefonszam: 'hiányzik',
        cegSzamlazas: 'SZINVESZT',
        szamlazas: 'Havi',
        tartozas: 'Egyéb',
        tartozasOsszeg2025: trimNum('8 890'),
        kedvezmenyek: 'nincs',
        megszunesDatuma: '',
        szunetKezdete: '',
      },
      {
        torzs: '58397936',
        nev: 'Juhász Indira Diána',
        statusz: 'Aktív',
        nyelv: 'Magyar',
        munkavegzesJellege: '1342',
        adoszam: '58397936-1-23',
        adoazonosito: '8474590248',
        tajszam: '111909315',
        kapuseged: true,
        viki: true,
        relax: true,
        meghat: 'Elfogadva',
        kezdesDatuma: toIso('2022.03.07.'),
        szuletesiIdo: toIso('1996.12.09'),
        szekhely: '6200 KISKŐRÖS SEGESVÁRI UTCA 57.',
        adozasiForma: 'Átalányadó',
        afa: 'Alanyi adómentes',
        koltseghanyad: '40',
        ipa: 'Még nem választott',
        email: 'juhaszindira@gmail.com',
        telefonszam: 'hiányzik',
        cegSzamlazas: 'SZINVESZT',
        szamlazas: 'Havi',
        tartozas: '1 havi',
        tartozasOsszeg2025: trimNum('15 500'),
        kedvezmenyek: 'nincs',
        megszunesDatuma: '',
        szunetKezdete: '',
      },
      {
        torzs: '57877923',
        nev: 'Gfrerer Miklós',
        statusz: 'Aktív',
        nyelv: 'Magyar',
        munkavegzesJellege: '1342',
        adoszam: '57877923-1-42',
        adoazonosito: '8379131177',
        tajszam: '105972082',
        kapuseged: true,
        viki: true,
        relax: true,
        meghat: 'Elfogadva',
        kezdesDatuma: toIso('2022.09.01.'),
        szuletesiIdo: toIso('1970.10.21'),
        szekhely: '1163 BUDAPEST KOLOZS KÖZ 3. 2.em. 6.ajtó',
        adozasiForma: 'Átalányadó',
        afa: 'Alanyi adómentes',
        koltseghanyad: '40',
        ipa: 'Sávos',
        email: '20g.miki@gmail.com',
        telefonszam: 'hiányzik',
        cegSzamlazas: 'SZINVESZT',
        szamlazas: 'Évi',
        tartozas: 'Egyéb',
        tartozasOsszeg2025: [],
        kedvezmenyek: 'nincs',
        megszunesDatuma: '',
        szunetKezdete: '',
      },
    ]

    if (Array.isArray(limitToIds) && limitToIds.length) {
      dummy = dummy.filter((item) => limitToIds.includes(String(item.torzs)))
    }

    if (!dummy.length) {
      if (!silent) setSeeding(false)
      return
    }
    if (!silent) setSeeding(true)
    setError('')
    if (!silent) setStatus({ message: 'Dummy ugyfelek hozzaadasa...', ok: false })
    try {
      const coll = collection(db, 'clients')
      const batch = writeBatch(db)
      dummy.forEach((record) => {
        const ref = doc(coll, record.torzs || undefined)
        batch.set(ref, record, { merge: true })
      })
      await batch.commit()
      setStatus({ message: `Dummy ugyfelek hozzaadva (${dummy.length}).`, ok: true })
    } catch (err) {
      setError(err.message || 'Nem sikerult a seed.')
      setStatus({ message: 'Seed sikertelen.', ok: false })
      if (!silent) throw err
    } finally {
      if (!silent) setSeeding(false)
    }
  }

  return (
    <main className="app">
      <header className="page-header">
        <div>
          <p className="eyebrow">Ugyfel torzsadatok</p>
          <h1>Firestore ugyfelkezelo</h1>
          <p className="subline">{summary}</p>
        </div>
        <div className="header-actions">
          <div className="search">
            <input
              type="search"
              placeholder="Kereses nev vagy adoszam alapjan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <BulkImport
            fields={fieldDefinitions}
            onImport={handleBulkImport}
            importing={importing}
            variant="inline"
          />
          <button type="button" onClick={() => setShowFormModal(true)}>
            Uj ugyfel
          </button>
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              try {
                await seedDefaults(false, null)
              } catch {
                // handled in seedDefaults
              }
            }}
            disabled={seeding}
          >
            {seeding ? 'Feltoltes...' : 'Dummy ugyfelek'}
          </button>
          <StatusBadge ok={status.ok} message={status.message} />
        </div>
      </header>

      {error ? <div className="banner error">Hiba: {error}</div> : null}

      <section className="layout">
        <ClientCards clients={filteredClients} onSelect={setSelectedClient} />
      </section>

      {showFormModal ? (
        <Modal onClose={resetForm} title={editingId ? 'Ugyfel szerkesztese' : 'Uj ugyfel'}>
          <ClientForm
            fields={fieldDefinitions}
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onReset={resetForm}
            editingId={editingId}
            saving={saving}
          />
        </Modal>
      ) : null}

      {selectedClient ? (
        <Modal onClose={() => setSelectedClient(null)} title={selectedClient.nev || 'Ugyfel reszletek'}>
          <ClientDetails
            client={selectedClient}
            onEdit={() => handleEdit(selectedClient)}
            fields={fieldDefinitions}
          />
        </Modal>
      ) : null}
    </main>
  )
}

export default ClientsPage
