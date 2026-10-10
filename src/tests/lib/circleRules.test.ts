// Unit tests for the Quest Circle membership rules.

import { describe, it, expect } from 'vitest'
import {
  activePlainCircle,
  CIRCLE_PLACEMENT_FAILED_NOTE,
  CIRCLE_LEADER_AS_MEMBER,
  circleAddBlockReason,
  circleAfterDisciplerPick,
  circlesLedBy,
  circlesNotLedBy,
  claimCircleNote,
  leadsCircle,
  leaderSwap,
  leaderSwapOutcome,
  membersToMoveOnLeaderSwap,
  otherActiveMemberCircleName,
  circleReactivated,
  circleSaveFollowUps,
  circleSaveNotice,
  isTeam,
  createFormCircleProps,
  disciplerFromCircle,
  disciplersClearedOnLeave,
  disciplerToNarrowBy,
  LEADER_SWAP_MOVE_FAILED,
  MEMBER_ARCHIVED_REFUSAL,
  plainRowsInAnotherCircle,
  REACTIVATE_DUPLICATES_FAILED,
  reactivateOutcome,
  type CircleMembershipRow,
  type MemberMembershipWithCircle,
  type CircleAddFacts,
  type CircleLeads,
  type CircleMemberDiscipler,
  type MemberCircleRow,
  type MembershipWithCircle,
} from '../../lib/circleRules'

const LEADER = 'leader-1'
const CO_LEADER = 'co-leader-1'
const OTHER_DISCIPLER = 'discipler-9'

function facts(overrides: Partial<CircleAddFacts> = {}): CircleAddFacts {
  return {
    role: 'member',
    otherActiveMemberCircleName: null,
    disciplerId: null,
    disciplerName: null,
    leaderId: LEADER,
    coLeaderId: CO_LEADER,
    ...overrides,
  }
}

describe('circleAddBlockReason', () => {
  it('allows a member with no other circle and no discipler', () => {
    expect(circleAddBlockReason(facts())).toBeNull()
  })

  it('blocks a member who is already a plain member of another circle', () => {
    expect(circleAddBlockReason(facts({ otherActiveMemberCircleName: 'Youth Circle' }))).toBe(
      'Already in Youth Circle. Remove from that circle first.',
    )
  })

  it('blocks a member who walks with someone outside this circle', () => {
    expect(
      circleAddBlockReason(facts({ disciplerId: OTHER_DISCIPLER, disciplerName: 'Ana Cruz' })),
    ).toBe('Walks with Ana Cruz. Change the discipler first.')
  })

  it('falls back to a generic label when the discipler name is unknown', () => {
    expect(circleAddBlockReason(facts({ disciplerId: OTHER_DISCIPLER, disciplerName: null }))).toBe(
      'Walks with another discipler. Change the discipler first.',
    )
  })

  it('allows a member whose discipler is this circle leader', () => {
    expect(circleAddBlockReason(facts({ disciplerId: LEADER, disciplerName: 'Ben Reyes' }))).toBeNull()
  })

  it('allows a member whose discipler is this circle co-leader', () => {
    expect(
      circleAddBlockReason(facts({ disciplerId: CO_LEADER, disciplerName: 'Carla Santos' })),
    ).toBeNull()
  })

  it('reports the other circle before the discipler when both apply', () => {
    expect(
      circleAddBlockReason(
        facts({
          otherActiveMemberCircleName: 'Youth Circle',
          disciplerId: OTHER_DISCIPLER,
          disciplerName: 'Ana Cruz',
        }),
      ),
    ).toBe('Already in Youth Circle. Remove from that circle first.')
  })

  it('blocks any discipler when the circle has no leader or co-leader', () => {
    expect(
      circleAddBlockReason(
        facts({ leaderId: null, coLeaderId: null, disciplerId: OTHER_DISCIPLER, disciplerName: 'Ana Cruz' }),
      ),
    ).toBe('Walks with Ana Cruz. Change the discipler first.')
  })

  it('skips every check for the leader and co-leader roles', () => {
    const blocked = {
      otherActiveMemberCircleName: 'Youth Circle',
      disciplerId: OTHER_DISCIPLER,
      disciplerName: 'Ana Cruz',
    }
    expect(circleAddBlockReason(facts({ role: 'leader', ...blocked }))).toBeNull()
    expect(circleAddBlockReason(facts({ role: 'co_leader', ...blocked }))).toBeNull()
  })
})

