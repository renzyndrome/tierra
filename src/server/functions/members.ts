// Quest Laguna Directory - Member Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerSupabaseClient, createServerAdminClient } from '../../lib/supabase'
import type { Member, MemberInsert, MemberUpdate, PaginatedResult } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const memberInsertSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  age: z.number().min(1).max(120).optional().nullable(),
  birthday: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  city: z.string().min(2, 'City must be at least 2 characters').max(50),
  address: z.string().optional().nullable(),
  satellite_id: z.string().uuid().optional().nullable(),
  discipleship_stage: z.enum(['Newbie', 'Growing', 'Leader']),
  membership_status: z.enum(['visitor', 'regular', 'active', 'inactive']).optional(),
  joined_date: z.string().optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  spiritual_description: z.string().max(500).optional().nullable(),
  prayer_needs: z.string().max(500).optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  // Extended fields from spreadsheet integration
  civil_status: z.enum(['single', 'married', 'widowed']).optional().nullable(),
  spouse_name: z.string().optional().nullable(),
  wedding_anniversary: z.string().optional().nullable(),
  num_children: z.number().min(0).optional().nullable(),
  member_category: z.enum(['Kid', 'Student', 'Young Pro', 'Mother', 'Father']).optional().nullable(),
  discipler_id: z.string().uuid().optional().nullable(),
  follow_through: z.enum(['Salvation', 'Prayer', 'Bible and Devotion', 'Transformation', 'Cell and Church']).optional().nullable(),
  discipleship_journey: z.enum(['Consolidations', 'Pre Encounter', 'Encounter', 'Post-Encounter', 'SOD1', 'SOD2', 'SOD3', 'QBS Theology 101', 'QBS Preaching 101']).optional().nullable(),
  leadership_level: z.enum(['Member', 'Disciple Maker', 'Eagle', 'Pastor', 'Head Pastor']).optional(),
  spiritual_name: z.string().optional().nullable(),
  is_vision_keeper: z.boolean().optional(),
  is_full_time: z.boolean().optional(),
  community: z.string().optional().nullable(),
  facebook_url: z.string().url().optional().nullable(),
})

const memberUpdateSchema = memberInsertSchema.partial()

const searchParamsSchema = z.object({
  query: z.string().optional(),
  satelliteId: z.string().uuid().optional(),
  discipleshipStage: z.enum(['Newbie', 'Growing', 'Leader']).optional(),
  membershipStatus: z.enum(['visitor', 'regular', 'active', 'inactive']).optional(),
  needsSupport: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'joined_date', 'created_at']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

// ============================================
// GET MEMBERS (with pagination and filters)
// ============================================

export const getMembers = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof searchParamsSchema>) => searchParamsSchema.parse(data))
  .handler(async ({ data }): Promise<PaginatedResult<Member>> => {
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('members')
      .select('*', { count: 'exact' })
      .eq('is_archived', false)

    // Apply filters
    if (data.query) {
      query = query.or(`name.ilike.%${data.query}%,email.ilike.%${data.query}%,city.ilike.%${data.query}%`)
    }

    if (data.satelliteId) {
      query = query.eq('satellite_id', data.satelliteId)
    }

    if (data.discipleshipStage) {
      query = query.eq('discipleship_stage', data.discipleshipStage)
    }

    if (data.membershipStatus) {
      query = query.eq('membership_status', data.membershipStatus)
    }

    if (data.needsSupport !== undefined) {
      query = query.eq('needs_support', data.needsSupport)
    }

    // Pagination
    const from = (data.page - 1) * data.limit
    const to = from + data.limit - 1

    // Sorting
    query = query
      .order(data.sortBy, { ascending: data.sortOrder === 'asc' })
      .range(from, to)

    const { data: members, error, count } = await query

    if (error) {
      console.error('Error fetching members:', error)
      throw new Error('Failed to fetch members')
    }

    return {
      data: members as Member[],
      pagination: {
        page: data.page,
        limit: data.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / data.limit),
      },
    }
  })

// ============================================
// GET SINGLE MEMBER
// ============================================

export const getMember = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Member | null> => {
    const supabase = createServerSupabaseClient()

    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Error fetching member:', error)
      throw new Error('Failed to fetch member')
    }

    return member as Member
  })

// ============================================
// GET MEMBER WITH RELATIONS
// ============================================

export const getMemberWithRelations = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createServerAdminClient()

    const { data: member, error } = await supabase
      .from('members')
      .select(`
        *,
        satellite:satellites!members_satellite_id_fkey(id, name),
        cell_groups:member_cell_groups(
          role,
          joined_at,
          is_active,
          cell_group:cell_groups(id, name, meeting_day, meeting_time)
        ),
        ministries:member_ministries(
          role,
          joined_at,
          is_active,
          ministry:ministries(id, name, department)
        )
      `)
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching member with relations:', error)
      throw new Error(`Failed to fetch member: ${error.message} (code: ${error.code})`)
    }

    return member
  })

// ============================================
// CREATE MEMBER
// ============================================

