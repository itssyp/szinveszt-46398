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

})

describe('validators', () => {
  it('flags missing required name', () => {
    const field = getField('nev')
    expect(validateField(field, '')).toBeTruthy()
  })

  it('validates email shape', () => {
    const field = getField('email')
    expect(validateField(field, 'not-an-email')).toBe('Érvénytelen e-mail')
    expect(validateField(field, 'ok@example.com')).toBeNull()
  })
})
