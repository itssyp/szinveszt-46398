import { describe, expect, it } from 'vitest'
import { clientExportSchema } from './clientExport'

describe('client export schema', () => {
  it('omits all NAV credential fields from ordinary exports', () => {
    const keys = clientExportSchema.map((field) => field.key)
    expect(keys).not.toContain('navOnlineUser')
    expect(keys).not.toContain('navOnlinePassword')
    expect(keys).not.toContain('navOnlineSignerKey')
    expect(keys).not.toContain('navOnlineExchangeKey')
    expect(keys).toContain('nev')
  })
})