describe('otherActiveMemberCircleName', () => {
  const TARGET = 'circle-target'

  function row(overrides: Partial<MembershipWithCircle> = {}): MembershipWithCircle {
    return {
      cell_group_id: 'circle-other',
      role: 'member',
      is_active: true,
      cell_group: { name: 'Youth Circle', is_active: true },
      ...overrides,
    }
  }

  it('returns null with no memberships', () => {
    expect(otherActiveMemberCircleName([], TARGET)).toBeNull()
  })

  it('returns the name of an active plain membership in another active circle', () => {
    expect(otherActiveMemberCircleName([row()], TARGET)).toBe('Youth Circle')
  })

  it('ignores a membership in the target circle itself', () => {
    expect(otherActiveMemberCircleName([row({ cell_group_id: TARGET })], TARGET)).toBeNull()
  })

  it('ignores a removed membership', () => {
    expect(otherActiveMemberCircleName([row({ is_active: false })], TARGET)).toBeNull()
  })

  it('ignores leader and co-leader roles in other circles', () => {
    expect(
      otherActiveMemberCircleName([row({ role: 'leader' }), row({ role: 'co_leader' })], TARGET),
    ).toBeNull()
  })

  it('ignores an inactive circle', () => {
    expect(
      otherActiveMemberCircleName([row({ cell_group: { name: 'Old Circle', is_active: false } })], TARGET),
    ).toBeNull()
  })

  it('ignores a membership whose circle could not be loaded', () => {
    expect(otherActiveMemberCircleName([row({ cell_group: null })], TARGET)).toBeNull()
  })

  it('returns the first matching circle when several apply', () => {
    expect(
      otherActiveMemberCircleName(
        [
          row({ is_active: false, cell_group: { name: 'Old Circle', is_active: true } }),
          row({ cell_group_id: 'circle-a', cell_group: { name: 'Circle A', is_active: true } }),
          row({ cell_group_id: 'circle-b', cell_group: { name: 'Circle B', is_active: true } }),
        ],
        TARGET,
      ),
    ).toBe('Circle A')
  })
})

describe('circlesLedBy', () => {
  const DISCIPLER = 'discipler-1'

  function circle(overrides: Partial<CircleLeads> = {}): CircleLeads {
    return { id: 'circle-1', leader_id: null, co_leader_id: null, is_active: true, ...overrides }
  }

  it('returns circles the discipler leads or co-leads, in list order', () => {
    const circles = [
      circle({ id: 'led', leader_id: DISCIPLER }),
      circle({ id: 'other', leader_id: 'someone-else' }),
      circle({ id: 'co-led', leader_id: 'someone-else', co_leader_id: DISCIPLER }),
    ]
    expect(circlesLedBy(circles, DISCIPLER).map((c) => c.id)).toEqual(['led', 'co-led'])
  })

  it('returns an empty list when the discipler leads no circle', () => {
    expect(circlesLedBy([circle({ leader_id: 'someone-else' })], DISCIPLER)).toEqual([])
  })

  it('skips an inactive circle', () => {
    expect(circlesLedBy([circle({ leader_id: DISCIPLER, is_active: false })], DISCIPLER)).toEqual([])
  })

  it('reads a null active flag as active', () => {
    expect(circlesLedBy([circle({ leader_id: DISCIPLER, is_active: null })], DISCIPLER)).toHaveLength(1)
  })
})

describe('circleAfterDisciplerPick', () => {
  it('preselects the only led circle', () => {
    expect(circleAfterDisciplerPick(['circle-a'])).toEqual({ selectedId: 'circle-a', choiceRequired: false })
  })

  it('preselects nothing and requires a choice with two or more circles', () => {
    expect(circleAfterDisciplerPick(['circle-a', 'circle-b'])).toEqual({ selectedId: null, choiceRequired: true })
  })

  it('leaves the field empty with no choice required when no circle is led', () => {
    expect(circleAfterDisciplerPick([])).toEqual({ selectedId: null, choiceRequired: false })
  })
})

