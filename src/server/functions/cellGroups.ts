// Quest Laguna Directory - Cell Group Server Functions
//
// Every function takes the caller's accessToken. Reads need a signed-in user
// (the same exposure as the table RLS); writes need cell_groups.write and
// deletes cell_groups.delete.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, requirePermission } from './_authGuard'
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
  max_members: z.number().min(2).max(50).optional(),
})

const cellGroupUpdateSchema = cellGroupInsertSchema.partial()

// ============================================
// GET ALL CELL GROUPS (simple list for dropdowns)
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
// GET CELL GROUP WITH RELATIONS
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
// CREATE CELL GROUP
// ============================================

export const createCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: CellGroupInsert & { accessToken: string }) =>
    cellGroupInsertSchema.extend({ accessToken: z.string() }).parse(data)
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
// UPDATE CELL GROUP
// ============================================

export const updateCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; updates: CellGroupUpdate }) =>
    z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      updates: cellGroupUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<CellGroup> => {
    await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

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

    return group as CellGroup
  })

// ============================================
// DELETE CELL GROUP
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
// ADD MEMBER TO CELL GROUP
// ============================================

export const addMemberToCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; memberId: string; cellGroupId: string; role?: 'leader' | 'co_leader' | 'member' }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
      role: z.enum(['leader', 'co_leader', 'member']).optional().default('member'),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<MemberCellGroup> => {
    await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    // Check if already a member
    const { data: existing } = await supabase
      .from('member_cell_groups')
      .select('id')
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)
      .single()

    if (existing) {
      throw new Error('Member is already in this Quest Circle')
    }

    const { data: membership, error } = await supabase
      .from('member_cell_groups')
      .insert({
        member_id: data.memberId,
        cell_group_id: data.cellGroupId,
        role: data.role,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding member to cell group:', error)
      throw new Error('Failed to add member to Quest Circle')
    }

    return membership as MemberCellGroup
  })

// ============================================
// REMOVE MEMBER FROM CELL GROUP
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

    const { error } = await supabase
      .from('member_cell_groups')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)

    if (error) {
      console.error('Error removing member from cell group:', error)
      throw new Error('Failed to remove member from Quest Circle')
    }

    return { success: true }
  })

// ============================================
// UPDATE MEMBER ROLE IN CELL GROUP
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
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'cell_groups.write')
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('member_cell_groups')
      .update({ role: data.role })
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)

    if (error) {
      console.error('Error updating member role:', error)
      throw new Error('Failed to update member role')
    }

    return { success: true }
  })

