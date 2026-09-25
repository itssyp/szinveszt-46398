import { describe, it, expect } from 'vitest'
import { clientImportSchema } from '../../constants/clientImportSchema'
import { normalizeCell, validateField } from '../clientImport'

const getField = (key) => clientImportSchema.find((f) => f.key === key)

describe('normalizers', () => {
  it('normalizes email to lowercase trimmed', () => {
    const field = getField('email')
    const value = normalizeCell(field, '  Test@Example.Com ')
    expect(value).toBe('test@example.com')
  })

  it('keeps empty boolean cell empty', () => {
    const field = getField('navOnlineActive')
    const value = normalizeCell(field, '')
    expect(value).toBe('')
  })

  it('normalizes Excel serial dates without timezone shifting', () => {
    const field = getField('kezdesDatuma')
    const value = normalizeCell(field, 45784)
    expect(value).toBe('2025-05-07')
  })

  it('normalizes Date objects using the local calendar day', () => {
    const field = getField('kezdesDatuma')
    const value = normalizeCell(field, new Date(2025, 4, 7))
    expect(value).toBe('2025-05-07')
  })

  it('normalizes date-only strings without UTC conversion', () => {
    const field = getField('kezdesDatuma')
    expect(normalizeCell(field, '2025-05-07')).toBe('2025-05-07')
    expect(normalizeCell(field, '2025.05.07.')).toBe('2025-05-07')
    expect(normalizeCell(field, '07/05/2025')).toBe('2025-05-07')
  })
})

describe('validators', () => {
  it('does not require name', () => {
    const field = getField('nev')
    expect(validateField(field, '')).toBeNull()
  })

  it('does not require tax number', () => {
    const field = getField('adoszam')
    expect(validateField(field, '')).toBeNull()
  })

  it('flags missing required torzs', () => {
    const field = getField('torzs')
    expect(validateField(field, '')).toBeTruthy()
  })

  it('validates email shape', () => {
    const field = getField('email')
    expect(validateField(field, 'not-an-email')).toBe('Érvénytelen e-mail')
    expect(validateField(field, 'ok@example.com')).toBeNull()
  })
})