describe('activePlainCircle', () => {
  function row(overrides: Partial<MemberCircleRow> = {}): MemberCircleRow {
    return { role: 'member', is_active: true, cell_group: { id: 'circle-1' }, ...overrides }
  }

  it('returns null with no rows', () => {
    expect(activePlainCircle([])).toBeNull()
    expect(activePlainCircle(undefined)).toBeNull()
  })

  it('returns the active plain-member circle with role member', () => {
    expect(activePlainCircle([row()])).toEqual({ cellGroupId: 'circle-1', role: 'member' })
  })

  it('ignores leader and co-leader rows', () => {
    expect(
      activePlainCircle([
        row({ role: 'leader', cell_group: { id: 'led' } }),
        row({ role: 'co_leader', cell_group: { id: 'co-led' } }),
      ]),
    ).toBeNull()
  })

  it('skips a leader row listed before the plain membership', () => {
    expect(
      activePlainCircle([row({ role: 'leader', cell_group: { id: 'led' } }), row({ cell_group: { id: 'joined' } })]),
    ).toEqual({ cellGroupId: 'joined', role: 'member' })
  })

  it('ignores a removed membership and reads a null active flag as active', () => {
    expect(activePlainCircle([row({ is_active: false })])).toBeNull()
    expect(activePlainCircle([row({ is_active: null })])).toEqual({ cellGroupId: 'circle-1', role: 'member' })
  })

  it('ignores a row whose circle could not be loaded', () => {
    expect(activePlainCircle([row({ cell_group: null })])).toBeNull()
  })
})

describe('claimCircleNote', () => {
  it('says nothing when the person was placed', () => {
    expect(claimCircleNote({ ok: true })).toBeNull()
  })

  it('says nothing when the person already has an active row (leader rows included)', () => {
    expect(
      claimCircleNote({ ok: false, kind: 'already_in_circle', reason: 'Member is already in this Quest Circle' }),
    ).toBeNull()
  })

  it('passes a refusal reason through after the not-set fragment', () => {
    expect(
      claimCircleNote({
        ok: false,
        kind: 'refused',
        reason: 'Already in Youth Circle. Remove from that circle first.',
      }),
    ).toBe('Quest Circle not set. Already in Youth Circle. Remove from that circle first.')
  })

  it('gives the fixed failure note for a read or write error', () => {
    expect(
      claimCircleNote({ ok: false, kind: 'failed', reason: 'Failed to add member to Quest Circle' }),
    ).toBe(CIRCLE_PLACEMENT_FAILED_NOTE)
  })
})

describe('leadsCircle', () => {
  const circle = { leader_id: LEADER, co_leader_id: CO_LEADER }

  it('is true for the leader and the co-leader', () => {
    expect(leadsCircle(LEADER, circle)).toBe(true)
    expect(leadsCircle(CO_LEADER, circle)).toBe(true)
  })

  it('is false for anyone else or a missing circle', () => {
    expect(leadsCircle(OTHER_DISCIPLER, circle)).toBe(false)
    expect(leadsCircle(LEADER, null)).toBe(false)
    expect(leadsCircle(LEADER, { leader_id: null, co_leader_id: null })).toBe(false)
  })
})

describe('leaderSwap', () => {
  it('keeps disciples with an old leader who stays on as co-leader', () => {
    expect(leaderSwap('old-leader', 'new-leader', 'old-leader')).toBeNull()
    expect(leaderSwap('old-leader', 'new-leader', 'someone-else')).toEqual({ from: 'old-leader', to: 'new-leader' })
  })

  it('returns the swap when both leaders are set and differ', () => {
    expect(leaderSwap('old-leader', 'new-leader')).toEqual({ from: 'old-leader', to: 'new-leader' })
  })

  it('returns null when leader_id is not part of the update', () => {
    expect(leaderSwap('old-leader', undefined)).toBeNull()
  })

  it('returns null when the leader is cleared', () => {
    expect(leaderSwap('old-leader', null)).toBeNull()
  })

  it('returns null when there was no previous leader', () => {
    expect(leaderSwap(null, 'new-leader')).toBeNull()
  })

  it('returns null when the leader is unchanged', () => {
    expect(leaderSwap('same-leader', 'same-leader')).toBeNull()
  })
})

