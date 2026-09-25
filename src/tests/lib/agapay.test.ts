// Unit tests for helpers shared with Agapay (the discipleship app on the same DB).

import { describe, it, expect } from 'vitest'
import { agapayCohort, todayIsoDate } from '../../lib/agapay'

describe('agapayCohort', () => {
  it('maps each quarter the same way as the Agapay import script', () => {
    expect(agapayCohort('2026-01-15')).toBe('Q1 2026')
    expect(agapayCohort('2026-03-31')).toBe('Q1 2026')
    expect(agapayCohort('2026-04-01')).toBe('Q2 2026')
    expect(agapayCohort('2026-09-23')).toBe('Q3 2026')
    expect(agapayCohort('2026-12-31')).toBe('Q4 2026')
  })

  it('returns null for a missing or unparseable date', () => {
    expect(agapayCohort(null)).toBeNull()
    expect(agapayCohort(undefined)).toBeNull()
    expect(agapayCohort('')).toBeNull()
    expect(agapayCohort('not-a-date')).toBeNull()
  })
})

describe('todayIsoDate', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(todayIsoDate(new Date('2026-09-23T15:30:00Z'))).toBe('2026-09-23')
  })
})
