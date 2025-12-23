import { describe, it, expect } from 'vitest'
import { buildAutoMapping, headerNorm, scoreFieldToColumn } from '../columnMatching'
import { clientImportSchema } from '../../constants/clientImportSchema'

describe('headerNorm', () => {
  it('removes diacritics and punctuation', () => {
    expect(headerNorm('  Ádószám. ')).toBe('adoszam')
    expect(headerNorm('E-mail Cím')).toBe('e mail cim')
  })
})

describe('auto matching', () => {
  const emailField = clientImportSchema.find((f) => f.key === 'email')

  it('scores direct synonyms highly', () => {
    const score = scoreFieldToColumn(emailField, 'Email address')
    expect(score.score).toBeGreaterThan(0.9)
  })

  it('auto maps close fuzzy matches', () => {
    const columns = [
      { id: 'c1', header: 'Name' },
      { id: 'c2', header: 'Telefon szám' },
      { id: 'c3', header: 'E-mail' },
    ]
    const { mapping } = buildAutoMapping(columns, { threshold: 0.8 })
    expect(mapping.email).toBe('c3')
  })
})
