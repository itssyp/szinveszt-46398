import { clientImportSchema } from '../constants/clientImportSchema'

export const stripDiacritics = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const headerNorm = (value) =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function levenshtein(a, b) {
  const s = a || ''
  const t = b || ''
  const m = s.length
  const n = t.length
  if (m === 0) return n
  if (n === 0) return m
  const v0 = new Array(n + 1).fill(0)
  const v1 = new Array(n + 1).fill(0)
  for (let i = 0; i <= n; i += 1) v0[i] = i
  for (let i = 0; i < m; i += 1) {
    v1[0] = i + 1
    for (let j = 0; j < n; j += 1) {
      const cost = s[i] === t[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= n; j += 1) v0[j] = v1[j]
  }
  return v1[n]
}

function similarity(a, b) {
  const normA = headerNorm(a)
  const normB = headerNorm(b)
  if (!normA || !normB) return 0
  if (normA === normB) return 1
  const dist = levenshtein(normA, normB)
  const maxLen = Math.max(normA.length, normB.length)
  return Math.max(0, 1 - dist / maxLen)
}

export function scoreFieldToColumn(field, columnHeader) {
  const normHeader = headerNorm(columnHeader)
  const targets = [
    headerNorm(field.label),
    headerNorm(field.key),
    ...field.synonyms.map((s) => headerNorm(s)),
  ].filter(Boolean)

  if (!normHeader) return { score: 0, reason: 'Üres fejléc' }

  if (targets.includes(normHeader)) {
    return { score: 1, reason: 'Szó szerinti egyezés' }
  }

  const best = targets.reduce(
    (acc, target) => {
      const s = similarity(target, normHeader)
      if (s > acc.score) return { score: s, reason: `Hasonlóság: ${target}` }
      return acc
    },
    { score: 0, reason: 'Nincs hasonlóság' }
  )

  return best
}

export function buildAutoMapping(columns, { threshold = 0.82 } = {}) {
  const mapping = {}
  const scores = {}

  clientImportSchema.forEach((field) => {
    let best = { score: 0, columnId: null, reason: '' }
    columns.forEach((col) => {
      const result = scoreFieldToColumn(field, col.header)
      if (result.score > best.score) {
        best = { score: result.score, columnId: col.id, reason: result.reason }
      }
    })
    scores[field.key] = best
    mapping[field.key] = best.score >= threshold ? best.columnId : ''
  })

  return { mapping, scores }
}
