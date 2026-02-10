import React from 'react'
import { TbLayoutGrid, TbList } from 'react-icons/tb'
import { defaultViewMode } from '../hooks/useClientFilters'

const monthOptions = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

function ClientsFilterBar({
  searchTerm,
  statusFilter,
  debtFilter,
  startYear,
  startMonth,
  sortBy,
  viewMode = defaultViewMode,
  availableYears = [],
  availableStatuses = [],
  onSearchChange,
  onStatusChange,
  onDebtChange,
  onYearChange,
  onMonthChange,
  onSortChange,
  onToggleView,
}) {
  return (
    <>
      <div className="panel filter-panel">
        <div className="input-shell search-field wide-search">
          <input
            type="search"
            placeholder="Keresés név vagy adószám alapján..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="filter-bar">
          <label className="filter-control">
            <span>Státusz</span>
            <select value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}>
              <option value="">Mind</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Billingo tartozás</span>
            <select value={debtFilter} onChange={(e) => onDebtChange(e.target.value)}>
              <option value="">Mind</option>
              <option value="has">Van</option>
              <option value="none">Nincs</option>
            </select>
          </label>
          <label className="filter-control">
            <span>Kezdés éve</span>
            <select value={startYear} onChange={(e) => onYearChange(e.target.value)}>
              <option value="">Mind</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Kezdés hónapja</span>
            <select value={startMonth} onChange={(e) => onMonthChange(e.target.value)}>
              <option value="">Mind</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Rendezés</span>
            <select value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
              <option value="name">Név (A-Z)</option>
              <option value="start-desc">Kezdés dátuma (legújabb)</option>
              <option value="start-asc">Kezdés dátuma (legrégebbi)</option>
            </select>
          </label>
          <button
            type="button"
            className="view-toggle-btn"
            onClick={onToggleView}
            title={viewMode === 'cards' ? 'Váltás listára' : 'Váltás kártyákra'}
          >
            <span className="view-toggle-icon" aria-hidden="true">
              {viewMode === 'cards' ? <TbList /> : <TbLayoutGrid />}
            </span>
          </button>
        </div>
      </div>
    </>
  )
}

ClientsFilterBar.defaultProps = {
  viewMode: defaultViewMode,
  availableYears: [],
  availableStatuses: [],
}

export default ClientsFilterBar
