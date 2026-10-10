// Quest Circle membership rules. Pure and dependency-free so they are
// unit-testable; the server functions gather the facts and call these.
//
// A plain member belongs to one circle at a time, and walks with that circle's
// leader (members.discipler_id, which Agapay reads as "who disciples this
// person"). Leaders and co-leaders are not checked: the leader of one circle
// may sit as a member in another.
//
// A team (cell_groups.is_team) is not a discipleship circle. People belong to
// a team on top of their own Quest Circle, so team memberships never count
// for the one-circle rule, and a team never sets or clears a discipler.

import { agapayEnrollFailedCount } from './agapay'

export type CircleRole = 'leader' | 'co_leader' | 'member'

/** True for a team (cell_groups.is_team). null and undefined read as a circle. */
export function isTeam(circle: { is_team?: boolean | null } | null | undefined): boolean {
  return circle?.is_team === true
}

/** Refusal when a circle's leader or co-leader is added to it as a member (same rule as Agapay). */
export const CIRCLE_LEADER_AS_MEMBER = 'Circle leaders cannot join as members.'

export interface CircleAddFacts {
  /** Role requested for the new membership. */
  role: CircleRole
  /** The member being added. When set, a circle leader or co-leader is refused. */
  memberId?: string | null
  /** Name of another active circle where the member is an active plain member, or null. */
  otherActiveMemberCircleName: string | null
  /** The member's current members.discipler_id. */
  disciplerId: string | null
  /** Display name of that discipler, when known. */
  disciplerName: string | null
  /** The target circle's leader_id. */
  leaderId: string | null
  /** The target circle's co_leader_id. */
  coLeaderId: string | null
  /** The target is a team: only the leader check (1 below) applies. */
  isTeam?: boolean
}

/**
 * Why adding this member to the circle is refused, as product copy, or null
 * when the add is allowed.
 *
 * Only role 'member' is checked:
 *  1. the circle's own leader or co-leader cannot join it as a member;
 *  2. an active plain membership in another active circle blocks the add;
 *  3. a discipler who is neither this circle's leader nor its co-leader
 *     blocks the add.
 * A team checks 1 only: it is not a discipleship circle, so another circle
 * and the discipler never block joining it.
 */
export function circleAddBlockReason(facts: CircleAddFacts): string | null {
  if (facts.role !== 'member') return null

  if (facts.memberId && (facts.memberId === facts.leaderId || facts.memberId === facts.coLeaderId)) {
    return CIRCLE_LEADER_AS_MEMBER
  }

  if (facts.isTeam) return null

  if (facts.otherActiveMemberCircleName) {
    return `Already in ${facts.otherActiveMemberCircleName}. Remove from that circle first.`
  }

  const { disciplerId, leaderId, coLeaderId } = facts
  if (disciplerId && disciplerId !== leaderId && disciplerId !== coLeaderId) {
    const name = facts.disciplerName?.trim() || 'another discipler'
    return `Walks with ${name}. Change the discipler first.`
  }

  return null
}

/** One of the member's circle memberships, with its circle embedded. */
export interface MembershipWithCircle {
  cell_group_id: string
  role: string
  /** null reads as active: the column defaults to true */
  is_active: boolean | null
  cell_group: { name: string; is_active: boolean | null; is_team?: boolean | null } | null
}

/**
 * Name of the first OTHER circle where the member is an active plain member
 * and the circle itself is active, or null. Memberships in the target circle,
 * inactive memberships, leader/co-leader roles, inactive circles and teams
 * are ignored.
 */
export function otherActiveMemberCircleName(
  memberships: MembershipWithCircle[],
  targetCellGroupId: string,
): string | null {
  const hit = memberships.find(
    (m) =>
      m.cell_group_id !== targetCellGroupId &&
      m.is_active !== false &&
      m.role === 'member' &&
      m.cell_group != null &&
      m.cell_group.is_active !== false &&
      !isTeam(m.cell_group),
  )
  return hit ? hit.cell_group?.name || 'another Quest Circle' : null
}

