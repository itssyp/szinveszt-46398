import { describe, it, expect } from 'vitest'
import { buildDedupIndexes, classifyActions } from './clientImport'

describe('client import dedup', () => {
  it('matches existing clients by adoszam only', () => {
    const dedup = buildDedupIndexes([
      { id: 'existing-1', adoszam: '12345678', email: 'match@example.com', telefonszam: '+36301111111' },
      { id: 'existing-2', adoszam: '87654321', email: 'other@example.com', telefonszam: '+36302222222' },
    ])

    const rows = classifyActions(
      [
        { rowNumber: 2, data: { adoszam: '12345678', email: 'new@example.com', telefonszam: '+36303333333' }, errors: [] },
        { rowNumber: 3, data: { adoszam: '99999999', email: 'match@example.com', telefonszam: '+36301111111' }, errors: [] },
      ],
      dedup
    )

    expect(rows[0].action).toBe('update')
    expect(rows[0].targetId).toBe('existing-1')

    // Even with matching email/phone, tax mismatch must create a new client.
    expect(rows[1].action).toBe('create')
    expect(rows[1].targetId).toBeNull()
  })
})
