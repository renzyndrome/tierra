// Quest Laguna Directory - Quest Circle Server Functions
//
// Every function takes the caller's accessToken. Reads need a signed-in user
// (the same exposure as the table RLS); writes need cell_groups.write and
// deletes cell_groups.delete.
//
// A row with is_team true is a team, not a discipleship circle: the circle
// rules (src/lib/circleRules.ts) skip it, and it never sets, clears or moves
// a discipler.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, requirePermission } from './_authGuard'
import { clearDisciplerIfCircleLeader } from '../agapayEnroll'
import {
  changeMemberCircleRole,
  endPlainRowsInAnotherCircle,
  moveDisciplesToNewLeader,
  placeMemberInCircle,
} from '../circlePlacement'
import { circleSaveFollowUps, isTeam } from '../../lib/circleRules'
import { agapayEnrollFlag, type AgapayEnrollFlag } from '../../lib/agapay'
import type { CellGroup, CellGroupInsert, CellGroupUpdate, MemberCellGroup } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const cellGroupInsertSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().nullable(),
  satellite_id: z.string().uuid().optional().nullable(),
  leader_id: z.string().uuid().optional().nullable(),
  co_leader_id: z.string().uuid().optional().nullable(),
  meeting_day: z.enum(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']).optional().nullable(),
  meeting_time: z.string().optional().nullable(),
  meeting_location: z.string().max(200).optional().nullable(),
  is_active: z.boolean().optional(),
  // A team, not a discipleship circle. No .default() here: zod v4
  // .partial() keeps defaults, so the update schema would write false on
  // every update. The create schema below adds the default.
  is_team: z.boolean().optional(),
  max_members: z.number().min(2).max(50).optional(),
})

// A new group is a circle unless is_team is sent as true.
const cellGroupCreateSchema = cellGroupInsertSchema.extend({
  is_team: z.boolean().optional().default(false),
})

const cellGroupUpdateSchema = cellGroupInsertSchema.partial()

// ============================================
// GET ALL QUEST CIRCLES (simple list for dropdowns)
// ============================================

export const getAllCellGroups = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; activeOnly?: boolean }) =>
    z.object({ accessToken: z.string(), activeOnly: z.boolean().optional().default(true) }).parse(data)
  )
  .handler(async ({ data }): Promise<CellGroup[]> => {
    await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    let query = supabase
      .from('cell_groups')
      .select('*')
      .order('name')

    if (data.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: groups, error } = await query

    if (error) {
      console.error('Error fetching cell groups:', error)
      throw new Error('Failed to fetch Quest Circles')
    }

    return groups as CellGroup[]
  })

// ============================================
// GET QUEST CIRCLE WITH RELATIONS
// ============================================

export const getCellGroupWithRelations = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }) => {
    await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    const { data: group, error } = await supabase
      .from('cell_groups')
      .select(`
        *,
        satellite:satellites(id, name),
        leader:members!cell_groups_leader_id_fkey(id, name, photo_url, phone, email),
        co_leader:members!cell_groups_co_leader_id_fkey(id, name, photo_url, phone, email),
        members:member_cell_groups(
          id,
          role,
          joined_at,
          is_active,
          member:members(id, name, photo_url, phone, email, discipleship_stage)
        )
      `)
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching cell group with relations:', error)
      throw new Error('Failed to fetch Quest Circle')
    }

    return group
  })

// ============================================
// CREATE QUEST CIRCLE
// ============================================

export const createCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: CellGroupInsert & { accessToken: string }) =>
    cellGroupCreateSchema.extend({ accessToken: z.string() }).parse(data)
  )
  .handler(async ({ data }): Promise<CellGroup> => {
    const { accessToken, ...insert } = data
    await requirePermission(accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    const { data: group, error } = await supabase
      .from('cell_groups')
      .insert(insert)
      .select()
      .single()

    if (error) {
      console.error('Error creating cell group:', error)
      throw new Error('Failed to create Quest Circle')
    }

    return group as CellGroup
  })

// ============================================
// UPDATE QUEST CIRCLE
// ============================================

/**
 * The saved circle, plus what a leader change did: how many plain members
 * moved from the old leader to the new one, whether that move failed, and
 * how many moved members' Agapay enrollment failed (membersEnrollFailed).
 * A circle turned back on also reports how many plain members left it for
 * being in another active circle (duplicatesEnded), and whether that step
 * failed. The circle itself is saved either way.
 */
export type UpdateCellGroupResult = CellGroup & {
  membersMoved: number
  membersMoveFailed: boolean
  membersEnrollFailed: number
  duplicatesEnded: number
  duplicatesEndFailed: boolean
}

export const updateCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; updates: CellGroupUpdate }) =>
    z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      updates: cellGroupUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<UpdateCellGroupResult> => {
    const caller = await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    // The leader and state before the update: to move the old leader's
    // disciples when the leader changes, and to spot a circle turned back on.
    // Read only when the update sets leader_id or turns the circle on.
    let previousLeaderId: string | null = null
    let previousIsActive: boolean | null = null
    if (data.updates.leader_id !== undefined || data.updates.is_active === true) {
      const { data: before, error: beforeErr } = await supabase
        .from('cell_groups')
        .select('leader_id, is_active')
        .eq('id', data.id)
        .maybeSingle()
      if (beforeErr) {
        console.error('Error reading cell group before update:', beforeErr)
        throw new Error('Failed to update Quest Circle')
      }
      const row = before as unknown as { leader_id: string | null; is_active: boolean | null } | null
      previousLeaderId = row?.leader_id ?? null
      previousIsActive = row?.is_active ?? null
    }

    const { data: group, error } = await supabase
      .from('cell_groups')
      .update(data.updates)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating cell group:', error)
      throw new Error('Failed to update Quest Circle')
    }

    // New leader: plain members who walked with the old leader move to the
    // new one. A cleared leader (null) leaves disciplers as they are, and so
    // does an old leader who stays on as co-leader.
    // Turned back on: members who joined another active circle meanwhile
    // leave this one, so no one is a plain member of two circles.
    // A team (as saved) takes neither step: it is not a discipleship circle.
    const saved = group as CellGroup
    const { swap, endDuplicates } = circleSaveFollowUps({
      isTeam: isTeam(saved),
      previousLeaderId,
      nextLeaderId: data.updates.leader_id,
      nextCoLeaderId: saved.co_leader_id,
      previousIsActive,
      nextIsActive: saved.is_active,
    })
    const move = swap
      ? await moveDisciplesToNewLeader(supabase, data.id, swap, caller.userId)
      : { moved: 0, failed: false, enrollFailed: 0 }

    const dedupe = endDuplicates
      ? await endPlainRowsInAnotherCircle(supabase, data.id)
      : { ended: 0, failed: false }

    return {
      ...(group as CellGroup),
      membersMoved: move.moved,
      membersMoveFailed: move.failed,
      membersEnrollFailed: move.enrollFailed,
      duplicatesEnded: dedupe.ended,
      duplicatesEndFailed: dedupe.failed,
    }
  })

