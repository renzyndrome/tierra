// Quest Circle placement — server-only.
//
// One place for the rules that put a member in a circle, shared by the admin
// add (addMemberToCellGroup) and the sign-up claim flow (memberClaims.ts):
//   0. an archived member is refused (any role);
//   1. an ACTIVE row for this member and circle is never changed (any role);
//   2. role 'member' passes circleAddBlockReason (not the circle's own
//      leader or co-leader, one circle per plain member, discipler must lead
//      or co-lead the circle);
//   3. an inactive row is reactivated (is_active, left_at cleared,
//      joined_at now unless preserveJoinedAt), otherwise a row is inserted;
//   4. role 'member' then gets the circle leader (or co-leader when the
//      circle has no leader) as discipler when empty, and is enrolled in
//      Agapay; the enrollment result rides along on the success result.
// A team (cell_groups.is_team) is not a discipleship circle: step 2 checks
// only that the member does not lead it, and step 4 is skipped (no
// discipler, no Agapay enrollment).
// Never throws for a refusal or a database error: the caller decides whether
// that fails its own action.

import { createServerAdminClient } from '../lib/supabase'
import { enrollInAgapayIfEligible, setDisciplerIfEmpty, type AgapayEnrollResult } from './agapayEnroll'
import {
  circleAddBlockReason,
  isTeam,
  MEMBER_ARCHIVED_REFUSAL,
  membersToMoveOnLeaderSwap,
  otherActiveMemberCircleName,
  plainRowsInAnotherCircle,
  type CircleMemberDiscipler,
  type CircleMembershipRow,
  type CirclePlacementRefusal,
  type CircleRole,
  type LeaderSwap,
  type MemberMembershipWithCircle,
  type MembershipWithCircle,
} from '../lib/circleRules'
import type { MemberCellGroup } from '../lib/types'

type AdminClient = ReturnType<typeof createServerAdminClient>

/** Message for any read or write error while adding to a circle. */
export const CIRCLE_ADD_FAILED = 'Failed to add member to Quest Circle'

/** Message when the member already has an active row in the circle. */
export const CIRCLE_ALREADY_IN = 'Member is already in this Quest Circle'

/** Message when a role change finds no active row for the member and circle. */
export const CIRCLE_NOT_IN = 'Member not in this Quest Circle.'

/** Message for any read or write error while changing a circle role. */
export const CIRCLE_ROLE_FAILED = 'Failed to update member role'

export type PlaceInCircleResult =
  | {
      ok: true
      membership: MemberCellGroup
      /** Agapay enrollment after a plain-member add; absent when none ran */
      agapayEnroll?: AgapayEnrollResult
    }
  | { ok: false; kind: CirclePlacementRefusal; reason: string }

export interface PlaceInCircleInput {
  memberId: string
  cellGroupId: string
  role: CircleRole
  /** auth user recorded on the Agapay enrollment audit row */
  actorUserId: string | null
  /** label on the Agapay "Joined Agapay (...)" audit row */
  source?: string
  /**
   * Keep the row's joined_at when an inactive row is reactivated. Used to put
   * a member back in the circle a refused move took them out of.
   */
  preserveJoinedAt?: boolean
}

/** Verdict of the plain-member add rules, and whether the target is a team. */
interface MemberAddCheck {
  /** Refusal message, or null when the add may go ahead. */
  reason: string | null
  /** The target is a team: no discipler and no Agapay enrollment follow. */
  isTeam: boolean
}

/**
 * Gather the facts circleAddBlockReason needs for a plain-member add and
 * return its verdict (the refusal message, or null when the add may go
 * ahead) with whether the target circle is a team.
 * Throws on a failed read, so the add fails instead of skipping the rule.
 */
