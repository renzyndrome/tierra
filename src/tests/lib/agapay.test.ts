// Unit tests for helpers shared with Agapay (the discipleship app on the same DB).

import { describe, it, expect } from 'vitest'
import {
  agapayCohort,
  savedStageChange,
  disciplerToKeepAfterMove,
  savedWithDiscipler,
  AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT,
  AGAPAY_ENROLL_FAILED_SAVED,
  agapayEnrollFlag,
  enrollFailedAfter,
  todayIsoDate,
  withoutUnchangedAgapayFields,
  withAgapayEnrollNote,
  agapayEnrollFailedCount,
} from '../../lib/agapay'

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

describe('savedWithDiscipler', () => {
  it('is true when the save set a discipler', () => {
    expect(savedWithDiscipler({ discipler_id: 'm-1' }, { discipler_id: 'm-1' })).toBe(true)
  })

  it('is false when the save cleared the discipler', () => {
    expect(savedWithDiscipler({ discipler_id: null }, { discipler_id: null })).toBe(false)
  })

  it('is false when the save did not touch the discipler', () => {
    expect(savedWithDiscipler({ name: 'Ana Cruz' }, { discipler_id: 'm-1' })).toBe(false)
  })

  it('is false when the saved row has no discipler', () => {
    expect(savedWithDiscipler({ discipler_id: 'm-1' }, { discipler_id: null })).toBe(false)
    expect(savedWithDiscipler({ discipler_id: 'm-1' }, null)).toBe(false)
  })
})

describe('withoutUnchangedAgapayFields', () => {
  const loaded = { discipleship_stage: 'Growing', discipler_id: 'disc-1' }
  const form = { name: 'Plain Member', city: 'City', discipleship_stage: 'Growing', discipler_id: 'disc-1' }

  it('drops stage and discipler left as loaded, keeping every other field', () => {
    expect(withoutUnchangedAgapayFields(form, loaded)).toEqual({ name: 'Plain Member', city: 'City' })
  })

  it('keeps a changed stage', () => {
    expect(withoutUnchangedAgapayFields({ ...form, discipleship_stage: 'Leader' }, loaded)).toEqual({
      name: 'Plain Member',
      city: 'City',
      discipleship_stage: 'Leader',
    })
  })

  it('keeps a changed or cleared discipler', () => {
    expect(withoutUnchangedAgapayFields({ ...form, discipler_id: 'disc-2' }, loaded)).toMatchObject({
      discipler_id: 'disc-2',
    })
    const cleared = withoutUnchangedAgapayFields({ ...form, discipler_id: null }, loaded)
    expect('discipler_id' in cleared).toBe(true)
    expect(cleared.discipler_id).toBeNull()
  })

  it('treats a null loaded discipler and a null form discipler as unchanged', () => {
    const out = withoutUnchangedAgapayFields({ ...form, discipler_id: null }, { ...loaded, discipler_id: null })
    expect('discipler_id' in out).toBe(false)
  })

  it('adds nothing when the form carries neither field', () => {
    const onlyName: { name: string; discipleship_stage?: string } = { name: 'Plain Member' }
    expect(withoutUnchangedAgapayFields(onlyName, loaded)).toEqual({ name: 'Plain Member' })
  })
})

describe('savedStageChange', () => {
  it('returns the change when the save wrote a different stage', () => {
    expect(savedStageChange({ discipleship_stage: 'Growing' }, 'Newbie', { discipleship_stage: 'Growing' })).toEqual({
      from: 'Newbie',
      to: 'Growing',
    })
  })

  it('is null for the same stage', () => {
    expect(savedStageChange({ discipleship_stage: 'Growing' }, 'Growing', { discipleship_stage: 'Growing' })).toBeNull()
  })

  it('is null when the stage was not written', () => {
    expect(savedStageChange({ name: 'Plain Member' }, 'Newbie', { discipleship_stage: 'Growing' })).toBeNull()
  })

  it('is null without a stage read before the save or a saved row', () => {
    expect(savedStageChange({ discipleship_stage: 'Growing' }, null, { discipleship_stage: 'Growing' })).toBeNull()
    expect(savedStageChange({ discipleship_stage: 'Growing' }, 'Newbie', null)).toBeNull()
  })
})