describe('membersToMoveOnLeaderSwap', () => {
  const swap = { from: 'old-leader', to: 'new-leader' }

  function row(overrides: Partial<CircleMemberDiscipler> = {}): CircleMemberDiscipler {
    return {
      member_id: 'member-1',
      role: 'member',
      is_active: true,
      member: { discipler_id: 'old-leader' },
      ...overrides,
    }
  }

  it('moves active plain members who walk with the old leader', () => {
    expect(
      membersToMoveOnLeaderSwap([row({ member_id: 'a' }), row({ member_id: 'b', is_active: null })], swap),
    ).toEqual(['a', 'b'])
  })

  it('leaves members with another discipler or none', () => {
    expect(
      membersToMoveOnLeaderSwap(
        [
          row({ member_id: 'a', member: { discipler_id: OTHER_DISCIPLER } }),
          row({ member_id: 'b', member: { discipler_id: null } }),
          row({ member_id: 'c', member: null }),
        ],
        swap,
      ),
    ).toEqual([])
  })

  it('leaves inactive rows and leader or co-leader rows', () => {
    expect(
      membersToMoveOnLeaderSwap(
        [
          row({ member_id: 'a', is_active: false }),
          row({ member_id: 'b', role: 'leader' }),
          row({ member_id: 'c', role: 'co_leader' }),
        ],
        swap,
      ),
    ).toEqual([])
  })

  it('never makes the new leader their own discipler', () => {
    expect(membersToMoveOnLeaderSwap([row({ member_id: 'new-leader' }), row({ member_id: 'a' })], swap)).toEqual([
      'a',
    ])
  })

  it('lists each member once', () => {
    expect(membersToMoveOnLeaderSwap([row({ member_id: 'a' }), row({ member_id: 'a' })], swap)).toEqual(['a'])
  })
})

describe('leaderSwapOutcome', () => {
  it('returns null when no member moved', () => {
    expect(leaderSwapOutcome(0, 'New Leader')).toBeNull()
  })

  it('uses the singular for one member', () => {
    expect(leaderSwapOutcome(1, 'New Leader')).toBe('1 member now walks with New Leader.')
  })

  it('uses the plural for several members', () => {
    expect(leaderSwapOutcome(3, 'New Leader')).toBe('3 members now walk with New Leader.')
  })

  it('falls back when the leader name is unknown', () => {
    expect(leaderSwapOutcome(2, null)).toBe('2 members now walk with the new leader.')
    expect(leaderSwapOutcome(2, '  ')).toBe('2 members now walk with the new leader.')
  })
})

describe('circleAddBlockReason: circle leader as member', () => {
  it('refuses the circle leader joining as a member', () => {
    expect(circleAddBlockReason(facts({ memberId: LEADER }))).toBe(CIRCLE_LEADER_AS_MEMBER)
    expect(CIRCLE_LEADER_AS_MEMBER).toBe('Circle leaders cannot join as members.')
  })

  it('refuses the circle co-leader joining as a member', () => {
    expect(circleAddBlockReason(facts({ memberId: CO_LEADER }))).toBe(CIRCLE_LEADER_AS_MEMBER)
  })

  it('checks the leader rule before the other rules', () => {
    expect(
      circleAddBlockReason(facts({ memberId: LEADER, otherActiveMemberCircleName: 'Youth Circle' })),
    ).toBe(CIRCLE_LEADER_AS_MEMBER)
  })

  it('allows any other member, and skips the check without a member id', () => {
    expect(circleAddBlockReason(facts({ memberId: 'member-1' }))).toBeNull()
    expect(circleAddBlockReason(facts({ memberId: null }))).toBeNull()
  })

  it('does not apply to leader and co-leader roles', () => {
    expect(circleAddBlockReason(facts({ role: 'leader', memberId: LEADER }))).toBeNull()
    expect(circleAddBlockReason(facts({ role: 'co_leader', memberId: CO_LEADER }))).toBeNull()
  })

  it('ignores a circle with no leader or co-leader', () => {
    expect(circleAddBlockReason(facts({ memberId: 'member-1', leaderId: null, coLeaderId: null }))).toBeNull()
  })
})

describe('circlesNotLedBy', () => {
  const circles: CircleLeads[] = [
    { id: 'a', leader_id: 'member-1', co_leader_id: null },
    { id: 'b', leader_id: 'other', co_leader_id: 'member-1' },
    { id: 'c', leader_id: 'other', co_leader_id: null },
    { id: 'd', leader_id: null, co_leader_id: null },
  ]

  it('drops circles the member leads or co-leads, in list order', () => {
    expect(circlesNotLedBy(circles, 'member-1').map((c) => c.id)).toEqual(['c', 'd'])
  })

  it('keeps the whole list without a member id', () => {
    expect(circlesNotLedBy(circles, undefined)).toEqual(circles)
    expect(circlesNotLedBy(circles, null)).toEqual(circles)
  })

  it('keeps the whole list for a member who leads nothing', () => {
    expect(circlesNotLedBy(circles, 'member-2')).toEqual(circles)
  })
})

