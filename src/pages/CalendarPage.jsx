import React, { useMemo, useState } from 'react'
import { orderBy, query } from 'firebase/firestore'
import useCollectionSubscription from '../hooks/useCollectionSubscription'
import Modal from '../components/Modal'
import TicketModal from '../components/TicketModal'
import { i18n, t } from '../i18n'

const pad = (n) => String(n).padStart(2, '0')
const toIsoDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const priorityRank = { high: 0, medium: 1, low: 2 }
const priorityLabel = (value) => {
  if (value === 'high') return t('tickets.priorityHigh')
  if (value === 'low') return t('tickets.priorityLow')
  return t('tickets.priorityMedium')
}

function CalendarPage({ currentUser, userProfiles = [] }) {
  const { data: tickets, error, loading } = useCollectionSubscription('tickets', (coll) =>
    query(coll, orderBy('createdAt', 'desc'))
  )
  const todayIso = useMemo(() => toIsoDate(new Date()), [])
  const [selectedTicket, setSelectedTicket] = useState(null)

  const selectedTicketLive = useMemo(() => {
    if (!selectedTicket) return null
    return tickets.find((ticket) => ticket.id === selectedTicket.id) || selectedTicket
  }, [tickets, selectedTicket])

  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(todayIso)

  const monthLabel = `${i18n.tasks.months.full[viewDate.getMonth()]} ${viewDate.getFullYear()}`

  const openDueTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => !ticket.resolved && ticket.dueDate)
        .map((ticket) => ({ ...ticket, priority: ticket.priority || 'medium' })),
    [tickets]
  )

  const dueByDate = useMemo(() => {
    const map = new Map()
    openDueTickets.forEach((ticket) => {
      const key = ticket.dueDate
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ticket)
    })
    map.forEach((list) =>
      list.sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1))
    )
    return map
  }, [openDueTickets])

  const monthGrid = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const startOffset = (firstDay.getDay() + 6) % 7 // Monday-first
    const cells = []
    for (let i = 0; i < startOffset; i += 1) cells.push(null)

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const date = new Date(year, month, day)
      const iso = toIsoDate(date)
      cells.push({
        iso,
        day,
        isToday: iso === todayIso,
        isSelected: iso === selectedDate,
        dueCount: (dueByDate.get(iso) || []).length,
      })
    }

    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewDate, selectedDate, dueByDate, todayIso])

  const selectedItems = useMemo(() => dueByDate.get(selectedDate) || [], [dueByDate, selectedDate])
  const assigneeOptions = useMemo(() => {
    const names = (userProfiles || [])
      .map((profile) => (profile.username || profile.email || '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [userProfiles])

  const goMonth = (delta) => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))
  }

  const resetToday = () => {
    const now = new Date()
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(toIsoDate(now))
  }

  return (
    <main className="page-container">
      <header className="section-header">
        <div className="section-header__top">
          <div>
            <p className="eyebrow">{t('calendar.eyebrow')}</p>
            <h1 className="section-title">{t('calendar.title')}</h1>
            <p className="section-subtitle">{t('calendar.subtitle')}</p>
          </div>
        </div>
      </header>

      {error ? (
        <div className="banner banner-error">
          {t('common.errorPrefix')} {error}
        </div>
      ) : null}
      {loading ? <div className="banner">{t('common.loading')}</div> : null}

      <section className="panel calendar-panel">
        <div className="panel-head">
          <div className="calendar-month-nav">
            <button
              type="button"
              className="calendar-month-arrow"
              aria-label={t('calendar.prevMonth')}
              onClick={() => goMonth(-1)}
            >
              {'<'}
            </button>
            <h2 className="calendar-month-title">{monthLabel}</h2>
            <button
              type="button"
              className="calendar-month-arrow"
              aria-label={t('calendar.nextMonth')}
              onClick={() => goMonth(1)}
            >
              {'>'}
            </button>
          </div>
          <button type="button" className="btn ghost calendar-today-btn" onClick={resetToday}>
            {t('calendar.today')}
          </button>
        </div>

        <div className="calendar-weekdays">
          {i18n.calendar.weekDays.map((label) => (
            <div key={label} className="calendar-weekday">
              {label}
            </div>
          ))}
        </div>

        <div className="calendar-grid">
          {monthGrid.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} className="calendar-day empty" />
            return (
              <button
                type="button"
                key={cell.iso}
                className={`calendar-day${cell.isToday ? ' is-today' : ''}${cell.isSelected ? ' is-selected' : ''}`}
                onClick={() => setSelectedDate(cell.iso)}
              >
                <span className="calendar-day__num">{cell.day}</span>
                {cell.dueCount ? <span className="calendar-day__due">{cell.dueCount}</span> : null}
              </button>
            )
          })}
        </div>
      </section>

      <section className="panel calendar-due-panel">
        <div className="panel-head">
          <h2>
            {t('calendar.dueItems')} - {selectedDate}
          </h2>
          <span className="pill">{selectedItems.length}</span>
        </div>

        {!selectedItems.length ? (
          <p className="muted">{t('calendar.noDueItems')}</p>
        ) : (
          <div className="ticket-list">
            {selectedItems.map((ticket) => (
              <div key={ticket.id} className="ticket-row clickable" onClick={() => setSelectedTicket(ticket)}>
                <div className="ticket-head">
                  <div className="ticket-client">{ticket.clientName || t('tickets.unknownClient')}</div>
                  <span className={`ticket-priority ${ticket.priority}`}>{priorityLabel(ticket.priority)}</span>
                </div>
                <div className="ticket-desc">{ticket.description || t('tickets.noDescription')}</div>
                <div className="ticket-meta">
                  {ticket.assignedTo ? <span>{t('tickets.assigneePrefix')} {ticket.assignedTo}</span> : null}
                  {ticket.taskContext?.type === 'utalando' ? (
                    <span className="ticket-task-link">
                      {t('tickets.taskLinkPrefix')} {t('tickets.taskUtalandoForMonth', { monthKey: ticket.taskContext.monthKey || '' })}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedTicketLive ? (
        <Modal onClose={() => setSelectedTicket(null)} title={t('tickets.detailsTitle')}>
          <TicketModal
            ticket={selectedTicketLive}
            onClose={() => setSelectedTicket(null)}
            currentUser={currentUser}
            assigneeOptions={assigneeOptions}
          />
        </Modal>
      ) : null}
    </main>
  )
}

export default CalendarPage
