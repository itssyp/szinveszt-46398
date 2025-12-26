import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_DATE = new Date(8640000000000000)

function normalizeDate(input) {
  if (!input) return null
  const d = input instanceof Date ? new Date(input) : new Date(String(input))
  if (Number.isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

function toTimestamp(date) {
  const d = normalizeDate(date)
  return d ? Timestamp.fromDate(d) : null
}

function hasOverlap(ranges, start, end, ignoreId) {
  const endDate = end || MAX_DATE
  return ranges.some((r) => {
    if (ignoreId && r.id === ignoreId) return false
    const rStart = normalizeDate(r.validFrom || r.from)
    const rEnd = normalizeDate(r.validTo || r.to) || MAX_DATE
    if (!rStart) return false
    const startsBeforeEnd = rStart <= endDate
    const endsAfterStart = start <= rEnd
    return startsBeforeEnd && endsAfterStart
  })
}

async function getExistingDocs(path, orderField) {
  const q = query(collection(db, path), orderBy(orderField, 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createEvStatusSegment(clientId, payload) {
  if (!clientId) throw new Error('Missing client id.')
  const start = normalizeDate(payload.validFrom)
  const end = payload.validTo ? normalizeDate(payload.validTo) : null
  if (!start) throw new Error('Valid start date required.')
  if (end && start > end) throw new Error('Start date cannot be after end date.')

  const path = `clients/${clientId}/evStatusSegments`
  const existing = await getExistingDocs(path, 'validFrom')
  const open = existing.find((s) => !s.validTo)
  const toCheck = open ? existing.filter((s) => s.id !== open.id) : existing

  if (hasOverlap(toCheck, start, end, null)) {
    throw new Error('Overlapping EV status interval.')
  }

  const batch = writeBatch(db)
  if (open) {
    const openStart = normalizeDate(open.validFrom)
    if (openStart && start > openStart) {
      const closeDate = new Date(start.getTime() - ONE_DAY_MS)
      batch.update(doc(db, path, open.id), {
        validTo: toTimestamp(closeDate),
        updatedAt: serverTimestamp(),
      })
    } else {
      throw new Error('Open interval exists; close it or pick a later start date.')
    }
  }

  const ref = doc(collection(db, path))
  batch.set(ref, {
    validFrom: toTimestamp(start),
    validTo: end ? toTimestamp(end) : null,
    isMainActivity: Boolean(payload.isMainActivity),
    isPensioner: Boolean(payload.isPensioner),
    hasOtherEmployment: Boolean(payload.hasOtherEmployment),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  return ref.id
}

export async function updateEvStatusSegment(clientId, segmentId, payload) {
  if (!clientId || !segmentId) throw new Error('Missing id.')
  const start = normalizeDate(payload.validFrom)
  const end = payload.validTo ? normalizeDate(payload.validTo) : null
  if (!start) throw new Error('Valid start date required.')
  if (end && start > end) throw new Error('Start date cannot be after end date.')

  const path = `clients/${clientId}/evStatusSegments`
  const existing = await getExistingDocs(path, 'validFrom')
  if (hasOverlap(existing, start, end, segmentId)) {
    throw new Error('Overlapping EV status interval.')
  }

  const ref = doc(db, path, segmentId)
  const batch = writeBatch(db)
  batch.update(ref, {
    validFrom: toTimestamp(start),
    validTo: end ? toTimestamp(end) : null,
    isMainActivity: Boolean(payload.isMainActivity),
    isPensioner: Boolean(payload.isPensioner),
    hasOtherEmployment: Boolean(payload.hasOtherEmployment),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function deleteEvStatusSegment(clientId, segmentId) {
  if (!clientId || !segmentId) return
  await deleteDoc(doc(db, `clients/${clientId}/evStatusSegments`, segmentId))
}

export async function createEvActivityPeriod(clientId, payload) {
  if (!clientId) throw new Error('Missing client id.')
  const start = normalizeDate(payload.from)
  const end = payload.to ? normalizeDate(payload.to) : null
  if (!start) throw new Error('Valid start date required.')
  if (end && start > end) throw new Error('Start date cannot be after end date.')

  const path = `clients/${clientId}/evActivityPeriods`
  const existing = await getExistingDocs(path, 'from')
  const open = existing.find((p) => !p.to)
  const toCheck = open ? existing.filter((p) => p.id !== open.id) : existing

  if (hasOverlap(toCheck, start, end, null)) {
    throw new Error('Overlapping activity/suspension interval.')
  }

  const batch = writeBatch(db)
  if (open) {
    const openStart = normalizeDate(open.from)
    if (openStart && start > openStart) {
      const closeDate = new Date(start.getTime() - ONE_DAY_MS)
      batch.update(doc(db, path, open.id), {
        to: toTimestamp(closeDate),
        updatedAt: serverTimestamp(),
      })
    } else {
      throw new Error('Open interval exists; close it or pick a later start date.')
    }
  }

  const ref = doc(collection(db, path))
  batch.set(ref, {
    from: toTimestamp(start),
    to: end ? toTimestamp(end) : null,
    state: payload.state || 'ACTIVE',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
  return ref.id
}

export async function updateEvActivityPeriod(clientId, periodId, payload) {
  if (!clientId || !periodId) throw new Error('Missing id.')
  const start = normalizeDate(payload.from)
  const end = payload.to ? normalizeDate(payload.to) : null
  if (!start) throw new Error('Valid start date required.')
  if (end && start > end) throw new Error('Start date cannot be after end date.')

  const path = `clients/${clientId}/evActivityPeriods`
  const existing = await getExistingDocs(path, 'from')
  if (hasOverlap(existing, start, end, periodId)) {
    throw new Error('Overlapping activity/suspension interval.')
  }

  const ref = doc(db, path, periodId)
  const batch = writeBatch(db)
  batch.update(ref, {
    from: toTimestamp(start),
    to: end ? toTimestamp(end) : null,
    state: payload.state || 'ACTIVE',
    updatedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function deleteEvActivityPeriod(clientId, periodId) {
  if (!clientId || !periodId) return
  await deleteDoc(doc(db, `clients/${clientId}/evActivityPeriods`, periodId))
}

export function getEvStatusForDate(segments, date) {
  const target = normalizeDate(date)
  if (!target) return null
  return (
    segments.find((s) => {
      const start = normalizeDate(s.validFrom)
      const end = normalizeDate(s.validTo) || MAX_DATE
      return start && start <= target && target <= end
    }) || null
  )
}

export function getEvActivityStateForDate(periods, date) {
  const target = normalizeDate(date)
  if (!target) return 'ACTIVE'
  const match =
    periods.find((p) => {
      const start = normalizeDate(p.from)
      const end = normalizeDate(p.to) || MAX_DATE
      return start && start <= target && target <= end
    }) || null
  return match?.state || 'ACTIVE'
}