async function memberAddBlockReason(
  supabase: AdminClient,
  memberId: string,
  cellGroupId: string,
): Promise<MemberAddCheck> {
  const [groupRes, membershipsRes, memberRes] = await Promise.all([
    supabase
      .from('cell_groups')
      .select('leader_id, co_leader_id, is_team')
      .eq('id', cellGroupId)
      .maybeSingle(),
    supabase
      .from('member_cell_groups')
      .select('cell_group_id, role, is_active, cell_group:cell_groups(name, is_active, is_team)')
      .eq('member_id', memberId)
      .not('is_active', 'is', false)
      .eq('role', 'member'),
    supabase
      .from('members')
      .select('discipler_id')
      .eq('id', memberId)
      .maybeSingle(),
  ])

  const readErr = groupRes.error ?? membershipsRes.error ?? memberRes.error
  if (readErr) {
    console.error('Error checking Quest Circle rules:', readErr)
    throw new Error(CIRCLE_ADD_FAILED)
  }

  const group = groupRes.data as unknown as {
    leader_id: string | null
    co_leader_id: string | null
    is_team?: boolean | null
  } | null
  const memberships = (membershipsRes.data ?? []) as unknown as MembershipWithCircle[]
  const disciplerId = (memberRes.data as unknown as { discipler_id: string | null } | null)?.discipler_id ?? null
  const team = isTeam(group)

  // A team never refuses on the discipler, so its name is not needed.
  const disciplerName = disciplerId && !team ? await memberNameOrNull(supabase, disciplerId) : null

  const reason = circleAddBlockReason({
    role: 'member',
    memberId,
    otherActiveMemberCircleName: otherActiveMemberCircleName(memberships, cellGroupId),
    disciplerId,
    disciplerName,
    leaderId: group?.leader_id ?? null,
    coLeaderId: group?.co_leader_id ?? null,
    isTeam: team,
  })
  return { reason, isTeam: team }
}

/** A member's name for a message; null (logged) when the lookup fails. */
async function memberNameOrNull(supabase: AdminClient, memberId: string): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('members')
    .select('name')
    .eq('id', memberId)
    .maybeSingle()
  if (error) console.error('Error loading member name:', error)
  return (row as unknown as { name: string } | null)?.name ?? null
}

/**
 * Put a member in a circle under the circle rules (see the file header).
 * Returns the membership row, or why nothing was written.
 */
export async function placeMemberInCircle(
  supabase: AdminClient,
  input: PlaceInCircleInput,
): Promise<PlaceInCircleResult> {
  const { memberId, cellGroupId, role, actorUserId } = input
  const source = input.source ?? 'circle'

  // An archived member joins no circle until restored.
  const { data: memberRow, error: memberErr } = await supabase
    .from('members')
    .select('is_archived')
    .eq('id', memberId)
    .maybeSingle()
  if (memberErr) {
    console.error('Error checking member before circle add:', memberErr)
    return { ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED }
  }
  if ((memberRow as unknown as { is_archived: boolean | null } | null)?.is_archived === true) {
    return { ok: false, kind: 'refused', reason: MEMBER_ARCHIVED_REFUSAL }
  }

  // Only an ACTIVE membership blocks the add. A removed one (soft-removed,
  // kept for history) is reactivated below: UNIQUE(member_id, cell_group_id)
  // allows one row per member and circle.
  const { data: existingRow, error: existingErr } = await supabase
    .from('member_cell_groups')
    .select('id, is_active')
    .eq('member_id', memberId)
    .eq('cell_group_id', cellGroupId)
    .maybeSingle()

  if (existingErr) {
    console.error('Error checking cell group membership:', existingErr)
    return { ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED }
  }

  const existing = existingRow as unknown as { id: string; is_active: boolean | null } | null
  if (existing && existing.is_active !== false) {
    return { ok: false, kind: 'already_in_circle', reason: CIRCLE_ALREADY_IN }
  }

  // One circle per plain member, walking with that circle's leader or
  // co-leader. Refused before anything is written. A team checks only that
  // the member does not lead it.
  let joinsTeam = false
  if (role === 'member') {
    let check: MemberAddCheck
    try {
      check = await memberAddBlockReason(supabase, memberId, cellGroupId)
    } catch {
      return { ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED }
    }
    if (check.reason) return { ok: false, kind: 'refused', reason: check.reason }
    joinsTeam = check.isTeam
  }

  const write = existing
    ? supabase
        .from('member_cell_groups')
        .update({
          is_active: true,
          left_at: null,
          ...(input.preserveJoinedAt ? {} : { joined_at: new Date().toISOString() }),
          role,
        } as never)
        .eq('id', existing.id)
        .select()
        .single()
    : supabase
        .from('member_cell_groups')
        .insert({
          member_id: memberId,
          cell_group_id: cellGroupId,
          role,
          is_active: true,
        })
        .select()
        .single()

  const { data: membership, error } = await write

  if (error) {
    console.error('Error adding member to cell group:', error)
    return { ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED }
  }

  // A plain member with no discipler walks with the circle's leader (or
  // co-leader when there is no leader), and is enrolled in Agapay.
  // Best-effort, never fails the add, never overwrites an existing discipler.
  // Not for a team: joining one sets no discipler and enrolls no one.
  if (role === 'member' && !joinsTeam) {
    await setDisciplerIfEmpty(supabase, memberId, cellGroupId)
    const agapayEnroll = await enrollInAgapayIfEligible(supabase, memberId, actorUserId, source)
    return { ok: true, membership: membership as MemberCellGroup, agapayEnroll }
  }

  return { ok: true, membership: membership as MemberCellGroup }
}

