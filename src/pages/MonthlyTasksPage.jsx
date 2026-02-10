import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { i18n, t } from '../i18n'

const MONTHS = i18n.tasks.months.full.map((label, index) => ({
  id: index + 1,
  label,
  short: i18n.tasks.months.short[index],
}))

function MonthlyTasksPage() {
  const navigate = useNavigate()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [closedMonths, setClosedMonths] = useState({})
  const monthCards = useMemo(() => MONTHS, [])

  useEffect(() => {
    const monthQuery = query(collection(db, 'monthTasks'), where('year', '==', Number(year)))
    const unsub = onSnapshot(monthQuery, (snap) => {
      const next = {}
      snap.forEach((docSnap) => {
        const data = docSnap.data()
        const monthValue = Number(data?.month)
        if (monthValue >= 1 && monthValue <= 12) {
          next[monthValue] = Boolean(data?.closed)
        }
      })
      setClosedMonths(next)
    })
    return () => unsub()
  }, [year])

  const goToMonth = (monthId) => {
    const padded = String(monthId).padStart(2, '0')
    navigate(`/tasks/${year}/${padded}`)
  }

  return (
    <main className="page-container">
      <header className="section-header tasks-hero">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">{t('tasks.list.eyebrow')}</p>
            <h1 className="section-title">{t('tasks.list.title')}</h1>
            <p className="section-subtitle">{t('tasks.list.subtitle')}</p>
          </div>
          <div className="year-switcher">
            <button
              type="button"
              className="year-control"
              onClick={() => setYear((prev) => prev - 1)}
              aria-label={t('tasks.list.prevYear')}
            >
              {'<'}
            </button>
            <div className="year-display">{year}</div>
            <button
              type="button"
              className="year-control"
              onClick={() => setYear((prev) => prev + 1)}
              aria-label={t('tasks.list.nextYear')}
            >
              {'>'}
            </button>
          </div>
        </div>
      </header>

      <section className="month-grid">
        {monthCards.map((month) => (
          <button
            key={month.id}
            type="button"
            className={`month-card${closedMonths[month.id] ? ' is-closed' : ''}`}
            onClick={() => goToMonth(month.id)}
          >
            <div className="month-card__head">
              <div>
                <p className="month-card__eyebrow">{month.short}</p>
                <h3 className="month-card__title">{month.label}</h3>
              </div>
              <span className="month-card__index">{String(month.id).padStart(2, '0')}</span>
            </div>
            {closedMonths[month.id] ? <span className="month-card__status">{t('common.closed')}</span> : null}
          </button>
        ))}
      </section>
    </main>
  )
}

export default MonthlyTasksPage
