import { useMemo, useState } from 'react'
import { formatClientStartDate, parseClientStartDate } from '../utils/clientDates'

export const defaultViewMode = 'cards'
const DEFAULT_SORT = 'name'
const SORT_OPTIONS = new Set(['name', 'start-desc', 'start-asc'])

function normalizeViewMode(value) {
  return value === 'list' ? 'list' : defaultViewMode
}

function normalizeSortBy(value) {
  return SORT_OPTIONS.has(value) ? value : DEFAULT_SORT
}

function normalizeMonth(value) {
  const raw = String(value || '')
  return /^(0[1-9]|1[0-2])$/.test(raw) ? raw : ''
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeBooleanFilter(value) {
  return value === 'yes' || value === 'no' ? value : ''
}

function normalizeBooleanValue(value) {
  if (typeof value === 'boolean') return value
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
  if (!raw) return false
  if (['true', '1', 'yes', 'igen', 'aktiv', 'active', 'x'].includes(raw)) return true
  if (['false', '0', 'no', 'nem'].includes(raw)) return false
  return false
}

function normalizeListItem(value) {
  return String(value || '').trim().toLowerCase()
}

function extractTevekenysegek(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
  }
  const raw = String(value || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function useClientFilters(clients = [], options = {}) {
  const initialFilters = options?.initialFilters || {}
  const initialView = options?.initialView || defaultViewMode

  const normalizeStatus = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z]/gi, '')
      .toLowerCase()

  const [searchTerm, setSearchTerm] = useState(normalizeText(initialFilters.searchTerm))
  const [statusFilter, setStatusFilter] = useState(normalizeText(initialFilters.statusFilter))
  const [debtFilter, setDebtFilter] = useState(
    initialFilters.debtFilter === 'has' || initialFilters.debtFilter === 'none' ? initialFilters.debtFilter : ''
  )
  const [startYear, setStartYear] = useState(normalizeText(initialFilters.startYear))
  const [startMonth, setStartMonth] = useState(normalizeMonth(initialFilters.startMonth))
  const [sortBy, setSortBy] = useState(normalizeSortBy(initialFilters.sortBy))
  const [viewMode, setViewMode] = useState(normalizeViewMode(initialFilters.viewMode || initialView))
  const [assigneeFilter, setAssigneeFilter] = useState(normalizeText(initialFilters.assigneeFilter))
  const [languageFilter, setLanguageFilter] = useState(normalizeText(initialFilters.languageFilter))
  const [workTypeFilter, setWorkTypeFilter] = useState(normalizeText(initialFilters.workTypeFilter))
  const [taxationFilter, setTaxationFilter] = useState(normalizeText(initialFilters.taxationFilter))
  const [billingCompanyFilter, setBillingCompanyFilter] = useState(normalizeText(initialFilters.billingCompanyFilter))
  const [invoicingFilter, setInvoicingFilter] = useState(normalizeText(initialFilters.invoicingFilter))
  const [utalandoFrequencyFilter, setUtalandoFrequencyFilter] = useState(
    normalizeText(initialFilters.utalandoFrequencyFilter)
  )
  const [afaFilter, setAfaFilter] = useState(normalizeText(initialFilters.afaFilter))
  const [ipaFilter, setIpaFilter] = useState(normalizeText(initialFilters.ipaFilter))
  const [foodoraFilter, setFoodoraFilter] = useState(normalizeBooleanFilter(initialFilters.foodoraFilter))
  const [woltFilter, setWoltFilter] = useState(normalizeBooleanFilter(initialFilters.woltFilter))
  const [activityFilter, setActivityFilter] = useState(normalizeText(initialFilters.activityFilter))

  const filteredClients = useMemo(
    () =>
      clients
        .filter((client) => {
          const term = searchTerm.trim().toLowerCase()
          if (term) {
            const name = (client.nev || '').toLowerCase()
            const tax = (client.adoszam || '').toLowerCase()
            if (!name.includes(term) && !tax.includes(term)) return false
          }
          if (statusFilter) {
            const normClient = normalizeStatus(client.statusz)
            const normFilter = normalizeStatus(statusFilter)
            const isSzunet = normFilter.startsWith('szunet') && normClient.startsWith('szunet')
            if (!isSzunet && normClient !== normFilter) {
              return false
            }
          }
          if (debtFilter) {
            const debtValue = Number(client.billingoDebt) || 0
            if (debtFilter === 'has' && debtValue <= 0) return false
            if (debtFilter === 'none' && debtValue > 0) return false
          }
          const start = parseClientStartDate(client)
          if (startYear && (!start || start.getFullYear().toString() !== startYear)) {
            return false
          }
          if (startMonth) {
            const monthVal = start ? String(start.getMonth() + 1).padStart(2, '0') : ''
            if (monthVal !== startMonth) return false
          }
          if (assigneeFilter && String(client.hozzarendeltSzemely || '').trim() !== assigneeFilter) {
            return false
          }
          if (languageFilter && String(client.nyelv || '').trim() !== languageFilter) {
            return false
          }
          if (workTypeFilter && String(client.munkavegzesJellege || '').trim() !== workTypeFilter) {
            return false
          }
          if (taxationFilter && String(client.adozasiForma || '').trim() !== taxationFilter) {
            return false
          }
          if (billingCompanyFilter && String(client.cegSzamlazas || '').trim() !== billingCompanyFilter) {
            return false
          }
          if (invoicingFilter && String(client.szamlazas || '').trim() !== invoicingFilter) {
            return false
          }
          if (
            utalandoFrequencyFilter &&
            String(client.utalandoGyakorisag || '').trim() !== utalandoFrequencyFilter
          ) {
            return false
          }
          if (afaFilter && String(client.afa || '').trim() !== afaFilter) {
            return false
          }
          if (ipaFilter && String(client.ipa || '').trim() !== ipaFilter) {
            return false
          }
          if (foodoraFilter) {
            const hasFoodora = normalizeBooleanValue(client.foodora)
            if (foodoraFilter === 'yes' && !hasFoodora) return false
            if (foodoraFilter === 'no' && hasFoodora) return false
          }
          if (woltFilter) {
            const hasWolt = normalizeBooleanValue(client.wolt)
            if (woltFilter === 'yes' && !hasWolt) return false
            if (woltFilter === 'no' && hasWolt) return false
          }
          if (activityFilter) {
            const selected = normalizeListItem(activityFilter)
            const matchesActivity = extractTevekenysegek(client.tevekenyseg).some(
              (item) => normalizeListItem(item) === selected
            )
            if (!matchesActivity) return false
          }
          return true
        })
        .sort((a, b) => {
          if (sortBy === 'start-desc' || sortBy === 'start-asc') {
            const dateA = parseClientStartDate(a)?.getTime() || 0
            const dateB = parseClientStartDate(b)?.getTime() || 0
            return sortBy === 'start-desc' ? dateB - dateA : dateA - dateB
          }
          const nameA = (a.nev || '').toLowerCase()
          const nameB = (b.nev || '').toLowerCase()
          return nameA.localeCompare(nameB, 'hu')
        }),
    [
      clients,
      searchTerm,
      statusFilter,
      debtFilter,
      startYear,
      startMonth,
      sortBy,
      assigneeFilter,
      languageFilter,
      workTypeFilter,
      taxationFilter,
      billingCompanyFilter,
      invoicingFilter,
      utalandoFrequencyFilter,
      afaFilter,
      ipaFilter,
      foodoraFilter,
      woltFilter,
      activityFilter,
    ]
  )

  const uniqueOptions = (selector) => {
    const values = new Set()
    clients.forEach((client) => {
      const value = String(selector(client) || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'hu'))
  }

  const availableYears = useMemo(() => {
    const years = new Set()
    clients.forEach((c) => {
      const date = parseClientStartDate(c)
      if (date) years.add(date.getFullYear().toString())
    })
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [clients])

  const availableStatuses = useMemo(() => {
    const byNormalized = new Map()
    clients.forEach((client) => {
      const raw = String(client?.statusz || '').trim()
      if (!raw) return
      const normalized = normalizeStatus(raw)
      if (!normalized || byNormalized.has(normalized)) return
      byNormalized.set(normalized, raw)
    })

    return Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b, 'hu'))
  }, [clients])
  const availableActivities = useMemo(() => {
    const byNormalized = new Map()
    clients.forEach((client) => {
      extractTevekenysegek(client.tevekenyseg).forEach((entry) => {
        const raw = String(entry || '').trim()
        if (!raw) return
        const normalized = normalizeListItem(raw)
        if (!normalized || byNormalized.has(normalized)) return
        byNormalized.set(normalized, raw)
      })
    })
    return Array.from(byNormalized.values()).sort((a, b) => a.localeCompare(b, 'hu'))
  }, [clients])

  const formatStartDate = (client) => formatClientStartDate(client)

  const toggleViewMode = () => setViewMode((prev) => (prev === 'cards' ? 'list' : 'cards'))
  const clearDetailedFilters = () => {
    setAssigneeFilter('')
    setLanguageFilter('')
    setWorkTypeFilter('')
    setTaxationFilter('')
    setBillingCompanyFilter('')
    setInvoicingFilter('')
    setUtalandoFrequencyFilter('')
    setAfaFilter('')
    setIpaFilter('')
    setFoodoraFilter('')
    setWoltFilter('')
    setActivityFilter('')
  }
  const activeDetailedFilterCount = [
    assigneeFilter,
    languageFilter,
    workTypeFilter,
    taxationFilter,
    billingCompanyFilter,
    invoicingFilter,
    utalandoFrequencyFilter,
    afaFilter,
    ipaFilter,
    foodoraFilter,
    woltFilter,
    activityFilter,
  ].filter(Boolean).length

  return {
    filters: {
      searchTerm,
      statusFilter,
      debtFilter,
      startYear,
      startMonth,
      sortBy,
      viewMode,
      assigneeFilter,
      languageFilter,
      workTypeFilter,
      taxationFilter,
      billingCompanyFilter,
      invoicingFilter,
      utalandoFrequencyFilter,
      afaFilter,
      ipaFilter,
      foodoraFilter,
      woltFilter,
      activityFilter,
    },
    setters: {
      setSearchTerm,
      setStatusFilter,
      setDebtFilter,
      setStartYear,
      setStartMonth,
      setSortBy,
      setViewMode,
      setAssigneeFilter,
      setLanguageFilter,
      setWorkTypeFilter,
      setTaxationFilter,
      setBillingCompanyFilter,
      setInvoicingFilter,
      setUtalandoFrequencyFilter,
      setAfaFilter,
      setIpaFilter,
      setFoodoraFilter,
      setWoltFilter,
      setActivityFilter,
    },
    toggleViewMode,
    filteredClients,
    availableYears,
    availableStatuses,
    availableAssignees: uniqueOptions((client) => client.hozzarendeltSzemely),
    availableLanguages: uniqueOptions((client) => client.nyelv),
    availableWorkTypes: uniqueOptions((client) => client.munkavegzesJellege),
    availableTaxationTypes: uniqueOptions((client) => client.adozasiForma),
    availableBillingCompanies: uniqueOptions((client) => client.cegSzamlazas),
    availableInvoicingTypes: uniqueOptions((client) => client.szamlazas),
    availableUtalandoFrequencies: uniqueOptions((client) => client.utalandoGyakorisag),
    availableAfaTypes: uniqueOptions((client) => client.afa),
    availableIpaTypes: uniqueOptions((client) => client.ipa),
    availableActivities,
    clearDetailedFilters,
    activeDetailedFilterCount,
    formatStartDate,
  }
}