export interface ChangeCircleRoleInput {
  memberId: string
  cellGroupId: string
  role: CircleRole
  /** auth user recorded on the Agapay enrollment audit row */
  actorUserId: string | null
}

export type ChangeCircleRoleResult =
  | {
      ok: true
      /** Agapay enrollment after a leader or co-leader turned plain member; absent when none ran */
      agapayEnroll?: AgapayEnrollResult
    }
  | { ok: false; kind: Exclude<CirclePlacementRefusal, 'already_in_circle'>; reason: string }

/**
 * Change the role of the member's ACTIVE row in the circle. A leader or
 * co-leader row that becomes 'member' goes through the same rules as a
 * plain-member add (circleAddBlockReason), and afterwards gets the circle
 * leader as discipler when empty and Agapay enrollment, like an add; the
 * enrollment result rides along on the success result. In a team neither
 * follows, as for an add.
 * No active row: refused with CIRCLE_NOT_IN. Never throws.
 */
export async function changeMemberCircleRole(
  supabase: AdminClient,
  input: ChangeCircleRoleInput,
): Promise<ChangeCircleRoleResult> {
  const { memberId, cellGroupId, role, actorUserId } = input

  const { data: row, error: readErr } = await supabase
    .from('member_cell_groups')
    .select('id, role, is_active')
    .eq('member_id', memberId)
    .eq('cell_group_id', cellGroupId)
    .maybeSingle()
  if (readErr) {
    console.error('Error reading cell group membership before role change:', readErr)
    return { ok: false, kind: 'failed', reason: CIRCLE_ROLE_FAILED }
  }

  const current = row as unknown as { id: string; role: string; is_active: boolean | null } | null
  if (!current || current.is_active === false) {
    return { ok: false, kind: 'refused', reason: CIRCLE_NOT_IN }
  }

  // Leader or co-leader becoming a plain member: same checks as an add.
  const becomesPlainMember = role === 'member' && current.role !== 'member'
  let inTeam = false
  if (becomesPlainMember) {
    let check: MemberAddCheck
    try {
      check = await memberAddBlockReason(supabase, memberId, cellGroupId)
    } catch {
      return { ok: false, kind: 'failed', reason: CIRCLE_ROLE_FAILED }
    }
    if (check.reason) return { ok: false, kind: 'refused', reason: check.reason }
    inTeam = check.isTeam
  }

  const { error: writeErr } = await supabase
    .from('member_cell_groups')
    .update({ role } as never)
    .eq('id', current.id)
  if (writeErr) {
    console.error('Error updating member role:', writeErr)
    return { ok: false, kind: 'failed', reason: CIRCLE_ROLE_FAILED }
  }

  if (becomesPlainMember && !inTeam) {
    await setDisciplerIfEmpty(supabase, memberId, cellGroupId)
    const agapayEnroll = await enrollInAgapayIfEligible(supabase, memberId, actorUserId, 'circle')
    return { ok: true, agapayEnroll }
  }

  return { ok: true }
}

/**
 * After a circle's leader changes from swap.from to swap.to: the circle's
 * active plain members who walked with the old leader now walk with the new
 * one, and each moved member is enrolled in Agapay. Never called for a team
 * (circleSaveFollowUps gives no swap). The UPDATE repeats the
 * discipler_id = old leader condition, so a discipler changed in the
 * meantime is left alone. Never throws.
 *
 * @returns how many members moved, whether a read or write failed, and how
 *   many moved members' Agapay enrollment failed
 */