describe('disciplerFromCircle', () => {
  it('is the leader when the circle has one', () => {
    expect(disciplerFromCircle({ leader_id: LEADER, co_leader_id: CO_LEADER }, 'member-1')).toBe(LEADER)
  })

  it('falls back to the co-leader when the circle has no leader', () => {
    expect(disciplerFromCircle({ leader_id: null, co_leader_id: CO_LEADER }, 'member-1')).toBe(CO_LEADER)
  })

  it('is null for a circle with neither, or no circle', () => {
    expect(disciplerFromCircle({ leader_id: null, co_leader_id: null }, 'member-1')).toBeNull()
    expect(disciplerFromCircle(null, 'member-1')).toBeNull()
  })

  it('never points a member at themself', () => {
    expect(disciplerFromCircle({ leader_id: 'member-1', co_leader_id: CO_LEADER }, 'member-1')).toBeNull()
    expect(disciplerFromCircle({ leader_id: null, co_leader_id: 'member-1' }, 'member-1')).toBeNull()
  })
})

describe('disciplersClearedOnLeave', () => {
  it('is the leader and the co-leader', () => {
    expect(disciplersClearedOnLeave({ leader_id: LEADER, co_leader_id: CO_LEADER }, 'member-1')).toEqual([
      LEADER,
      CO_LEADER,
    ])
  })

  it('drops empty slots, the member themself, and duplicates', () => {
    expect(disciplersClearedOnLeave({ leader_id: null, co_leader_id: CO_LEADER }, 'member-1')).toEqual([CO_LEADER])
    expect(disciplersClearedOnLeave({ leader_id: 'member-1', co_leader_id: CO_LEADER }, 'member-1')).toEqual([
      CO_LEADER,
    ])
    expect(disciplersClearedOnLeave({ leader_id: LEADER, co_leader_id: LEADER }, 'member-1')).toEqual([LEADER])
    expect(disciplersClearedOnLeave(null, 'member-1')).toEqual([])
  })
})

describe('circleReactivated', () => {
  it('is true only for inactive to active', () => {
    expect(circleReactivated(false, true)).toBe(true)
    expect(circleReactivated(true, true)).toBe(false)
    expect(circleReactivated(null, true)).toBe(false)
    expect(circleReactivated(false, false)).toBe(false)
    expect(circleReactivated(false, null)).toBe(false)
    expect(circleReactivated(undefined, true)).toBe(false)
  })
})

describe('plainRowsInAnotherCircle', () => {
  const TARGET = 'circle-target'
  const row = (id: string, member_id: string, overrides: Partial<CircleMembershipRow> = {}): CircleMembershipRow => ({
    id,
    member_id,
    role: 'member',
    is_active: true,
    ...overrides,
  })
  const other = (
    member_id: string,
    overrides: Partial<MemberMembershipWithCircle> = {},
  ): MemberMembershipWithCircle => ({
    member_id,
    cell_group_id: 'circle-other',
    role: 'member',
    is_active: true,
    cell_group: { name: 'Other Circle', is_active: true },
    ...overrides,
  })

  it("ends this circle's row for a member who is in another active circle", () => {
    const rows = [row('row-1', 'm-1'), row('row-2', 'm-2')]
    expect(plainRowsInAnotherCircle(rows, [other('m-1')], TARGET)).toEqual(['row-1'])
  })

  it('reads a null is_active as active on both sides', () => {
    const rows = [row('row-1', 'm-1', { is_active: null })]
    expect(plainRowsInAnotherCircle(rows, [other('m-1', { is_active: null })], TARGET)).toEqual(['row-1'])
  })

  it('ignores inactive circles, inactive rows, leader rows and the circle itself', () => {
    const rows = [row('row-1', 'm-1')]
    expect(plainRowsInAnotherCircle(rows, [other('m-1', { cell_group: { name: 'Off', is_active: false } })], TARGET)).toEqual([])
    expect(plainRowsInAnotherCircle(rows, [other('m-1', { is_active: false })], TARGET)).toEqual([])
    expect(plainRowsInAnotherCircle(rows, [other('m-1', { role: 'leader' })], TARGET)).toEqual([])
    expect(plainRowsInAnotherCircle(rows, [other('m-1', { cell_group_id: TARGET })], TARGET)).toEqual([])
  })

  it("never ends this circle's leader, co-leader or inactive rows", () => {
    const rows = [
      row('row-lead', 'm-1', { role: 'leader' }),
      row('row-co', 'm-2', { role: 'co_leader' }),
      row('row-off', 'm-3', { is_active: false }),
    ]
    expect(plainRowsInAnotherCircle(rows, [other('m-1'), other('m-2'), other('m-3')], TARGET)).toEqual([])
  })
})

