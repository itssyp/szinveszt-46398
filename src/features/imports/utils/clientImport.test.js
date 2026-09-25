import { describe, it, expect } from 'vitest'
import { buildDedupIndexes, classifyActions, flagDuplicateTorzs } from './clientImport'

describe('client import dedup', () => {
  it('matches existing clients by torzs only', () => {
    const dedup = buildDedupIndexes([
      { id: 'existing-1', torzs: 'ABC-001', adoszam: '12345678', email: 'match@example.com', telefonszam: '+36301111111' },
      { id: 'existing-2', torzs: 'ABC-002', adoszam: '87654321', email: 'other@example.com', telefonszam: '+36302222222' },
    ])

    const rows = classifyActions(
      [
        { rowNumber: 2, data: { torzs: ' abc-001 ', adoszam: '99999999', email: 'new@example.com', telefonszam: '+36303333333' }, errors: [] },
        { rowNumber: 3, data: { torzs: 'ABC-999', adoszam: '12345678', email: 'match@example.com', telefonszam: '+36301111111' }, errors: [] },
      ],
      dedup
    )

    expect(rows[0].action).toBe('update')
    expect(rows[0].targetId).toBe('existing-1')

    // Even with matching tax/email/phone, torzs mismatch must create a new client.
    expect(rows[1].action).toBe('create')
    expect(rows[1].targetId).toBeNull()
  })

  it('blocks every row with a duplicate torzs within the workbook', () => {
    const rows = flagDuplicateTorzs([
      { rowNumber: 2, data: { torzs: 'ABC-001' }, errors: [] },
      { rowNumber: 3, data: { torzs: ' abc-001 ' }, errors: [] },
      { rowNumber: 4, data: { torzs: 'ABC-002' }, errors: [] },
    ])

    expect(rows[0].errors).toHaveLength(1)
    expect(rows[1].errors).toHaveLength(1)
    expect(rows[2].errors).toHaveLength(0)
  })
})
