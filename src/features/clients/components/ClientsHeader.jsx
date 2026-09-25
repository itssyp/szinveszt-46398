import React, { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { TbChevronDown, TbDots, TbFileExport, TbFileImport, TbSettings, TbUserPlus } from 'react-icons/tb'
import StatusBadge from '../../../components/StatusBadge'
import { t } from '../../../i18n'

function ClientsHeader({ clientsCount, filteredCount, status }) {
  const [openMenu, setOpenMenu] = useState('')
  const actionsRef = useRef(null)
  const toggleMenu = (menu) => setOpenMenu((current) => (current === menu ? '' : menu))
  const closeMenu = () => setOpenMenu('')

  useEffect(() => {
    if (!openMenu) return undefined
    const handlePointerDown = (event) => {
      if (!actionsRef.current?.contains(event.target)) closeMenu()
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu])

  return (
    <header className="section-header">
      <div className="section-header__top">
        <div>
          <p className="eyebrow">Ügyfél törzsadatok</p>
          <h1 className="section-title">Szinveszt ügyfélkezelés</h1>
          <p className="section-subtitle">Keresés, importálás, szerkesztés egy helyen.</p>
        </div>
        <div ref={actionsRef} className="client-header-actions">
          <NavLink to="/clients/new" className="btn" onClick={closeMenu}>
            <TbUserPlus aria-hidden="true" />
            {t('app.nav.newClient')}
          </NavLink>
          <div className="client-header-action-menu" onMouseLeave={closeMenu}>
            <button
              type="button"
              className="btn ghost"
              onClick={() => toggleMenu('import')}
              aria-expanded={openMenu === 'import'}
              aria-controls="client-import-actions"
            >
              <TbFileImport aria-hidden="true" />
              Import
              <TbChevronDown aria-hidden="true" />
            </button>
            <div
              id="client-import-actions"
              className={`client-header-action-menu__menu${openMenu === 'import' ? ' is-open' : ''}`}
            >
              <NavLink to="/clients/import" onClick={closeMenu}>
                {t('app.nav.excelImport')}
              </NavLink>
              <NavLink to="/clients/income-import" onClick={closeMenu}>
                {t('app.nav.incomesImport')}
              </NavLink>
            </div>
          </div>
          <div className="client-header-action-menu" onMouseLeave={closeMenu}>
            <button
              type="button"
              className="btn ghost icon-btn"
              onClick={() => toggleMenu('more')}
              aria-label="További ügyfélműveletek"
              title="További ügyfélműveletek"
              aria-expanded={openMenu === 'more'}
              aria-controls="client-more-actions"
            >
              <TbDots aria-hidden="true" />
            </button>
            <div
              id="client-more-actions"
              className={`client-header-action-menu__menu client-header-action-menu__menu--right${openMenu === 'more' ? ' is-open' : ''}`}
            >
              <NavLink to="/clients/export" onClick={closeMenu}>
                <TbFileExport aria-hidden="true" />
                {t('app.nav.excelExport')}
              </NavLink>
              <NavLink to="/client-schema" onClick={closeMenu}>
                <TbSettings aria-hidden="true" />
                {t('app.nav.schemaEditor')}
              </NavLink>
            </div>
          </div>
        </div>
      </div>
      <div className="metric-bar">
        <div className="metric-card">
          <span className="metric-label">Összes ügyfél</span>
          <span className="metric-value">{clientsCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Szűrt lista</span>
          <span className="metric-value">{filteredCount}</span>
        </div>
        <StatusBadge ok={status.ok} message={status.message} />
      </div>
    </header>
  )
}

export default ClientsHeader
