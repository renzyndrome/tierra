// Unit tests for the service-session schedule rules (church-local date and the
// "overdue" gate used by QR check-in and the admin badges).

import { describe, it, expect } from 'vitest'
import {
  churchToday,
  isSessionOverdue,
  acceptsQrCheckin,
  addDays,
  autoCloseDate,
  CHURCH_TIME_ZONE,
} from '../../lib/sessionSchedule'

describe('churchToday', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(churchToday(new Date('2026-09-25T04:00:00Z'))).toBe('2026-09-25')
  })

  it('uses Manila time, not UTC (UTC 17:00 is already the next day in Manila)', () => {
    // 2026-09-24 17:00 UTC == 2026-09-25 01:00 Asia/Manila (UTC+8).
    expect(churchToday(new Date('2026-09-24T17:00:00Z'))).toBe('2026-09-25')
  })

  it('stays on the same Manila day until 16:00 UTC', () => {
    // 2026-09-24 15:59 UTC == 2026-09-24 23:59 Asia/Manila.
    expect(churchToday(new Date('2026-09-24T15:59:00Z'))).toBe('2026-09-24')
  })

  it('defaults to the Asia/Manila zone', () => {
    expect(CHURCH_TIME_ZONE).toBe('Asia/Manila')
  })
})

describe('isSessionOverdue', () => {
  it('is false on the session day itself', () => {
    expect(isSessionOverdue('2026-09-25', '2026-09-25')).toBe(false)
  })

  it('is false for a future session', () => {
    expect(isSessionOverdue('2026-09-27', '2026-09-25')).toBe(false)
  })

  it('is true once the session date has passed', () => {
    expect(isSessionOverdue('2026-09-24', '2026-09-25')).toBe(true)
    expect(isSessionOverdue('2026-07-21', '2026-09-25')).toBe(true)
  })
})

describe('acceptsQrCheckin', () => {
  const today = '2026-09-25'

  it('accepts an open session dated today', () => {
    expect(acceptsQrCheckin({ is_open: true, session_date: today }, today)).toBe(true)
  })

  it('refuses a closed session', () => {
    expect(acceptsQrCheckin({ is_open: false, session_date: today }, today)).toBe(false)
  })

  it('refuses an open session whose date has passed', () => {
    expect(acceptsQrCheckin({ is_open: true, session_date: '2026-09-20' }, today)).toBe(false)
  })
})

describe('autoCloseDate', () => {
  it('closes a session more than 3 days after its date', () => {
    // Opened on its own date (Manila), so the date rule decides.
    expect(autoCloseDate({ session_date: '2026-10-16', opened_at: '2026-10-16T09:00:00Z' })).toBe('2026-10-20')
    expect(autoCloseDate({ session_date: '2026-10-16', opened_at: null })).toBe('2026-10-20')
  })

  it('gives a reopened old session 3 more days from the reopen', () => {
    expect(autoCloseDate({ session_date: '2026-07-21', opened_at: '2026-10-16T02:00:00Z' })).toBe('2026-10-20')
  })

  it('uses the Manila date of the reopen', () => {
    // 2026-10-16T20:00Z is Oct 17, 4 AM in Manila.
    expect(autoCloseDate({ session_date: '2026-10-01', opened_at: '2026-10-16T20:00:00Z' })).toBe('2026-10-21')
  })
})

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
