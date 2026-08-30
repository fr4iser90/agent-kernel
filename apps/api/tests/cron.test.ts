import { describe, expect, it } from 'vitest'
import { cronMatches } from '../src/infrastructure/cron.js'

describe('cronMatches', () => {
  it('matches every minute', () => {
    expect(cronMatches('* * * * *', new Date('2026-08-30T12:34:00Z'))).toBe(true)
  })

  it('matches specific minute hour', () => {
    const d = new Date('2026-08-30T03:00:00Z')
    expect(cronMatches('0 3 * * *', d)).toBe(true)
    expect(cronMatches('0 4 * * *', d)).toBe(false)
  })

  it('matches step', () => {
    expect(cronMatches('*/15 * * * *', new Date('2026-08-30T12:30:00Z'))).toBe(true)
    expect(cronMatches('*/15 * * * *', new Date('2026-08-30T12:31:00Z'))).toBe(false)
  })
})
