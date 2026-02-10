import React from 'react'
import { TbLayoutGrid, TbList } from 'react-icons/tb'
import { defaultViewMode } from '../hooks/useClientFilters'
import { t } from '../../../i18n'

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
            placeholder={t('clients.filters.searchPlaceholder')}
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>
        <div className="filter-bar">
          <label className="filter-control">
            <span>{t('clients.filters.status')}</span>
            <select value={statusFilter} onChange={(event) => onStatusChange(event.target.value)}>
              <option value="">{t('common.all')}</option>
              {availableStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>{t('clients.filters.debt')}</span>
            <select value={debtFilter} onChange={(event) => onDebtChange(event.target.value)}>
              <option value="">{t('common.all')}</option>
              <option value="has">{t('clients.filters.debtHas')}</option>
              <option value="none">{t('clients.filters.debtNone')}</option>
            </select>
          </label>
          <label className="filter-control">
            <span>{t('clients.filters.startYear')}</span>
            <select value={startYear} onChange={(event) => onYearChange(event.target.value)}>
              <option value="">{t('common.all')}</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>{t('clients.filters.startMonth')}</span>
            <select value={startMonth} onChange={(event) => onMonthChange(event.target.value)}>
              <option value="">{t('common.all')}</option>
              {monthOptions.map((monthOption) => (
                <option key={monthOption} value={monthOption}>
                  {monthOption}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>{t('clients.filters.sort')}</span>
            <select value={sortBy} onChange={(event) => onSortChange(event.target.value)}>
              <option value="name">{t('clients.filters.sortName')}</option>
              <option value="start-desc">{t('clients.filters.sortStartDesc')}</option>
              <option value="start-asc">{t('clients.filters.sortStartAsc')}</option>
            </select>
          </label>
          <button
            type="button"
            className="view-toggle-btn"
            onClick={onToggleView}
            title={viewMode === 'cards' ? t('clients.filters.switchToList') : t('clients.filters.switchToCards')}
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