export const createMember = createServerFn({ method: 'POST' })
  .inputValidator((data: MemberInsert) => memberInsertSchema.parse(data))
  .handler(async ({ data }): Promise<Member> => {
    const supabase = createServerSupabaseClient()

    const { data: member, error } = await supabase
      .from('members')
      .insert(data)
      .select()
      .single()

    if (error) {
      console.error('Error creating member:', error)
      if (error.code === '23505') {
        throw new Error('A member with this email already exists')
      }
      throw new Error('Failed to create member')
    }

    return member as Member
  })

// ============================================
// UPDATE MEMBER
// ============================================

export const updateMember = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; updates: MemberUpdate }) =>
    z.object({
      id: z.string().uuid(),
      updates: memberUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Member> => {
    const supabase = createServerAdminClient()

    const { data: member, error } = await supabase
      .from('members')
      .update(data.updates)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating member:', error)
      if (error.code === '23505') {
        throw new Error('A member with this email already exists')
      }
      throw new Error('Failed to update member')
    }

    return member as Member
  })

// ============================================
// ARCHIVE MEMBER (soft delete)
// ============================================

export const archiveMember = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('members')
      .update({ is_archived: true })
      .eq('id', data.id)

    if (error) {
      console.error('Error archiving member:', error)
      throw new Error('Failed to archive member')
    }

    return { success: true }
  })

// ============================================
// RESTORE MEMBER
// ============================================

export const restoreMember = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('members')
      .update({ is_archived: false })
      .eq('id', data.id)

    if (error) {
      console.error('Error restoring member:', error)
      throw new Error('Failed to restore member')
    }

    return { success: true }
  })

// ============================================
// DELETE MEMBER (permanent)
// ============================================

export const deleteMember = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('members')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting member:', error)
      throw new Error('Failed to delete member')
    }

    return { success: true }
  })

// ============================================
// GET MEMBER COUNT
// ============================================

export const getMemberCount = createServerFn({ method: 'GET' })
  .handler(async (): Promise<number> => {
    const supabase = createServerSupabaseClient()

    const { count, error } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('is_archived', false)

    if (error) {
      console.error('Error getting member count:', error)
      throw new Error('Failed to get member count')
    }

    return count || 0
  })

// ============================================
// GET ALL MEMBERS (lightweight: id + name only)
// ============================================

export const getAllMembersLite = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ id: string; name: string }[]> => {
    const supabase = createServerAdminClient()

    const { data: members, error } = await supabase
      .from('members')
      .select('id, name')
      .eq('is_archived', false)
      .order('name')

    if (error) {
      console.error('Error fetching members lite:', error)
      throw new Error('Failed to fetch members')
    }

    return members || []
  })

// ============================================
// GET MEMBERS BY SATELLITE
// ============================================

export const getMembersBySatellite = createServerFn({ method: 'GET' })
  .inputValidator((data: { satelliteId: string }) => z.object({ satelliteId: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Member[]> => {
    const supabase = createServerSupabaseClient()

    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('satellite_id', data.satelliteId)
      .eq('is_archived', false)
      .order('name')

    if (error) {
      console.error('Error fetching members by satellite:', error)
      throw new Error('Failed to fetch members')
    }

    return members as Member[]
  })

// ============================================
// SEARCH MEMBERS (simple text search)
// ============================================

export const searchMembers = createServerFn({ method: 'GET' })
  .inputValidator((data: { query: string; limit?: number }) =>
    z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(10),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Member[]> => {
    const supabase = createServerSupabaseClient()

    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('is_archived', false)
      .or(`name.ilike.%${data.query}%,email.ilike.%${data.query}%,city.ilike.%${data.query}%`)
      .order('name')
      .limit(data.limit)

    if (error) {
      console.error('Error searching members:', error)
      throw new Error('Failed to search members')
    }

    return members as Member[]
  })

// ============================================
// UPDATE MEMBER AI FIELDS
// ============================================

export const updateMemberAI = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    id: string
    spiritual_score: number
    spiritual_sentiment: 'struggling' | 'stable' | 'thriving'
    needs_support: boolean
  }) =>
    z.object({
      id: z.string().uuid(),
      spiritual_score: z.number().min(1).max(10),
      spiritual_sentiment: z.enum(['struggling', 'stable', 'thriving']),
      needs_support: z.boolean(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('members')
      .update({
        spiritual_score: data.spiritual_score,
        spiritual_sentiment: data.spiritual_sentiment,
        needs_support: data.needs_support,
      })
      .eq('id', data.id)

    if (error) {
      console.error('Error updating member AI fields:', error)
      throw new Error('Failed to update member AI fields')
    }

    return { success: true }
  })

// ============================================
// GET MEMBERS NEEDING SUPPORT
// ============================================

export const getMembersNeedingSupport = createServerFn({ method: 'GET' })
  .handler(async (): Promise<Member[]> => {
    const supabase = createServerSupabaseClient()

    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('needs_support', true)
      .eq('is_archived', false)
      .order('name')

    if (error) {
      console.error('Error fetching members needing support:', error)
      throw new Error('Failed to fetch members needing support')
    }

    return members as Member[]
  })
