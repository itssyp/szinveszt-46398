import { useMemo, useState } from 'react'
import { formatClientStartDate, parseClientStartDate } from '../utils/clientDates'

export const defaultViewMode = 'cards'

export function useClientFilters(clients = [], initialView = defaultViewMode) {
  const normalizeStatus = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z]/gi, '')
      .toLowerCase()

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [debtFilter, setDebtFilter] = useState('')
  const [startYear, setStartYear] = useState('')
  const [startMonth, setStartMonth] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [viewMode, setViewMode] = useState(initialView)

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
    [clients, searchTerm, statusFilter, debtFilter, startYear, startMonth, sortBy]
  )

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

  const formatStartDate = (client) => formatClientStartDate(client)

  const toggleViewMode = () => setViewMode((prev) => (prev === 'cards' ? 'list' : 'cards'))

  return {
    filters: {
      searchTerm,
      statusFilter,
      debtFilter,
      startYear,
      startMonth,
      sortBy,
      viewMode,
    },
    setters: {
      setSearchTerm,
      setStatusFilter,
      setDebtFilter,
      setStartYear,
      setStartMonth,
      setSortBy,
      setViewMode,
    },
    toggleViewMode,
    filteredClients,
    availableYears,
    availableStatuses,
    formatStartDate,
  }
}