// ============================================
// MEMBER FORM: DISCIPLER PICKS THE CIRCLE
// ============================================
//
// Choosing a discipler narrows the Quest Circle field to the circles that
// discipler leads or co-leads, the same circles the add rule above accepts.
// A leader may run several circles, so the admin picks one. Teams are never
// offered: team membership is managed on the team's own page.

/** The circle fields the discipler filter reads. */
export interface CircleLeads {
  id: string
  leader_id: string | null
  co_leader_id: string | null
  /** null reads as active: the column defaults to true */
  is_active?: boolean | null
  /** null and undefined read as a circle (not a team) */
  is_team?: boolean | null
}

/** Active circles (not teams) the discipler leads or co-leads, in list order. */
export function circlesLedBy<T extends CircleLeads>(circles: T[], disciplerId: string): T[] {
  return circles.filter(
    (c) =>
      c.is_active !== false &&
      !isTeam(c) &&
      (c.leader_id === disciplerId || c.co_leader_id === disciplerId),
  )
}

/**
 * Circles the member may join as a plain member from the member form: the
 * list without teams and without the circles the member leads or co-leads.
 * No member id (create page) drops the teams only.
 */
export function circlesNotLedBy<T extends CircleLeads>(circles: T[], memberId: string | null | undefined): T[] {
  const notTeams = circles.filter((c) => !isTeam(c))
  if (!memberId) return notTeams
  return notTeams.filter((c) => c.leader_id !== memberId && c.co_leader_id !== memberId)
}

/**
 * Quest Circle field state right after a discipler is picked, given the ids
 * from circlesLedBy (so never a team). One led circle is preselected. Two or
 * more leave the field empty and require a choice ("No Quest Circle" counts
 * as one). None leaves the field empty.
 */
export function circleAfterDisciplerPick(ledCircleIds: string[]): {
  selectedId: string | null
  choiceRequired: boolean
} {
  if (ledCircleIds.length === 1) return { selectedId: ledCircleIds[0], choiceRequired: false }
  return { selectedId: null, choiceRequired: ledCircleIds.length > 1 }
}

/**
 * Quest Circle props for the member form on the create page. Without
 * cell_groups.write (canWriteCircles false) there is no circle field and no
 * wait: the member saves without a circle. While the permission (null) or the
 * circle list loads: 'loading', so the Discipler field waits. A failed list:
 * 'failed' and no circles.
 */
export function createFormCircleProps<T>(
  canWriteCircles: boolean | null,
  listLoad: 'loading' | 'loaded' | 'failed',
  circles: T[],
): { cellGroups: T[] | undefined; circlesLoad: 'loading' | 'failed' | undefined } {
  if (canWriteCircles === false) return { cellGroups: undefined, circlesLoad: undefined }
  if (listLoad === 'failed') return { cellGroups: undefined, circlesLoad: 'failed' }
  if (canWriteCircles === null || listLoad === 'loading') return { cellGroups: circles, circlesLoad: 'loading' }
  return { cellGroups: circles, circlesLoad: undefined }
}

// ============================================
// MEMBER EDIT: CURRENT CIRCLE
// ============================================

/** One membership row as getMemberWithRelations returns it. */
export interface MemberCircleRow {
  role: string
  /** null reads as active: the column defaults to true */
  is_active: boolean | null
  cell_group: { id: string; is_team?: boolean | null } | null
}

/**
 * The member's active plain-member circle and role, or null. Leader and
 * co-leader rows are ignored: the Quest Circle field on the member form moves
 * plain membership only, so a move never removes a leader from their circle.
 * Team rows are ignored too: a move never takes the member out of a team.
 */
export function activePlainCircle(
  rows: MemberCircleRow[] | null | undefined,
): { cellGroupId: string; role: CircleRole } | null {
  const hit = (rows ?? []).find(
    (r) => r.is_active !== false && r.role === 'member' && r.cell_group?.id && !isTeam(r.cell_group),
  )
  return hit?.cell_group ? { cellGroupId: hit.cell_group.id, role: 'member' } : null
}