describe('reactivateOutcome', () => {
  it('counts the members removed, singular and plural', () => {
    expect(reactivateOutcome(1)).toBe('1 member removed: already in another Quest Circle.')
    expect(reactivateOutcome(2)).toBe('2 members removed: already in another Quest Circle.')
  })

  it('is null when no one was removed', () => {
    expect(reactivateOutcome(0)).toBeNull()
  })
})

describe('circleSaveNotice', () => {
  const none = { membersMoved: 0, membersMoveFailed: false, duplicatesEnded: 0, duplicatesEndFailed: false }

  it('is null when nothing happened', () => {
    expect(circleSaveNotice(none, 'New Leader')).toBeNull()
    expect(circleSaveNotice({ membersMoved: 0, membersMoveFailed: false }, null)).toBeNull()
  })

  it('reports a leader change move', () => {
    expect(circleSaveNotice({ ...none, membersMoved: 3 }, 'New Leader')).toEqual({
      text: '3 members now walk with New Leader.',
      warn: false,
    })
  })

  it('reports members removed on reactivation', () => {
    expect(circleSaveNotice({ ...none, duplicatesEnded: 2 }, null)).toEqual({
      text: '2 members removed: already in another Quest Circle.',
      warn: false,
    })
  })

  it('joins both lines and warns when either step failed', () => {
    expect(circleSaveNotice({ ...none, membersMoved: 1, duplicatesEndFailed: true }, 'New Leader')).toEqual({
      text: `1 member now walks with New Leader. ${REACTIVATE_DUPLICATES_FAILED}`,
      warn: true,
    })
    expect(circleSaveNotice({ ...none, membersMoveFailed: true }, 'New Leader')).toEqual({
      text: LEADER_SWAP_MOVE_FAILED,
      warn: true,
    })
  })

  it('counts failed Agapay enrollments of moved members after the move line, and warns', () => {
    expect(circleSaveNotice({ ...none, membersMoved: 3, membersEnrollFailed: 2 }, 'New Leader')).toEqual({
      text: "3 members now walk with New Leader. 2 Agapay enrollments failed. Save on each member's Edit page to retry.",
      warn: true,
    })
    expect(circleSaveNotice({ ...none, membersMoved: 1, membersEnrollFailed: 1 }, null)).toEqual({
      text: "1 member now walks with the new leader. 1 Agapay enrollment failed. Save on the member's Edit page to retry.",
      warn: true,
    })
  })

  it('reports no enrollment line when none failed', () => {
    expect(circleSaveNotice({ ...none, membersMoved: 2, membersEnrollFailed: 0 }, 'New Leader')).toEqual({
      text: '2 members now walk with New Leader.',
      warn: false,
    })
  })
})

describe('MEMBER_ARCHIVED_REFUSAL', () => {
  it('names what failed and the next step', () => {
    expect(MEMBER_ARCHIVED_REFUSAL).toBe('Member archived. Restore first.')
  })
})

describe('disciplerToNarrowBy', () => {
  const listed = [{ id: 'disc-one' }, { id: 'disc-two' }]

  it('narrows by a listed discipler', () => {
    expect(disciplerToNarrowBy('disc-one', listed)).toBe('disc-one')
  })

  it('narrows by nothing for a discipler missing from the list (archived)', () => {
    expect(disciplerToNarrowBy('disc-archived', listed)).toBeNull()
  })

  it('is null with no discipler, and keeps the discipler when no list is given', () => {
    expect(disciplerToNarrowBy(null, listed)).toBeNull()
    expect(disciplerToNarrowBy('disc-one', undefined)).toBe('disc-one')
  })
})

