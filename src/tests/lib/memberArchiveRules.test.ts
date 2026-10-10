// Unit tests for the member archive and permanent-delete refusals.

import { describe, it, expect } from 'vitest'
import {
  AGAPAY_HISTORY_EXISTS,
  archiveBlockReason,
  deleteBlockReason,
  DISCIPLES_ASSIGNED,
  type MemberDeleteFacts,
} from '../../lib/memberArchiveRules'

function facts(overrides: Partial<MemberDeleteFacts> = {}): MemberDeleteFacts {
  return { hasActiveDisciples: false, ledCircleName: null, agapayEnrolled: false, ...overrides }
}

describe('archiveBlockReason', () => {
  it('allows a member with no disciples and no led circle', () => {
    expect(archiveBlockReason(facts())).toBeNull()
  })

  it('refuses a member who still disciples someone', () => {
    expect(archiveBlockReason(facts({ hasActiveDisciples: true }))).toBe(DISCIPLES_ASSIGNED)
    expect(DISCIPLES_ASSIGNED).toBe('Disciples assigned. Reassign them first.')
  })

  it('refuses a member who leads or co-leads an active circle, naming it', () => {
    expect(archiveBlockReason(facts({ ledCircleName: 'Circle A' }))).toBe('Leads Circle A. Change the leader first.')
  })

  it('falls back to a generic name for a blank circle name', () => {
    expect(archiveBlockReason(facts({ ledCircleName: ' ' }))).toBe('Leads a Quest Circle. Change the leader first.')
  })

  it('reports disciples before a led circle', () => {
    expect(archiveBlockReason(facts({ hasActiveDisciples: true, ledCircleName: 'Circle A' }))).toBe(DISCIPLES_ASSIGNED)
  })

  it('ignores Agapay history: archive keeps it', () => {
    expect(archiveBlockReason(facts({ agapayEnrolled: true }))).toBeNull()
  })
})

describe('deleteBlockReason', () => {
  it('allows a member with no disciples, no led circle and no Agapay record', () => {
    expect(deleteBlockReason(facts())).toBeNull()
  })

  it('refuses a member with an Agapay record', () => {
    expect(deleteBlockReason(facts({ agapayEnrolled: true }))).toBe(AGAPAY_HISTORY_EXISTS)
    expect(AGAPAY_HISTORY_EXISTS).toBe('Agapay history exists. Archive instead.')
  })

  it('applies the archive refusals first', () => {
    expect(deleteBlockReason(facts({ agapayEnrolled: true, hasActiveDisciples: true }))).toBe(DISCIPLES_ASSIGNED)
    expect(deleteBlockReason(facts({ agapayEnrolled: true, ledCircleName: 'Circle A' }))).toBe(
      'Leads Circle A. Change the leader first.',
    )
  })
})
