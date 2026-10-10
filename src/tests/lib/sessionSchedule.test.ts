// Unit tests for the service-session schedule rules (church-local date and the
// "overdue" gate used by QR check-in and the admin badges).

import { describe, it, expect } from 'vitest'
import {
  churchToday,
  isSessionOverdue,
  acceptsQrCheckin,
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
