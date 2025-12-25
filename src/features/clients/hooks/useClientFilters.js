import { useMemo, useState } from 'react'
import { formatClientStartDate, parseClientStartDate } from '../utils/clientDates'

export const defaultViewMode = 'cards'

export function useClientFilters(clients = [], initialView = defaultViewMode) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
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
          if (statusFilter && (client.statusz || '').toLowerCase() !== statusFilter.toLowerCase()) {
            return false
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
    [clients, searchTerm, statusFilter, startYear, startMonth, sortBy]
  )

  const availableYears = useMemo(() => {
    const years = new Set()
    clients.forEach((c) => {
      const date = parseClientStartDate(c)
      if (date) years.add(date.getFullYear().toString())
    })
    return Array.from(years).sort((a, b) => b.localeCompare(a))
  }, [clients])

  const formatStartDate = (client) => formatClientStartDate(client)

  const toggleViewMode = () => setViewMode((prev) => (prev === 'cards' ? 'list' : 'cards'))

  return {
    filters: {
      searchTerm,
      statusFilter,
      startYear,
      startMonth,
      sortBy,
      viewMode,
    },
    setters: {
      setSearchTerm,
      setStatusFilter,
      setStartYear,
      setStartMonth,
      setSortBy,
      setViewMode,
    },
    toggleViewMode,
    filteredClients,
    availableYears,
    formatStartDate,
  }
}
