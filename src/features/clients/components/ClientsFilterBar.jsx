import React, { useState } from 'react'
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
  onClearDetailedFilters,
  onToggleView,
}) {
  const [showDetailed, setShowDetailed] = useState(false)

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
        <div className="filter-bar clients-detailed-controls">
          <button type="button" className="btn ghost" onClick={() => setShowDetailed((prev) => !prev)}>
            {showDetailed ? 'Kevesebb szűrő' : 'További szűrők'}
          </button>
          {activeDetailedFilterCount ? (
            <>
              <span className="pill">{activeDetailedFilterCount} aktív</span>
              <button type="button" className="btn ghost" onClick={onClearDetailedFilters}>
                Részletes szűrők törlése
              </button>
            </>
          ) : null}
        </div>

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
