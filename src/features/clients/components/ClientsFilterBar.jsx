import React, { useEffect, useMemo, useState } from 'react'
import { TbLayoutGrid, TbList, TbX } from 'react-icons/tb'
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
  assigneeFilter = '',
  languageFilter = '',
  workTypeFilter = '',
  taxationFilter = '',
  billingCompanyFilter = '',
  invoicingFilter = '',
  utalandoFrequencyFilter = '',
  afaFilter = '',
  ipaFilter = '',
  foodoraFilter = '',
  woltFilter = '',
  activityFilter = '',
  availableAssignees = [],
  availableLanguages = [],
  availableWorkTypes = [],
  availableTaxationTypes = [],
  availableBillingCompanies = [],
  availableInvoicingTypes = [],
  availableUtalandoFrequencies = [],
  availableAfaTypes = [],
  availableIpaTypes = [],
  availableActivities = [],
  activeDetailedFilterCount = 0,
  onSearchChange,
  onStatusChange,
  onDebtChange,
  onYearChange,
  onMonthChange,
  onSortChange,
  onAssigneeChange,
  onLanguageChange,
  onWorkTypeChange,
  onTaxationChange,
  onBillingCompanyChange,
  onInvoicingChange,
  onUtalandoFrequencyChange,
  onAfaChange,
  onIpaChange,
  onFoodoraChange,
  onWoltChange,
  onActivityChange,
  onClearAllFilters,
  onApplyPreset,
  onToggleView,
}) {
  const [showDetailed, setShowDetailed] = useState(false)
  const activeFilters = useMemo(() => {
    const filters = []
    const add = (key, label, value, onRemove) => {
      if (value) filters.push({ key, label, value, onRemove })
    }

    add('search', 'Keresés', searchTerm, () => onSearchChange(''))
    add('status', t('clients.filters.status'), statusFilter, () => onStatusChange(''))
    add('debt', t('clients.filters.debt'), debtFilter ? (debtFilter === 'has' ? t('clients.filters.debtHas') : t('clients.filters.debtNone')) : '', () => onDebtChange(''))
    add('startYear', t('clients.filters.startYear'), startYear, () => onYearChange(''))
    add('startMonth', t('clients.filters.startMonth'), startMonth, () => onMonthChange(''))
    add('assignee', 'Hozzárendelt személy', assigneeFilter, () => onAssigneeChange(''))
    add('language', 'Nyelv', languageFilter, () => onLanguageChange(''))
    add('workType', 'Munkavégzés jellege', workTypeFilter, () => onWorkTypeChange(''))
    add('taxation', 'Adózási forma', taxationFilter, () => onTaxationChange(''))
    add('billingCompany', 'Cég számlázás', billingCompanyFilter, () => onBillingCompanyChange(''))
    add('invoicing', 'Számlázás típusa', invoicingFilter, () => onInvoicingChange(''))
    add('utalandoFrequency', 'Utalandó gyakoriság', utalandoFrequencyFilter, () => onUtalandoFrequencyChange(''))
    add('afa', 'AFA', afaFilter, () => onAfaChange(''))
    add('ipa', 'IPA', ipaFilter, () => onIpaChange(''))
    add('foodora', 'Foodora', foodoraFilter ? (foodoraFilter === 'yes' ? t('common.yes') : t('common.no')) : '', () => onFoodoraChange(''))
    add('wolt', 'WOLT', woltFilter ? (woltFilter === 'yes' ? t('common.yes') : t('common.no')) : '', () => onWoltChange(''))
    add('activity', 'Tevékenység', activityFilter, () => onActivityChange(''))
    return filters
  }, [
    activityFilter,
    afaFilter,
    assigneeFilter,
    billingCompanyFilter,
    debtFilter,
    foodoraFilter,
    invoicingFilter,
    ipaFilter,
    languageFilter,
    onAfaChange,
    onActivityChange,
    onAssigneeChange,
    onBillingCompanyChange,
    onDebtChange,
    onFoodoraChange,
    onInvoicingChange,
    onIpaChange,
    onLanguageChange,
    onMonthChange,
    onSearchChange,
    onStatusChange,
    onTaxationChange,
    onUtalandoFrequencyChange,
    onWoltChange,
    onWorkTypeChange,
    searchTerm,
    startMonth,
    startYear,
    statusFilter,
    taxationFilter,
    utalandoFrequencyFilter,
    woltFilter,
    workTypeFilter,
  ])

  useEffect(() => {
    if (activeDetailedFilterCount) setShowDetailed(true)
  }, [activeDetailedFilterCount])

  return (
    <>
      <div className="panel filter-panel">
        <div className="filter-presets" aria-label="Gyors szűrők">
          <span className="filter-presets__label">Gyors nézetek</span>
          <button type="button" className="filter-preset" onClick={() => onApplyPreset('active')}>
            Aktív ügyfelek
          </button>
          <button type="button" className="filter-preset" onClick={() => onApplyPreset('paused')}>
            Szünetelő ügyfelek
          </button>
          <button type="button" className="filter-preset" onClick={() => onApplyPreset('cancelled')}>
            Lemondta / kirúgva
          </button>
          <button type="button" className="filter-preset" onClick={() => onApplyPreset('debt')}>
            Tartozással
          </button>
        </div>
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
        <div className="filter-bar clients-detailed-controls">
          <button type="button" className="btn ghost" onClick={() => setShowDetailed((prev) => !prev)}>
            {showDetailed ? 'Kevesebb szűrő' : 'További szűrők'}
          </button>
        </div>

        {activeFilters.length ? (
          <div className="active-filter-bar">
            <span className="active-filter-bar__label">Aktív szűrők</span>
            <div className="active-filter-bar__chips">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className="pill pill-clear active-filter-chip"
                  onClick={filter.onRemove}
                  title={`${filter.label}: ${filter.value} törlése`}
                >
                  <span>{filter.label}: {filter.value}</span>
                  <TbX aria-hidden="true" />
                </button>
              ))}
            </div>
            <button type="button" className="filter-clear-all" onClick={onClearAllFilters}>
              Összes szűrő törlése
            </button>
          </div>
        ) : null}

        {showDetailed ? (
          <div className="filter-bar clients-detailed-grid">
            <label className="filter-control">
              <span>Hozzárendelt személy</span>
              <select value={assigneeFilter} onChange={(event) => onAssigneeChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableAssignees.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Nyelv</span>
              <select value={languageFilter} onChange={(event) => onLanguageChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableLanguages.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Munkavégzés jellege</span>
              <select value={workTypeFilter} onChange={(event) => onWorkTypeChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableWorkTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Adózási forma</span>
              <select value={taxationFilter} onChange={(event) => onTaxationChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableTaxationTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Cég számlázás</span>
              <select value={billingCompanyFilter} onChange={(event) => onBillingCompanyChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableBillingCompanies.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Számlázás típusa</span>
              <select value={invoicingFilter} onChange={(event) => onInvoicingChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableInvoicingTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Utalandó gyakoriság</span>
              <select
                value={utalandoFrequencyFilter}
                onChange={(event) => onUtalandoFrequencyChange(event.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {availableUtalandoFrequencies.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>AFA</span>
              <select value={afaFilter} onChange={(event) => onAfaChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableAfaTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>IPA</span>
              <select value={ipaFilter} onChange={(event) => onIpaChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableIpaTypes.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control">
              <span>Foodora</span>
              <select value={foodoraFilter} onChange={(event) => onFoodoraChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                <option value="yes">{t('common.yes')}</option>
                <option value="no">{t('common.no')}</option>
              </select>
            </label>
            <label className="filter-control">
              <span>WOLT</span>
              <select value={woltFilter} onChange={(event) => onWoltChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                <option value="yes">{t('common.yes')}</option>
                <option value="no">{t('common.no')}</option>
              </select>
            </label>
            <label className="filter-control">
              <span>Tevékenység</span>
              <select value={activityFilter} onChange={(event) => onActivityChange(event.target.value)}>
                <option value="">{t('common.all')}</option>
                {availableActivities.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>
    </>
  )
}

ClientsFilterBar.defaultProps = {
  viewMode: defaultViewMode,
  availableYears: [],
  availableStatuses: [],
  assigneeFilter: '',
  languageFilter: '',
  workTypeFilter: '',
  taxationFilter: '',
  billingCompanyFilter: '',
  invoicingFilter: '',
  utalandoFrequencyFilter: '',
  afaFilter: '',
  ipaFilter: '',
  foodoraFilter: '',
  woltFilter: '',
  activityFilter: '',
  availableAssignees: [],
  availableLanguages: [],
  availableWorkTypes: [],
  availableTaxationTypes: [],
  availableBillingCompanies: [],
  availableInvoicingTypes: [],
  availableUtalandoFrequencies: [],
  availableAfaTypes: [],
  availableIpaTypes: [],
  availableActivities: [],
  activeDetailedFilterCount: 0,
}

export default ClientsFilterBar
