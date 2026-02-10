import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'

const MONTHS = [
  { id: 1, label: 'Január', short: 'Jan' },
  { id: 2, label: 'Február', short: 'Feb' },
  { id: 3, label: 'Március', short: 'Már' },
  { id: 4, label: 'Április', short: 'Ápr' },
  { id: 5, label: 'Május', short: 'Máj' },
  { id: 6, label: 'Június', short: 'Jún' },
  { id: 7, label: 'Július', short: 'Júl' },
  { id: 8, label: 'Augusztus', short: 'Aug' },
  { id: 9, label: 'Szeptember', short: 'Sze' },
  { id: 10, label: 'Október', short: 'Okt' },
  { id: 11, label: 'November', short: 'Nov' },
  { id: 12, label: 'December', short: 'Dec' },
]

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
            <p className="eyebrow">Feladatok</p>
            <h1 className="section-title">Havi feladatok</h1>
            <p className="section-subtitle">
              Válassz hónapot a feladatok áttekintéséhez és követéséhez.
            </p>
          </div>
          <div className="year-switcher">
            <button
              type="button"
              className="year-control"
              onClick={() => setYear((prev) => prev - 1)}
              aria-label="Előző év"
            >
              {'<'}
            </button>
            <div className="year-display">{year}</div>
            <button
              type="button"
              className="year-control"
              onClick={() => setYear((prev) => prev + 1)}
              aria-label="Következő év"
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
            {closedMonths[month.id] ? <span className="month-card__status">Lezárva</span> : null}
          </button>
        ))}
      </section>
    </main>
  )
}

export default MonthlyTasksPage
