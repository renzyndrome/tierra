// Quest Laguna Directory - Ministry Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerSupabaseClient, createServerAdminClient } from '../../lib/supabase'
import type { Ministry, MinistryInsert, MinistryUpdate, PaginatedResult, MemberMinistry } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const ministryInsertSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  head_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
})

const ministryUpdateSchema = ministryInsertSchema.partial()

const searchParamsSchema = z.object({
  query: z.string().optional(),
  department: z.string().optional(),
  isActive: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'department', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

// ============================================
// GET MINISTRIES (with pagination and filters)
// ============================================

export const getMinistries = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof searchParamsSchema>) => searchParamsSchema.parse(data))
  .handler(async ({ data }): Promise<PaginatedResult<Ministry>> => {
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('ministries')
      .select('*', { count: 'exact' })

    // Apply filters
    if (data.query) {
      query = query.or(`name.ilike.%${data.query}%,description.ilike.%${data.query}%`)
    }

    if (data.department) {
      query = query.eq('department', data.department)
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

    const { data: ministries, error, count } = await query

    if (error) {
      console.error('Error fetching ministries:', error)
      throw new Error('Failed to fetch ministries')
    }

    return {
      data: ministries as Ministry[],
      pagination: {
        page: data.page,
        limit: data.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / data.limit),
      },
    }
  })

// ============================================
// GET ALL MINISTRIES (simple list for dropdowns)
// ============================================

export const getAllMinistries = createServerFn({ method: 'GET' })
  .inputValidator((data: { activeOnly?: boolean }) =>
    z.object({ activeOnly: z.boolean().optional().default(true) }).parse(data)
  )
  .handler(async ({ data }): Promise<Ministry[]> => {
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('ministries')
      .select('*')
      .order('name')

    if (data.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: ministries, error } = await query

    if (error) {
      console.error('Error fetching ministries:', error)
      throw new Error('Failed to fetch ministries')
    }

    return ministries as Ministry[]
  })

// ============================================
// GET SINGLE MINISTRY
// ============================================

export const getMinistry = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Ministry | null> => {
    const supabase = createServerSupabaseClient()

    const { data: ministry, error } = await supabase
      .from('ministries')
      .select('*')
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Error fetching ministry:', error)
      throw new Error('Failed to fetch ministry')
    }

    return ministry as Ministry
  })

// ============================================
// GET MINISTRY WITH RELATIONS
// ============================================

export const getMinistryWithRelations = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createServerSupabaseClient()

    const { data: ministry, error } = await supabase
      .from('ministries')
      .select(`
        *,
        head:members!ministries_head_id_fkey(id, name, photo_url),
        members:member_ministries(
          id,
          role,
          joined_at,
          is_active,
          member:members(id, name, photo_url, phone, email)
        )
      `)
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching ministry with relations:', error)
      throw new Error('Failed to fetch ministry')
    }

    return ministry
  })

// ============================================
// CREATE MINISTRY
// ============================================

export const createMinistry = createServerFn({ method: 'POST' })
  .inputValidator((data: MinistryInsert) => ministryInsertSchema.parse(data))
  .handler(async ({ data }): Promise<Ministry> => {
    const supabase = createServerAdminClient()

    const { data: ministry, error } = await supabase
      .from('ministries')
      .insert(data)
      .select()
      .single()

    if (error) {
      console.error('Error creating ministry:', error)
      throw new Error('Failed to create ministry')
    }

    return ministry as Ministry
  })

// ============================================
// UPDATE MINISTRY
// ============================================

export const updateMinistry = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; updates: MinistryUpdate }) =>
    z.object({
      id: z.string().uuid(),
      updates: ministryUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Ministry> => {
    const supabase = createServerAdminClient()

    const { data: ministry, error } = await supabase
      .from('ministries')
      .update(data.updates)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating ministry:', error)
      throw new Error('Failed to update ministry')
    }

    return ministry as Ministry
  })

// ============================================
// DELETE MINISTRY
// ============================================

