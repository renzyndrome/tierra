// Unit tests for first-timer rules: the stage a booth walk-in gets, and which
// check-ins analytics count as a first visit.

import { describe, it, expect } from 'vitest'
import { walkInStage, isFirstTimerCheckin } from '../../lib/firstTimer'

describe('walkInStage', () => {
  it('gives a first timer the New Friends stage', () => {
    expect(walkInStage(true)).toBe('Newbie')
  })

  it('gives a known attendee the Schooling stage', () => {
    expect(walkInStage(false)).toBe('Growing')
  })

  it('keeps the New Friends default when the answer is unknown', () => {
    expect(walkInStage(undefined)).toBe('Newbie')
  })
})

describe('isFirstTimerCheckin', () => {
  const firstSession = new Map([
    ['m1', 's1'],
    ['m2', 's1'],
  ])

  it('counts a check-in flagged as a first visit', () => {
    expect(isFirstTimerCheckin({ session_id: 's2', member_id: 'm1', is_first_timer: true }, firstSession)).toBe(true)
  })

  it('never counts a check-in flagged as not a first visit, even the first on record', () => {
    expect(isFirstTimerCheckin({ session_id: 's1', member_id: 'm1', is_first_timer: false }, firstSession)).toBe(false)
  })

  it('counts a flagged first visit with no linked member yet', () => {
    expect(isFirstTimerCheckin({ session_id: 's1', member_id: null, is_first_timer: true }, firstSession)).toBe(true)
  })

  it('falls back to the first check-in on record when no flag was recorded', () => {
    expect(isFirstTimerCheckin({ session_id: 's1', member_id: 'm2', is_first_timer: null }, firstSession)).toBe(true)
    expect(isFirstTimerCheckin({ session_id: 's2', member_id: 'm2', is_first_timer: null }, firstSession)).toBe(false)
  })

  it('treats a missing flag field like no flag', () => {
    expect(isFirstTimerCheckin({ session_id: 's1', member_id: 'm2' }, firstSession)).toBe(true)
  })

  it('does not count an unflagged check-in with no linked member', () => {
    expect(isFirstTimerCheckin({ session_id: 's1', member_id: null, is_first_timer: null }, firstSession)).toBe(false)
  })
})