describe('createFormCircleProps', () => {
  const circles = [{ id: 'circle-a' }]

  it('hides the circle field without cell_groups.write, with no wait', () => {
    expect(createFormCircleProps(false, 'loaded', circles)).toEqual({ cellGroups: undefined, circlesLoad: undefined })
    expect(createFormCircleProps(false, 'loading', circles)).toEqual({ cellGroups: undefined, circlesLoad: undefined })
    expect(createFormCircleProps(false, 'failed', circles)).toEqual({ cellGroups: undefined, circlesLoad: undefined })
  })

  it('waits while the permission or the list loads', () => {
    expect(createFormCircleProps(null, 'loaded', circles)).toEqual({ cellGroups: circles, circlesLoad: 'loading' })
    expect(createFormCircleProps(true, 'loading', circles)).toEqual({ cellGroups: circles, circlesLoad: 'loading' })
  })

  it('passes the list once both are known, and reports a failed list', () => {
    expect(createFormCircleProps(true, 'loaded', circles)).toEqual({ cellGroups: circles, circlesLoad: undefined })
    expect(createFormCircleProps(true, 'failed', circles)).toEqual({ cellGroups: undefined, circlesLoad: 'failed' })
  })
})

// ============================================
// TEAMS (cell_groups.is_team): not discipleship circles
// ============================================

describe('isTeam', () => {
  it('is true only for is_team true', () => {
    expect(isTeam({ is_team: true })).toBe(true)
    expect(isTeam({ is_team: false })).toBe(false)
    expect(isTeam({ is_team: null })).toBe(false)
    expect(isTeam({})).toBe(false)
    expect(isTeam(null)).toBe(false)
    expect(isTeam(undefined)).toBe(false)
  })
})

describe('circleAddBlockReason: teams', () => {
  it('lets a member of another circle join a team', () => {
    expect(circleAddBlockReason(facts({ isTeam: true, otherActiveMemberCircleName: 'Youth Circle' }))).toBeNull()
  })

  it('lets a member who walks with someone outside the team join it', () => {
    expect(
      circleAddBlockReason(facts({ isTeam: true, disciplerId: OTHER_DISCIPLER, disciplerName: 'Other Discipler' })),
    ).toBeNull()
  })

  it("still refuses the team's own leader or co-leader as a member", () => {
    expect(circleAddBlockReason(facts({ isTeam: true, memberId: LEADER }))).toBe(CIRCLE_LEADER_AS_MEMBER)
    expect(circleAddBlockReason(facts({ isTeam: true, memberId: CO_LEADER }))).toBe(CIRCLE_LEADER_AS_MEMBER)
  })

  it('keeps every check for a circle (isTeam false or left out)', () => {
    expect(circleAddBlockReason(facts({ isTeam: false, otherActiveMemberCircleName: 'Youth Circle' }))).toBe(
      'Already in Youth Circle. Remove from that circle first.',
    )
    expect(circleAddBlockReason(facts({ disciplerId: OTHER_DISCIPLER, disciplerName: 'Other Discipler' }))).toBe(
      'Walks with Other Discipler. Change the discipler first.',
    )
  })
})

describe('otherActiveMemberCircleName: teams', () => {
  const TARGET = 'circle-target'
  const teamRow: MembershipWithCircle = {
    cell_group_id: 'team-1',
    role: 'member',
    is_active: true,
    cell_group: { name: 'Worship Team', is_active: true, is_team: true },
  }

  it('ignores a team membership', () => {
    expect(otherActiveMemberCircleName([teamRow], TARGET)).toBeNull()
  })

  it('finds the plain circle listed after a team', () => {
    expect(
      otherActiveMemberCircleName(
        [teamRow, { ...teamRow, cell_group_id: 'circle-b', cell_group: { name: 'Circle B', is_active: true, is_team: false } }],
        TARGET,
      ),
    ).toBe('Circle B')
  })
})