// ============================================
// PLACEMENT OUTCOME: NOTE FOR A CLAIM APPROVER
// ============================================

/** Why a placement did not write a membership. */
export type CirclePlacementRefusal = 'already_in_circle' | 'refused' | 'failed'

/** What placing a member in a circle came to (see placeMemberInCircle). */
export type CirclePlacementOutcome =
  | { ok: true }
  | { ok: false; kind: CirclePlacementRefusal; reason: string }

/** Note text when a placement failed on a read or write error. */
export const CIRCLE_PLACEMENT_FAILED_NOTE = 'Quest Circle not set. Add from Admin → Quest Circles.'

/**
 * Note for the approver after a sign-up claim tried to place the person in
 * the claim's circle, or null when there is nothing to report: placed, or
 * already in that circle (an active row of any role, leader and co-leader
 * included). The account link stands either way.
 */
export function claimCircleNote(outcome: CirclePlacementOutcome): string | null {
  if (outcome.ok || outcome.kind === 'already_in_circle') return null
  if (outcome.kind === 'failed') return CIRCLE_PLACEMENT_FAILED_NOTE
  return `Quest Circle not set. ${outcome.reason}`
}

/** True when the member is the circle's leader or co-leader. */
export function leadsCircle(
  memberId: string,
  circle: { leader_id: string | null; co_leader_id: string | null } | null,
): boolean {
  return circle != null && (circle.leader_id === memberId || circle.co_leader_id === memberId)
}

// ============================================
// CIRCLE LEADER CHANGE: WHO MOVES
// ============================================
//
// A new leader takes over the plain members who walked with the old leader.
// Members with any other discipler stay as they are.

/** A leader change worth acting on: both leaders set and different. */
export interface LeaderSwap {
  from: string
  to: string
}

/**
 * The leader change a circle update makes, or null when no member moves:
 * leader_id left out of the update (undefined), no previous leader, the
 * leader cleared (null), or the same leader.
 */
export function leaderSwap(
  previousLeaderId: string | null,
  nextLeaderId: string | null | undefined,
  nextCoLeaderId?: string | null,
): LeaderSwap | null {
  if (!previousLeaderId || !nextLeaderId || previousLeaderId === nextLeaderId) return null
  // The old leader stays on as co-leader: still runs the circle, so their
  // disciples stay with them.
  if (nextCoLeaderId && nextCoLeaderId === previousLeaderId) return null
  return { from: previousLeaderId, to: nextLeaderId }
}

/** One membership row of the circle, with the member's discipler. */
export interface CircleMemberDiscipler {
  member_id: string
  role: string
  /** null reads as active: the column defaults to true */
  is_active: boolean | null
  member: { discipler_id: string | null } | null
}

/**
 * Member ids to move from the old leader to the new one: active plain
 * members whose discipler is the old leader. The new leader is left out
 * (never their own discipler), and each id appears once.
 */
export function membersToMoveOnLeaderSwap(rows: CircleMemberDiscipler[], swap: LeaderSwap): string[] {
  const ids = rows
    .filter(
      (r) =>
        r.is_active !== false &&
        r.role === 'member' &&
        r.member?.discipler_id === swap.from &&
        r.member_id !== swap.to,
    )
    .map((r) => r.member_id)
  return [...new Set(ids)]
}

/** Outcome line when the circle saved but moving members to the new leader failed. */
export const LEADER_SWAP_MOVE_FAILED = "Members not moved to the new leader. Set disciplers on each member's Edit page."

/** Outcome line after a leader change moved members, or null when none moved. */
export function leaderSwapOutcome(movedCount: number, newLeaderName: string | null): string | null {
  if (movedCount <= 0) return null
  const who = newLeaderName?.trim() || 'the new leader'
  return movedCount === 1
    ? `1 member now walks with ${who}.`
    : `${movedCount} members now walk with ${who}.`
}

