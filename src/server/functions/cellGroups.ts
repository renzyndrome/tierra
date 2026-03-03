// Quest Laguna Directory - Cell Group Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerSupabaseClient, createServerAdminClient } from '../../lib/supabase'
import type { CellGroup, CellGroupInsert, CellGroupUpdate, PaginatedResult, MemberCellGroup } from '../../lib/types'

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

const searchParamsSchema = z.object({
  query: z.string().optional(),
  satelliteId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

// ============================================
// GET CELL GROUPS (with pagination and filters)
// ============================================

export const getCellGroups = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof searchParamsSchema>) => searchParamsSchema.parse(data))
  .handler(async ({ data }): Promise<PaginatedResult<CellGroup>> => {
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('cell_groups')
      .select('*', { count: 'exact' })

    // Apply filters
    if (data.query) {
      query = query.or(`name.ilike.%${data.query}%,description.ilike.%${data.query}%`)
    }

    if (data.satelliteId) {
      query = query.eq('satellite_id', data.satelliteId)
    }

    if (data.isActive !== undefined) {
      query = query.eq('is_active', data.isActive)
    }

    // Pagination
    const from = (data.page - 1) * data.limit
    const to = from + data.limit - 1

    // Sorting
    query = query
      .order(data.sortBy, { ascending: data.sortOrder === 'asc' })
      .range(from, to)

    const { data: groups, error, count } = await query

    if (error) {
      console.error('Error fetching cell groups:', error)
      throw new Error('Failed to fetch cell groups')
    }

    return {
      data: groups as CellGroup[],
      pagination: {
        page: data.page,
        limit: data.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / data.limit),
      },
    }
  })

// ============================================
// GET ALL CELL GROUPS (simple list for dropdowns)
// ============================================

export const getAllCellGroups = createServerFn({ method: 'GET' })
  .inputValidator((data: { activeOnly?: boolean }) =>
    z.object({ activeOnly: z.boolean().optional().default(true) }).parse(data)
  )
  .handler(async ({ data }): Promise<CellGroup[]> => {
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
      throw new Error('Failed to fetch cell groups')
    }

    return groups as CellGroup[]
  })

// ============================================
// GET SINGLE CELL GROUP
// ============================================

export const getCellGroup = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<CellGroup | null> => {
    const supabase = createServerSupabaseClient()

    const { data: group, error } = await supabase
      .from('cell_groups')
      .select('*')
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Error fetching cell group:', error)
      throw new Error('Failed to fetch cell group')
    }

    return group as CellGroup
  })

// ============================================
// GET CELL GROUP WITH RELATIONS
// ============================================

export const getCellGroupWithRelations = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
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
      throw new Error('Failed to fetch cell group')
    }

    return group
  })

// ============================================
// CREATE CELL GROUP
// ============================================

export const createCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: CellGroupInsert) => cellGroupInsertSchema.parse(data))
  .handler(async ({ data }): Promise<CellGroup> => {
    const supabase = createServerAdminClient()

    const { data: group, error } = await supabase
      .from('cell_groups')
      .insert(data)
      .select()
      .single()

    if (error) {
      console.error('Error creating cell group:', error)
      throw new Error('Failed to create cell group')
    }

    return group as CellGroup
  })

// ============================================
// UPDATE CELL GROUP
// ============================================

export const updateCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; updates: CellGroupUpdate }) =>
    z.object({
      id: z.string().uuid(),
      updates: cellGroupUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<CellGroup> => {
    const supabase = createServerAdminClient()

    const { data: group, error } = await supabase
      .from('cell_groups')
      .update(data.updates)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating cell group:', error)
      throw new Error('Failed to update cell group')
    }

    return group as CellGroup
  })

// ============================================
// DELETE CELL GROUP
// ============================================

export const deleteCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('cell_groups')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting cell group:', error)
      throw new Error('Failed to delete cell group')
    }

    return { success: true }
  })

// ============================================
// ADD MEMBER TO CELL GROUP
// ============================================

export const addMemberToCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { memberId: string; cellGroupId: string; role?: 'leader' | 'co_leader' | 'member' }) =>
    z.object({
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
      role: z.enum(['leader', 'co_leader', 'member']).optional().default('member'),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<MemberCellGroup> => {
    const supabase = createServerAdminClient()

    // Check if already a member
    const { data: existing } = await supabase
      .from('member_cell_groups')
      .select('id')
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)
      .single()

    if (existing) {
      throw new Error('Member is already in this cell group')
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
      throw new Error('Failed to add member to cell group')
    }

    return membership as MemberCellGroup
  })

// ============================================
// REMOVE MEMBER FROM CELL GROUP
// ============================================

export const removeMemberFromCellGroup = createServerFn({ method: 'POST' })
  .inputValidator((data: { memberId: string; cellGroupId: string }) =>
    z.object({
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('member_cell_groups')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('member_id', data.memberId)
      .eq('cell_group_id', data.cellGroupId)

    if (error) {
      console.error('Error removing member from cell group:', error)
      throw new Error('Failed to remove member from cell group')
    }

    return { success: true }
  })

// ============================================
// UPDATE MEMBER ROLE IN CELL GROUP
// ============================================

export const updateMemberCellGroupRole = createServerFn({ method: 'POST' })
  .inputValidator((data: { memberId: string; cellGroupId: string; role: 'leader' | 'co_leader' | 'member' }) =>
    z.object({
      memberId: z.string().uuid(),
      cellGroupId: z.string().uuid(),
      role: z.enum(['leader', 'co_leader', 'member']),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
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

// ============================================
// GET CELL GROUP COUNT
// ============================================

export const getCellGroupCount = createServerFn({ method: 'GET' })
  .handler(async (): Promise<number> => {
    const supabase = createServerSupabaseClient()

    const { count, error } = await supabase
      .from('cell_groups')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    if (error) {
      console.error('Error getting cell group count:', error)
      throw new Error('Failed to get cell group count')
    }

    return count || 0
  })

// ============================================
// GET CELL GROUPS BY SATELLITE
// ============================================

export const getCellGroupsBySatellite = createServerFn({ method: 'GET' })
  .inputValidator((data: { satelliteId: string }) => z.object({ satelliteId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<CellGroup[]> => {
    const supabase = createServerSupabaseClient()

    const { data: groups, error } = await supabase
      .from('cell_groups')
      .select('*')
      .eq('satellite_id', data.satelliteId)
      .eq('is_active', true)
      .order('name')

    if (error) {
      console.error('Error fetching cell groups by satellite:', error)
      throw new Error('Failed to fetch cell groups')
    }

    return groups as CellGroup[]
  })
