import React from 'react'
import ClientActivityTimeline from '../../../components/ClientActivityTimeline'

export function GeneralTab({ groups, labels, client, fields, formatValue }) {
  return groups.map((group) => (
    <div key={group.title} className="details-section details-section--line">
      <h3>{group.title}</h3>
      <div className="details-grid">
        {group.keys.map((key) => (
          <div key={key} className="details-item">
            <span className="details-label">{labels[key] || key}</span>
            <span className="details-value">{formatValue(key, client[key], fields)}</span>
          </div>
        ))}
      </div>
    </div>
  ))
}

export function NavTab({ labels, client, navKeys, navTest, onReset }) {
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>NAV online számla</h3>

        <div className="details-actions inline">
          <button
            type="button"
            className="btn ghost"
            onClick={navTest.run}
            disabled={!navTest.canTest || navTest.status === 'running'}
            title={!navTest.canTest ? 'Hiányzó NAV adatok (felhasználónév, jelszó, aláírókulcs).' : 'NAV kapcsolat teszt'}
          >
            {navTest.status === 'running' ? 'Teszt folyamatban.' : 'Kapcsolat teszt'}
          </button>

          {(navTest.status === 'success' || navTest.status === 'error') && (
            <button type="button" className="btn ghost" onClick={onReset} title="Eredmény törlése">
              Reset
            </button>
          )}
        </div>
      </div>

      {navTest.status === 'success' ? (
        <div className="details-banner success">
          NAV kapcsolat OK
          {navTest.result?.checks ? (
            <div className="helper-text">
              {navTest.result.checks.query ? `Lekérdezés: ${navTest.result.checks.query.ok ? 'OK' : 'HIBA'}` : null}
              {navTest.result.checks.tokenExchange
                ? ` TokenExchange: ${navTest.result.checks.tokenExchange.ok ? 'OK' : 'HIBA'}`
                : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {navTest.status === 'error' ? (
        <div className="details-banner error">
          NAV teszt sikertelen
          <div className="helper-text">
            {navTest.error?.errorCode ? (
              <div>
                <b>Kód:</b> {navTest.error.errorCode}
              </div>
            ) : null}
            {navTest.error?.status ? (
              <div>
                <b>HTTP:</b> {navTest.error.status}
              </div>
            ) : null}
            {navTest.error?.message ? (
              <div>
                <b>Üzenet:</b> {navTest.error.message}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="details-grid details-grid-spaced">
        {navKeys.map((key) => (
          <div key={key} className="details-item">
            <span className="details-label">{labels[key] || key}</span>
            <span className="details-value">{client[key] ?? '-'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function InvoicesTab({
  invoiceDirection,
  invoiceRange,
  setInvoiceDirection,
  setInvoiceRange,
  invoicesQuery,
  formatAmount,
}) {
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>Számlák</h3>
        <div className="details-actions inline">
          <label className="filter-control inline-select">
            <span>Irány</span>
            <select value={invoiceDirection} onChange={(e) => setInvoiceDirection(e.target.value)} disabled={invoicesQuery.loading}>
              <option value="OUTBOUND">Kimenő</option>
              <option value="INBOUND">Bejövő</option>
            </select>
          </label>
          <label className="filter-control inline-select">
            <span>Dátum -tól</span>
            <input
              type="date"
              value={invoiceRange.from}
              onChange={(e) => setInvoiceRange((prev) => ({ ...prev, from: e.target.value }))}
              disabled={invoicesQuery.loading}
            />
          </label>
          <label className="filter-control inline-select">
            <span>Dátum -ig</span>
            <input
              type="date"
              value={invoiceRange.to}
              onChange={(e) => setInvoiceRange((prev) => ({ ...prev, to: e.target.value }))}
              disabled={invoicesQuery.loading}
            />
          </label>
          <button
            type="button"
            className="btn ghost"
            onClick={invoicesQuery.refresh}
            disabled={invoicesQuery.loading || !invoicesQuery.hasCreds}
          >
            {invoicesQuery.loading ? 'Betöltés...' : 'Frissítés'}
          </button>
        </div>
      </div>

      {!invoicesQuery.hasCreds ? (
        <div className="details-banner error">
          Hiányzó NAV adatok (felhasználónév, jelszó, aláírókulcs) a lekérdezéshez.
        </div>
      ) : null}

      {invoicesQuery.error ? <div className="details-banner error">Hiba: {invoicesQuery.error}</div> : null}

      <div className="details-grid details-grid-spaced">
        {invoicesQuery.loading ? (
          <p className="muted">Számlák betöltése...</p>
        ) : invoicesQuery.invoices.length ? (
          invoicesQuery.invoices.map((inv) => (
            <div key={inv.invoiceNumber || inv.id} className="meta-card">
              <div className="meta-label">Számlaszám</div>
              <div className="meta-value emphasis">{inv.invoiceNumber || 'Ismeretlen'}</div>
              <div className="meta-label">Dátum</div>
              <div className="meta-value muted">{inv.invoiceIssueDate || inv.insDate || '-'}</div>
              <div className="meta-label">Partner adószám</div>
              <div className="meta-value muted">
                {invoiceDirection === 'OUTBOUND' ? inv.customerTaxNumber || '-' : inv.supplierTaxNumber || '-'}
              </div>
              <div className="meta-label">Bruttó</div>
              <div className="meta-value">{formatAmount(inv.grossAmountHUF || inv.grossAmount, inv.currency)}</div>
              <div className="meta-label">Irány</div>
              <div className="meta-value">{inv.direction || invoiceDirection}</div>
            </div>
          ))
        ) : (
          <p className="muted">Nincs megjeleníthető számla ebben az időszakban.</p>
        )}
      </div>
    </div>
  )
}

export function IncomesTab({ client, formatAmount }) {
  const incomes = Array.isArray(client.monthlyIncomes) ? [...client.monthlyIncomes] : []
  incomes.sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>Bevételek</h3>
      </div>
      {!incomes.length ? (
        <p className="muted">Nincs rögzített bevétel.</p>
      ) : (
        <div className="details-grid details-grid-spaced">
          {incomes.map((row, idx) => (
            <div key={`${row.month || idx}-${row.amount || 0}`} className="meta-card">
              <div className="meta-label">Hónap</div>
              <div className="meta-value emphasis">{row.month || '-'}</div>
              <div className="meta-label">Összeg</div>
              <div className="meta-value">{formatAmount(row.amount || 0, 'HUF')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ActivityTab({ activitiesLoading, activities }) {
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>Aktivitás</h3>
      </div>
      {activitiesLoading ? <p className="muted">Betöltés...</p> : <ClientActivityTimeline activities={activities} />}
    </div>
  )
}

function formatDate(value) {
  if (!value) return '-'
  if (value.toDate) return value.toDate().toISOString().slice(0, 10)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toISOString().slice(0, 10)
}

function findGaps(items, startKey = 'validFrom', endKey = 'validTo') {
  const sorted = [...items].sort((a, b) => {
    const aDate = a[startKey]?.toDate ? a[startKey].toDate() : new Date(a[startKey] || 0)
    const bDate = b[startKey]?.toDate ? b[startKey].toDate() : new Date(b[startKey] || 0)
    return aDate - bDate
  })
  const gaps = []
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = sorted[i - 1][endKey]
    const currentStart = sorted[i][startKey]
    if (prevEnd && currentStart) {
      const prev = prevEnd.toDate ? prevEnd.toDate() : new Date(prevEnd)
      const curr = currentStart.toDate ? currentStart.toDate() : new Date(currentStart)
      if (prev.getTime() + 24 * 60 * 60 * 1000 < curr.getTime()) {
        gaps.push({ from: prevEnd, to: currentStart })
      }
    }
  }
  return gaps
}

export function EvStatusTab({ segments, loading, onAdd, onEdit, onDelete }) {
  const gaps = findGaps(segments, 'validFrom', 'validTo')
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>EV jogi státusz</h3>
        <div className="details-actions inline">
          <button type="button" className="btn" onClick={onAdd}>
            Új időszak
          </button>
        </div>
      </div>

      {gaps.length ? (
        <div className="details-banner warning">Figyelmeztetés: hézagok az időszakok között ({gaps.length}).</div>
      ) : null}

      {loading ? (
        <p className="muted">Betöltés...</p>
      ) : segments.length ? (
        <div className="table">
          <div className="table-head">
            <div>Dátum -tól</div>
            <div>Dátum -ig</div>
            <div>EV jogviszony</div>
            <div>Főfoglalkozás</div>
            <div>Nyugdíjas</div>
            <div>Más munkaviszony</div>
            <div>Művelet</div>
          </div>
          {segments.map((s) => (
            <div key={s.id} className="table-row">
              <div>{formatDate(s.validFrom)}</div>
              <div>{s.validTo ? formatDate(s.validTo) : 'Nyitott'}</div>
              <div>
                {s.isPensioner
                  ? '1343 – Nyugdíjas egyéni vállalkozó'
                  : s.isMainActivity
                    ? '1341 – Főfoglalkozású egyéni vállalkozó'
                    : '1342 – Mellékfoglalkozású egyéni vállalkozó'}
              </div>
              <div>{s.isMainActivity ? 'Igen' : 'Nem'}</div>
              <div>{s.isPensioner ? 'Igen' : 'Nem'}</div>
              <div>{s.hasOtherEmployment ? 'Igen' : 'Nem'}</div>
              <div className="table-actions">
                <button className="link" type="button" onClick={() => onEdit(s)}>
                  Szerkesztés
                </button>
                <button className="link danger" type="button" onClick={() => onDelete(s.id)}>
                  Törlés
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Nincs rögzített időszak.</p>
      )}
    </div>
  )
}

export function EvActivityTab({ periods, loading, onAdd, onEdit, onDelete }) {
  const gaps = findGaps(periods, 'from', 'to')
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>Szüneteltetés / aktivitás</h3>
        <div className="details-actions inline">
          <button type="button" className="btn" onClick={onAdd}>
            Új időszak
          </button>
        </div>
      </div>

      {gaps.length ? (
        <div className="details-banner warning">Figyelmeztetés: hézagok az időszakok között.</div>
      ) : null}

      {loading ? (
        <p className="muted">Betöltés...</p>
      ) : periods.length ? (
        <div className="table">
          <div className="table-head">
            <div>Kezdő dátum</div>
            <div>Záró dátum</div>
            <div>Állapot</div>
            <div>Művelet</div>
          </div>
          {periods.map((p) => (
            <div key={p.id} className="table-row">
              <div>{formatDate(p.from)}</div>
              <div>{p.to ? formatDate(p.to) : 'Nyitott'}</div>
              <div>{p.state === 'SUSPENDED' ? 'Szüneteltetett' : 'Aktív'}</div>
              <div className="table-actions">
                <button className="link" type="button" onClick={() => onEdit(p)}>
                  Szerkesztés
                </button>
                <button className="link danger" type="button" onClick={() => onDelete(p.id)}>
                  Törlés
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Nincs rögzített időszak.</p>
      )}
    </div>
  )
}

export function EvnyCheckTab({
  evnyType,
  evnyValue,
  setEvnyType,
  setEvnyValue,
  onLookup,
  loading,
  error,
  result,
  onClear,
  onApplySuspended,
  onCloseSuspended,
  hasSuspensionCover,
  openSuspended,
}) {
  return (
    <div className="details-section details-section--line">
      <div className="details-header">
        <h3>EVNY Check (Public)</h3>
      </div>
      <div className="details-grid details-grid-spaced">
        <label className="form-field">
          <span>Keresés típusa</span>
          <select value={evnyType} onChange={(e) => setEvnyType(e.target.value)}>
            <option value="TORZSSZAM">TÖRZSSZÁM (adószám első 8)</option>
            <option value="NYILVANTARTASI_SZAM">NYILVÁNTARTÁSI SZÁM</option>
          </select>
        </label>
        <label className="form-field">
          <span>Keresési érték</span>
          <input value={evnyValue} onChange={(e) => setEvnyValue(e.target.value)} placeholder="Pl. 12345678" />
        </label>
      </div>
      <div className="details-actions inline" style={{ marginTop: 10 }}>
        <button className="btn" type="button" onClick={() => onLookup({ type: evnyType, value: evnyValue })} disabled={loading || !evnyValue}>
          {loading ? 'Lekérdezés...' : 'EVNY lekérdezés'}
        </button>
        {result ? (
          <button className="btn ghost" type="button" onClick={onClear}>
            Törlés
          </button>
        ) : null}
      </div>
      {error ? <div className="details-banner error">Hiba: {error}</div> : null}
      {result ? (
        <div className="details-section">
          <div className="details-header">
            <h4>Eredmény</h4>
          </div>
          <div className="details-grid details-grid-spaced">
            <div className="details-item">
              <span className="details-label">Státusz</span>
              <span className="details-value">{result.status || 'Ismeretlen'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Kezdő dátum</span>
              <span className="details-value">{result.startDate || '-'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Szünet kezdete</span>
              <span className="details-value">{result.suspensionStartDate || '-'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Szünet vége</span>
              <span className="details-value">{result.suspensionEndDate || '-'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Név</span>
              <span className="details-value">{result.name || '-'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Cím</span>
              <span className="details-value">{result.address || '-'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Nyilvántartási szám</span>
              <span className="details-value">{result.registryNumber || '-'}</span>
            </div>
            <div className="details-item">
              <span className="details-label">Adószám</span>
              <span className="details-value">{result.taxNumber || '-'}</span>
            </div>
          </div>
          <div className="details-actions inline" style={{ marginTop: 12 }}>
            {result.status === 'SUSPENDED' && result.suspensionStartDate && !hasSuspensionCover(result.suspensionStartDate) ? (
              <button className="btn" type="button" onClick={onApplySuspended} disabled={loading}>
                Felvétel szüneteltetésként
              </button>
            ) : null}
            {result.status === 'ACTIVE' && openSuspended ? (
              <button className="btn ghost" type="button" onClick={onCloseSuspended} disabled={loading}>
                Szüneteltetés lezárása
              </button>
            ) : null}
          </div>
          <p className="muted">Utolsó lekérdezés: {result.fetchedAt || 'most'}</p>
        </div>
      ) : null}
    </div>
  )
}