// ============================================
// DELETE QUEST CIRCLE
// ============================================

export const deleteCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'cell_groups.delete')
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('cell_groups')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting cell group:', error)
      throw new Error('Failed to delete Quest Circle')
    }

    return { success: true }
  })

// ============================================
// ADD MEMBER TO QUEST CIRCLE
// ============================================

export const addMemberToCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    accessToken: string
    memberId: string
    cellGroupId: string
    role?: 'leader' | 'co_leader' | 'member'
    /** keep joined_at on a reactivated row (restore after a refused move) */
    preserveJoinedAt?: boolean
  }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
      role: z.enum(['leader', 'co_leader', 'member']).optional().default('member'),
      preserveJoinedAt: z.boolean().optional(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<MemberCellGroup & AgapayEnrollFlag> => {
    const caller = await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    // Archived check, active-row check, circle rules, reactivate or insert,
    // then discipler and Agapay enrollment for a plain member: see
    // placeMemberInCircle. agapayEnrollFailed is set when an enrollment ran.
    const result = await placeMemberInCircle(supabase, {
      memberId: data.memberId,
      cellGroupId: data.cellGroupId,
      role: data.role,
      actorUserId: caller.userId,
      source: 'circle',
      preserveJoinedAt: data.preserveJoinedAt,
    })
    if (!result.ok) throw new Error(result.reason)

    return { ...result.membership, ...agapayEnrollFlag(result.agapayEnroll) }
  })

// ============================================
// REMOVE MEMBER FROM QUEST CIRCLE
// ============================================

export const removeMemberFromCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; memberId: string; cellGroupId: string }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    // Role and state before the removal, to know whether a plain member left.
    const { data: beforeRow, error: beforeErr } = await supabase
      .from('member_cell_groups')
      .select('role, is_active')
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)
      .maybeSingle()
    if (beforeErr) console.error('Error reading cell group membership before removal:', beforeErr)

    const { error } = await supabase
      .from('member_cell_groups')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)

    if (error) {
      console.error('Error removing member from cell group:', error)
      throw new Error('Failed to remove member from Quest Circle')
    }

    // A plain member who leaves no longer walks with this circle's leader.
    // Best-effort, never fails the removal; Agapay rows are kept. Leaving a
    // team clears nothing (clearDisciplerIfCircleLeader reads is_team).
    const removed = beforeRow as unknown as { role: string; is_active: boolean | null } | null
    if (removed?.role === 'member' && removed.is_active !== false) {
      await clearDisciplerIfCircleLeader(supabase, data.memberId, data.cellGroupId)
    }

    return { success: true }
  })

// ============================================
// UPDATE MEMBER ROLE IN QUEST CIRCLE
// ============================================

export const updateMemberCellGroupRole = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; memberId: string; cellGroupId: string; role: 'leader' | 'co_leader' | 'member' }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
      role: z.enum(['leader', 'co_leader', 'member']),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean } & AgapayEnrollFlag> => {
    const caller = await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    // Active row only. A leader or co-leader turned plain member passes the
    // same rules as an add, then gets the discipler and Agapay enrollment:
    // see changeMemberCircleRole. agapayEnrollFailed is set when an
    // enrollment ran.
    const result = await changeMemberCircleRole(supabase, {
      memberId: data.memberId,
      cellGroupId: data.cellGroupId,
      role: data.role,
      actorUserId: caller.userId,
    })
    if (!result.ok) throw new Error(result.reason)

    return { success: true, ...agapayEnrollFlag(result.agapayEnroll) }
  })