export const deleteMinistry = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('ministries')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting ministry:', error)
      throw new Error('Failed to delete ministry')
    }

    return { success: true }
  })

// ============================================
// ADD MEMBER TO MINISTRY
// ============================================

export const addMemberToMinistry = createServerFn({ method: 'POST' })
  .inputValidator((data: { memberId: string; ministryId: string; role?: 'head' | 'coordinator' | 'volunteer' }) =>
    z.object({
      memberId: z.string().uuid(),
      ministryId: z.string().uuid(),
      role: z.enum(['head', 'coordinator', 'volunteer']).optional().default('volunteer'),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<MemberMinistry> => {
    const supabase = createServerAdminClient()

    // Check if already a member (active or inactive)
    const { data: existing } = await supabase
      .from('member_ministries')
      .select('id, is_active')
      .eq('member_id', data.memberId)
      .eq('ministry_id', data.ministryId)
      .single()

    if (existing) {
      if (existing.is_active) {
        throw new Error('Member is already in this ministry')
      }
      // Reactivate previously removed member
      const { data: membership, error } = await supabase
        .from('member_ministries')
        .update({ is_active: true, role: data.role, left_at: null })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        console.error('Error reactivating member in ministry:', error)
        throw new Error('Failed to add member to ministry')
      }

      return membership as MemberMinistry
    }

    const { data: membership, error } = await supabase
      .from('member_ministries')
      .insert({
        member_id: data.memberId,
        ministry_id: data.ministryId,
        role: data.role,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding member to ministry:', error)
      throw new Error('Failed to add member to ministry')
    }

    return membership as MemberMinistry
  })

// ============================================
// REMOVE MEMBER FROM MINISTRY
// ============================================

export const removeMemberFromMinistry = createServerFn({ method: 'POST' })
  .inputValidator((data: { memberId: string; ministryId: string }) =>
    z.object({
      memberId: z.string().uuid(),
      ministryId: z.string().uuid(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('member_ministries')
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq('member_id', data.memberId)
      .eq('ministry_id', data.ministryId)

    if (error) {
      console.error('Error removing member from ministry:', error)
      throw new Error('Failed to remove member from ministry')
    }

    return { success: true }
  })

// ============================================
// UPDATE MEMBER ROLE IN MINISTRY
// ============================================

export const updateMemberMinistryRole = createServerFn({ method: 'POST' })
  .inputValidator((data: { memberId: string; ministryId: string; role: 'head' | 'coordinator' | 'volunteer' }) =>
    z.object({
      memberId: z.string().uuid(),
      ministryId: z.string().uuid(),
      role: z.enum(['head', 'coordinator', 'volunteer']),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('member_ministries')
      .update({ role: data.role })
      .eq('member_id', data.memberId)
      .eq('ministry_id', data.ministryId)

    if (error) {
      console.error('Error updating member role:', error)
      throw new Error('Failed to update member role')
    }

    return { success: true }
  })

// ============================================
// GET MINISTRY COUNT
// ============================================

export const getMinistryCount = createServerFn({ method: 'GET' })
  .handler(async (): Promise<number> => {
    const supabase = createServerSupabaseClient()

    const { count, error } = await supabase
      .from('ministries')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    if (error) {
      console.error('Error getting ministry count:', error)
      throw new Error('Failed to get ministry count')
    }

    return count || 0
  })

// ============================================
// GET DISTINCT DEPARTMENTS
// ============================================

export const getMinistryDepartments = createServerFn({ method: 'GET' })
  .handler(async (): Promise<string[]> => {
    const supabase = createServerSupabaseClient()

    const { data: ministries, error } = await supabase
      .from('ministries')
      .select('department')
      .eq('is_active', true)
      .not('department', 'is', null)

    if (error) {
      console.error('Error fetching ministry departments:', error)
      throw new Error('Failed to fetch departments')
    }

    const departments = [...new Set(ministries.map(m => m.department).filter(Boolean))] as string[]
    return departments.sort()
  })