describe('agapayEnrollFlag', () => {
  it('sets the flag only when an enrollment ran', () => {
    expect(agapayEnrollFlag(undefined)).toEqual({})
    expect(agapayEnrollFlag('failed')).toEqual({ agapayEnrollFailed: true })
    for (const ok of ['enrolled', 'repaired', 'already_enrolled', 'not_eligible']) {
      expect(agapayEnrollFlag(ok)).toEqual({ agapayEnrollFailed: false })
    }
  })
})

describe('enrollFailedAfter', () => {
  it('takes the last enrollment that ran', () => {
    expect(enrollFailedAfter(false, { agapayEnrollFailed: true })).toBe(true)
    expect(enrollFailedAfter(true, { agapayEnrollFailed: false })).toBe(false)
  })

  it('keeps the previous state when no enrollment ran', () => {
    expect(enrollFailedAfter(true, {})).toBe(true)
    expect(enrollFailedAfter(false, {})).toBe(false)
    expect(enrollFailedAfter(true, null)).toBe(true)
    expect(enrollFailedAfter(false, undefined)).toBe(false)
  })
})

describe('enrollment warning copy', () => {
  it('reports the save, the failure and the next step', () => {
    expect(AGAPAY_ENROLL_FAILED_SAVED).toBe('Saved. Agapay enrollment failed. Save again to retry.')
    expect(AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT).toBe('Agapay enrollment failed. Save on the Edit Member page to retry.')
  })
})

describe('disciplerToKeepAfterMove', () => {
  // A circle move on the edit page: leaving the old circle clears a discipler
  // who leads it, and joining the new one gives its leader.
  it('keeps a discipler the admin changed in the same save', () => {
    expect(disciplerToKeepAfterMove({ discipler_id: 'new-leader' }, { discipler_id: 'new-leader' })).toBe('new-leader')
  })

  it('lets the new circle leader stand when the discipler was left unchanged', () => {
    // The field still held the old leader; the edit page dropped it as unchanged.
    expect(disciplerToKeepAfterMove({ name: 'Ana Cruz' }, { discipler_id: 'old-leader' })).toBeNull()
  })

  it('keeps nothing when the admin cleared the discipler', () => {
    expect(disciplerToKeepAfterMove({ discipler_id: null }, { discipler_id: null })).toBeNull()
  })
})

describe('withAgapayEnrollNote', () => {
  it('keeps the note when the enrollment did not fail', () => {
    expect(withAgapayEnrollNote(null, false)).toBeNull()
    expect(withAgapayEnrollNote('Quest Circle not set. Reason.', false)).toBe('Quest Circle not set. Reason.')
  })

  it('points to the Edit Member page when the enrollment failed', () => {
    expect(withAgapayEnrollNote(null, true)).toBe(AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT)
  })

  it('adds the failure after a circle note', () => {
    expect(withAgapayEnrollNote('Quest Circle not set. Reason.', true)).toBe(
      `Quest Circle not set. Reason. ${AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT}`,
    )
  })
})

describe('agapayEnrollFailedCount', () => {
  it('is null when no enrollment failed', () => {
    expect(agapayEnrollFailedCount(0)).toBeNull()
    expect(agapayEnrollFailedCount(-1)).toBeNull()
  })

  it('counts failures and names the retry', () => {
    expect(agapayEnrollFailedCount(1)).toBe("1 Agapay enrollment failed. Save on the member's Edit page to retry.")
    expect(agapayEnrollFailedCount(4)).toBe("4 Agapay enrollments failed. Save on each member's Edit page to retry.")
  })
})