export async function moveDisciplesToNewLeader(
  supabase: AdminClient,
  cellGroupId: string,
  swap: LeaderSwap,
  actorUserId: string | null,
): Promise<{ moved: number; failed: boolean; enrollFailed: number }> {
  try {
    const { data: rows, error: readErr } = await supabase
      .from('member_cell_groups')
      .select('member_id, role, is_active, member:members(discipler_id)')
      .eq('cell_group_id', cellGroupId)
      .eq('role', 'member')
      .not('is_active', 'is', false)
    if (readErr) {
      console.error('Error reading circle members for leader change:', readErr)
      return { moved: 0, failed: true, enrollFailed: 0 }
    }

    const ids = membersToMoveOnLeaderSwap((rows ?? []) as unknown as CircleMemberDiscipler[], swap)
    if (ids.length === 0) return { moved: 0, failed: false, enrollFailed: 0 }

    const { data: updated, error: writeErr } = await supabase
      .from('members')
      .update({ discipler_id: swap.to } as never)
      .in('id', ids)
      .eq('discipler_id', swap.from)
      .select('id')
    if (writeErr) {
      console.error('Error moving circle members to the new leader:', writeErr)
      return { moved: 0, failed: true, enrollFailed: 0 }
    }

    const movedIds = ((updated ?? []) as unknown as { id: string }[]).map((r) => r.id)
    let enrollFailed = 0
    for (const id of movedIds) {
      const enroll = await enrollInAgapayIfEligible(supabase, id, actorUserId, 'circle leader change')
      if (enroll === 'failed') enrollFailed++
    }
    return { moved: movedIds.length, failed: false, enrollFailed }
  } catch (err) {
    console.error('Error moving circle members to the new leader:', err)
    return { moved: 0, failed: true, enrollFailed: 0 }
  }
}

/**
 * After a circle is turned back on (is_active false to true): its active
 * plain members who joined another active circle meanwhile leave this one
 * (soft remove: is_active false, left_at now), so no one is a plain member of
 * two circles. Leader and co-leader rows, disciplers and Agapay rows are
 * untouched. Team memberships elsewhere do not count, and a team turned back
 * on never calls this (circleSaveFollowUps). Never throws.
 *
 * @returns how many rows ended, and whether a read or write failed
 */
export async function endPlainRowsInAnotherCircle(
  supabase: AdminClient,
  cellGroupId: string,
): Promise<{ ended: number; failed: boolean }> {
  try {
    const { data: rows, error: readErr } = await supabase
      .from('member_cell_groups')
      .select('id, member_id, role, is_active')
      .eq('cell_group_id', cellGroupId)
      .eq('role', 'member')
      .not('is_active', 'is', false)
    if (readErr) {
      console.error('Error reading circle members after reactivation:', readErr)
      return { ended: 0, failed: true }
    }

    const circleRows = (rows ?? []) as unknown as CircleMembershipRow[]
    const memberIds = [...new Set(circleRows.map((r) => r.member_id))]
    if (memberIds.length === 0) return { ended: 0, failed: false }

    // The same members' plain rows anywhere; plainRowsInAnotherCircle drops
    // this circle, inactive rows, inactive circles and teams.
    const { data: others, error: othersErr } = await supabase
      .from('member_cell_groups')
      .select('member_id, cell_group_id, role, is_active, cell_group:cell_groups(name, is_active, is_team)')
      .in('member_id', memberIds)
      .eq('role', 'member')
      .not('is_active', 'is', false)
    if (othersErr) {
      console.error('Error reading other circles after reactivation:', othersErr)
      return { ended: 0, failed: true }
    }

    const rowIds = plainRowsInAnotherCircle(
      circleRows,
      (others ?? []) as unknown as MemberMembershipWithCircle[],
      cellGroupId,
    )
    if (rowIds.length === 0) return { ended: 0, failed: false }

    const { data: ended, error: writeErr } = await supabase
      .from('member_cell_groups')
      .update({ is_active: false, left_at: new Date().toISOString() } as never)
      .in('id', rowIds)
      .not('is_active', 'is', false)
      .select('id')
    if (writeErr) {
      console.error('Error ending duplicate circle memberships:', writeErr)
      return { ended: 0, failed: true }
    }
    return { ended: ((ended ?? []) as unknown[]).length, failed: false }
  } catch (err) {
    console.error('Error ending duplicate circle memberships:', err)
    return { ended: 0, failed: true }
  }
}