// ============================================
// DISCIPLER FROM A CIRCLE (join and leave)
// ============================================

/** The circle fields the discipler helpers read. */
export interface CircleLeaders {
  leader_id: string | null
  co_leader_id: string | null
  /** null and undefined read as a circle (not a team) */
  is_team?: boolean | null
}

/**
 * Discipler a plain member gets on joining the circle when they have none:
 * the leader, or the co-leader when the circle has no leader. Never the
 * member themself (a leader of the circle is never their own discipler).
 * None for a team: joining a team never sets a discipler.
 */
export function disciplerFromCircle(circle: CircleLeaders | null, memberId: string): string | null {
  if (!circle || isTeam(circle)) return null
  const pick = circle.leader_id ?? circle.co_leader_id
  return pick && pick !== memberId ? pick : null
}

/**
 * Disciplers a plain member stops walking with on leaving the circle: its
 * leader and co-leader, minus the member themself. The clear only applies
 * while members.discipler_id still equals one of these. None for a team:
 * leaving a team never clears a discipler.
 */
export function disciplersClearedOnLeave(circle: CircleLeaders | null, memberId: string): string[] {
  if (!circle || isTeam(circle)) return []
  const ids = [circle.leader_id, circle.co_leader_id].filter(
    (id): id is string => Boolean(id) && id !== memberId,
  )
  return [...new Set(ids)]
}

// ============================================
// CIRCLE TURNED BACK ON: ONE CIRCLE PER PLAIN MEMBER
// ============================================
//
// An inactive circle keeps its memberships, and its members may join another
// circle meanwhile (inactive circles do not block an add). Turning the circle
// back on would leave them in two circles, so their row here ends.

/** True when a circle update turns an inactive circle (is_active false) back on. */
export function circleReactivated(previousIsActive: boolean | null | undefined, nextIsActive: boolean | null | undefined): boolean {
  return previousIsActive === false && nextIsActive === true
}

/** One of the circle's own membership rows. */
export interface CircleMembershipRow {
  id: string
  member_id: string
  role: string
  /** null reads as active: the column defaults to true */
  is_active: boolean | null
}

/** A membership of the same members elsewhere, with its circle embedded. */
export interface MemberMembershipWithCircle extends MembershipWithCircle {
  member_id: string
}

/**
 * Row ids of the circle's active plain memberships whose member is also an
 * active plain member of another active circle. Leader and co-leader rows
 * are never ended.
 */
export function plainRowsInAnotherCircle(
  circleRows: CircleMembershipRow[],
  otherRows: MemberMembershipWithCircle[],
  cellGroupId: string,
): string[] {
  return circleRows
    .filter((r) => r.is_active !== false && r.role === 'member')
    .filter(
      (r) =>
        otherActiveMemberCircleName(
          otherRows.filter((o) => o.member_id === r.member_id),
          cellGroupId,
        ) !== null,
    )
    .map((r) => r.id)
}

/** Outcome line when the circle saved but ending duplicate memberships failed. */
export const REACTIVATE_DUPLICATES_FAILED = 'Members in two Quest Circles not removed. Remove from the circle page.'

/** Outcome line after a reactivated circle ended members' rows, or null when none ended. */
export function reactivateOutcome(endedCount: number): string | null {
  if (endedCount <= 0) return null
  return endedCount === 1
    ? '1 member removed: already in another Quest Circle.'
    : `${endedCount} members removed: already in another Quest Circle.`
}

/** The circle state a save's follow-up steps depend on (see updateCellGroup). */
export interface CircleSaveState {
  /** The saved row is a team (cell_groups.is_team). */
  isTeam: boolean
  /** leader_id before the save; null when unread or empty. */
  previousLeaderId: string | null
  /** leader_id in the update; undefined when the update leaves it out. */
  nextLeaderId: string | null | undefined
  /** co_leader_id of the saved row. */
  nextCoLeaderId: string | null | undefined
  /** is_active before the save; null when unread. */
  previousIsActive: boolean | null | undefined
  /** is_active of the saved row. */
  nextIsActive: boolean | null | undefined
}