describe('member form circle lists: teams', () => {
  const DISCIPLER = 'discipler-1'
  const circles: CircleLeads[] = [
    { id: 'circle-a', leader_id: DISCIPLER, co_leader_id: null, is_active: true },
    { id: 'team-t', leader_id: DISCIPLER, co_leader_id: null, is_active: true, is_team: true },
    { id: 'circle-b', leader_id: 'someone-else', co_leader_id: null, is_active: true, is_team: null },
    { id: 'team-u', leader_id: 'someone-else', co_leader_id: DISCIPLER, is_active: true, is_team: true },
  ]

  it('circlesLedBy leaves out the teams the discipler leads or co-leads', () => {
    expect(circlesLedBy(circles, DISCIPLER).map((c) => c.id)).toEqual(['circle-a'])
  })

  it('circlesNotLedBy leaves out teams, with or without a member id', () => {
    expect(circlesNotLedBy(circles, null).map((c) => c.id)).toEqual(['circle-a', 'circle-b'])
    expect(circlesNotLedBy(circles, DISCIPLER).map((c) => c.id)).toEqual(['circle-b'])
  })

  it('preselects the one circle a discipler leads when they also lead a team', () => {
    expect(circleAfterDisciplerPick(circlesLedBy(circles, DISCIPLER).map((c) => c.id))).toEqual({
      selectedId: 'circle-a',
      choiceRequired: false,
    })
  })
})

describe('activePlainCircle: teams', () => {
  it('ignores a team row and returns the plain circle', () => {
    const rows: MemberCircleRow[] = [
      { role: 'member', is_active: true, cell_group: { id: 'team-1', is_team: true } },
      { role: 'member', is_active: true, cell_group: { id: 'circle-1', is_team: false } },
    ]
    expect(activePlainCircle(rows)).toEqual({ cellGroupId: 'circle-1', role: 'member' })
  })

  it('returns null for a member only in a team', () => {
    expect(activePlainCircle([{ role: 'member', is_active: true, cell_group: { id: 'team-1', is_team: true } }])).toBeNull()
  })
})

describe('discipler from a team', () => {
  const team = { leader_id: LEADER, co_leader_id: CO_LEADER, is_team: true }

  it('joining a team sets no discipler', () => {
    expect(disciplerFromCircle(team, 'member-1')).toBeNull()
  })

  it('leaving a team clears no discipler', () => {
    expect(disciplersClearedOnLeave(team, 'member-1')).toEqual([])
  })

  it('a circle with is_team false still sets and clears', () => {
    expect(disciplerFromCircle({ ...team, is_team: false }, 'member-1')).toBe(LEADER)
    expect(disciplersClearedOnLeave({ ...team, is_team: false }, 'member-1')).toEqual([LEADER, CO_LEADER])
  })
})

describe('plainRowsInAnotherCircle: teams', () => {
  it('does not end a row for a team membership elsewhere', () => {
    const rows: CircleMembershipRow[] = [{ id: 'row-1', member_id: 'm-1', role: 'member', is_active: true }]
    const other: MemberMembershipWithCircle = {
      member_id: 'm-1',
      cell_group_id: 'team-1',
      role: 'member',
      is_active: true,
      cell_group: { name: 'Worship Team', is_active: true, is_team: true },
    }
    expect(plainRowsInAnotherCircle(rows, [other], 'circle-target')).toEqual([])
  })
})

describe('circleSaveFollowUps', () => {
  const base = {
    isTeam: false,
    previousLeaderId: 'old-leader',
    nextLeaderId: 'new-leader',
    nextCoLeaderId: null,
    previousIsActive: false,
    nextIsActive: true,
  }

  it('moves disciples and ends duplicates for a circle', () => {
    expect(circleSaveFollowUps(base)).toEqual({
      swap: { from: 'old-leader', to: 'new-leader' },
      endDuplicates: true,
    })
  })

  it('takes neither step for a team', () => {
    expect(circleSaveFollowUps({ ...base, isTeam: true })).toEqual({ swap: null, endDuplicates: false })
  })

  it('follows leaderSwap and circleReactivated for a circle', () => {
    expect(circleSaveFollowUps({ ...base, nextLeaderId: undefined, previousIsActive: true })).toEqual({
      swap: null,
      endDuplicates: false,
    })
    expect(circleSaveFollowUps({ ...base, nextCoLeaderId: 'old-leader' }).swap).toBeNull()
  })
})

describe('memberIdsInQuestCircles', () => {
  it('counts active members of discipleship circles only', async () => {
    const { memberIdsInQuestCircles } = await import('../../lib/circleRules')
    const ids = memberIdsInQuestCircles([
      { is_team: false, members: [{ member_id: 'a', is_active: true }, { member_id: 'b', is_active: false }] },
      { is_team: true, members: [{ member_id: 'c', is_active: true }] },
      { members: [{ member_id: 'd', is_active: null }, { member_id: null, is_active: true }] },
      { is_team: false, members: null },
    ])
    expect([...ids].sort()).toEqual(['a', 'd'])
  })
})
