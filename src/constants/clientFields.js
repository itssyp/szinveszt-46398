export const fieldDefinitions = [
  { key: 'torzs', label: 'Törzs' },
  { key: 'nev', label: 'Név' },
  {
    key: 'statusz',
    label: 'Státusz',
    type: 'select',
    options: ['Aktív', 'Szünetel', 'Megszűnt'],
  },
  { key: 'nyelv', label: 'Nyelv' },
  {
    key: 'munkavegzesJellege',
    label: 'Munkavégzés jellege',
    type: 'select',
    options: ['1341', '1342', '1343'],
  },
  { key: 'adoszam', label: 'Adószám' },
  { key: 'adoazonosito', label: 'Adóazonosító' },
  { key: 'tajszam', label: 'TAJszám' },
  { key: 'kapuseged', label: 'Kapusegéd', type: 'boolean' },
  { key: 'viki', label: 'Viki', type: 'boolean' },
  { key: 'relax', label: 'Relax', type: 'boolean' },
  {
    key: 'meghat',
    label: 'Meghatalmazás',
    type: 'select',
    options: ['Elfogadva', 'Jóváhagyásra vár', 'Levéve', 'Hiányzik'],
  },
  { key: 'kezdesDatuma', label: 'Kezdés dátuma', type: 'date' },
  { key: 'szuletesiIdo', label: 'Születési idő', type: 'date' },
  { key: 'szekhely', label: 'Székhely' },
  {
    key: 'adozasiForma',
    label: 'Adózási forma',
    type: 'select',
    options: ['KATA', 'Átalányadó', 'VSZJA', 'Egyéb'],
  },
  {
    key: 'afa',
    label: 'ÁFA',
    type: 'select',
    options: ['Alanyi adómentes', 'ÁFÁS'],
  },
  {
    key: 'koltseghanyad',
    label: 'Költséghányad',
    type: 'select',
    options: ['40', '80', '90'],
  },
  {
    key: 'ipa',
    label: 'IPA',
    type: 'select',
    options: ['Sávos', 'Általános', 'Még nem választott', 'Hiányzik'],
  },
  { key: 'email', label: 'E-mail cím' },
  { key: 'telefonszam', label: 'Telefonszám' },
  {
    key: 'cegSzamlazas',
    label: 'Cég - számlázás',
    type: 'select',
    options: ['SZINVESZT', 'MAMA'],
  },
  {
    key: 'szamlazas',
    label: 'Számlázás',
    type: 'select',
    options: ['Havi', 'Félévi', 'Éves', 'Egyéb'],
  },
  {
    key: 'tartozas',
    label: 'Tartozás',
    type: 'select',
    options: ['1 havi', '2 havi', '3 havi', '2024 SZJA', 'Megszűnés', 'Szünet', 'Egyéb'],
  },
  {
    key: 'tartozasOsszeg2025',
    label: 'Tartozás havidíj 2025',
    type: 'multiselect',
    options: [
      'Január',
      'Február',
      'Március',
      'Április',
      'Május',
      'Június',
      'Július',
      'Augusztus',
      'Szeptember',
      'Október',
      'November',
      'December',
    ],
  },
  { key: 'kedvezmenyek', label: 'Kedvezmények' },
  { key: 'megszunesDatuma', label: 'Megszűnés dátuma', type: 'date' },
  { key: 'szunetKezdete', label: 'Szünet kezdete', type: 'date' },
  { key: 'navOnlineActive', label: 'NAV 2.0 adat kérés aktív', type: 'boolean' },
  { key: 'navOnlineUser', label: 'NAV felhasználónév' },
  { key: 'navOnlinePassword', label: 'NAV jelszó' },
  { key: 'navOnlineSignerKey', label: 'NAV aláíró kulcs' },
  { key: 'navOnlineExchangeKey', label: 'NAV csere kulcs' },
  { key: 'navOnlineStartDate', label: 'NAV kezdő dátum', type: 'date' },

]

export const fieldGroups = [
  {
    title: 'Általános',
    keys: ['nev', 'statusz', 'nyelv', 'torzs', 'szuletesiIdo', 'munkavegzesJellege',],
  },
  {
    title: 'Kapcsolat',
    keys: ['email', 'telefonszam', 'szekhely'],
  },
  {
    title: 'Adózás',
    keys: ['adoszam', 'adoazonosito', 'afa', 'adozasiForma', 'ipa', 'koltseghanyad', 'kedvezmenyek',],
  },
  {
    title: 'Dátumok',
    keys: ['kezdesDatuma', 'megszunesDatuma', 'szunetKezdete'],
  },
  {
    title: 'Pénzügy',
    keys: ['tartozas', 'tartozasOsszeg2025', 'cegSzamlazas', 'szamlazas'],
  },
  {
    title: 'Egyéb',
    keys: ['kapuseged', 'viki', 'relax', 'meghat'],
  },
  {
    title: 'NAV online számla',
    keys: ['navOnlineActive', 'navOnlineUser', 'navOnlinePassword', 'navOnlineSignerKey', 'navOnlineExchangeKey', 'navOnlineStartDate'],
  },

]

export const emptyClient = fieldDefinitions.reduce((acc, field) => {
  if (field.type === 'boolean') {
    acc[field.key] = false
  } else if (field.type === 'multiselect') {
    acc[field.key] = []
  } else {
    acc[field.key] = ''
  }
  return acc
}, {})