/**
 * Follow-up steps after a circle save: the leader change that moves the old
 * leader's disciples (swap, see leaderSwap), and whether a circle turned
 * back on ends the rows of members already in another circle
 * (endDuplicates, see circleReactivated). A team takes neither step: it is
 * not a discipleship circle.
 */
export function circleSaveFollowUps(state: CircleSaveState): { swap: LeaderSwap | null; endDuplicates: boolean } {
  if (state.isTeam) return { swap: null, endDuplicates: false }
  return {
    swap: leaderSwap(state.previousLeaderId, state.nextLeaderId, state.nextCoLeaderId),
    endDuplicates: circleReactivated(state.previousIsActive, state.nextIsActive),
  }
}

/** What a circle update did besides saving the circle (see updateCellGroup). */
export interface CircleSaveEffects {
  membersMoved: number
  membersMoveFailed: boolean
  /** moved members whose Agapay enrollment failed */
  membersEnrollFailed?: number
  duplicatesEnded?: number
  duplicatesEndFailed?: boolean
}

/**
 * Notice above the circle list after a circle save, or null when there is
 * nothing to report. warn is true when any follow-up step failed.
 */
export function circleSaveNotice(
  effects: CircleSaveEffects,
  newLeaderName: string | null,
): { text: string; warn: boolean } | null {
  const lines: string[] = []
  const moveLine = effects.membersMoveFailed
    ? LEADER_SWAP_MOVE_FAILED
    : leaderSwapOutcome(effects.membersMoved, newLeaderName)
  if (moveLine) lines.push(moveLine)
  const enrollLine = agapayEnrollFailedCount(effects.membersEnrollFailed ?? 0)
  if (enrollLine) lines.push(enrollLine)
  const dupLine = effects.duplicatesEndFailed
    ? REACTIVATE_DUPLICATES_FAILED
    : reactivateOutcome(effects.duplicatesEnded ?? 0)
  if (dupLine) lines.push(dupLine)
  if (lines.length === 0) return null
  return {
    text: lines.join(' '),
    warn: effects.membersMoveFailed || Boolean(enrollLine) || Boolean(effects.duplicatesEndFailed),
  }
}

// ============================================
// ARCHIVED MEMBERS
// ============================================

/** Refusal when an archived member is placed in a circle. */
export const MEMBER_ARCHIVED_REFUSAL = 'Member archived. Restore first.'

// ============================================
// MEMBER FORM: DISCIPLER NOT IN THE PICKER
// ============================================

/**
 * The discipler the Quest Circle field narrows by. A discipler missing from
 * the picker list (archived, so getAllMembersLite leaves them out) narrows
 * nothing: the field lists every circle. No list given keeps the discipler.
 */
export function disciplerToNarrowBy(
  disciplerId: string | null,
  listed: { id: string }[] | undefined,
): string | null {
  if (!disciplerId) return null
  if (!listed) return disciplerId
  return listed.some((m) => m.id === disciplerId) ? disciplerId : null
}

/** A circle with its membership rows, as the admin dashboard loads it. */
export interface CircleWithMemberRows {
  is_team?: boolean | null
  members?: { member_id?: string | null; is_active?: boolean | null }[] | null
}

/**
 * Member ids in a Quest Circle, for the Members tab filter: active memberships
 * (null reads as active) of discipleship circles. Teams are not Quest Circles.
 */
export function memberIdsInQuestCircles(circles: readonly CircleWithMemberRows[]): Set<string> {
  const ids = new Set<string>()
  for (const circle of circles) {
    if (circle.is_team === true || !circle.members) continue
    for (const row of circle.members) {
      if (row.is_active === false || !row.member_id) continue
      ids.add(row.member_id)
    }
  }
  return ids
}
