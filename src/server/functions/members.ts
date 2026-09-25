// Quest Laguna Directory - Member Server Functions
//
// Every function takes the caller's accessToken. Reads need a signed-in user
// (the same exposure as the members RLS); writes need members.write and
// permanent deletes members.delete. A member may change their own photo.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, getCallerMemberId, requirePermission } from './_authGuard'
import { pickProvided } from '../../lib/pickProvided'
import { toSafeSearchTerm } from '../../lib/searchTerm'
import type { Member, MemberInsert, MemberUpdate } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const memberInsertSchema = z.object({
  // Only name is truly required
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email').optional().nullable(),
  phone: z.string().optional().nullable(),
  age: z.number().min(1).max(120).optional().nullable(),
  birthday: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  city: z.string().max(50).optional().nullable(),
  address: z.string().optional().nullable(),
  satellite_id: z.string().uuid().optional().nullable(),
  discipleship_stage: z.enum(['Newbie', 'Growing', 'Leader']).default('Newbie'),
  membership_status: z.enum(['visitor', 'regular', 'active', 'inactive']).default('active'),
  joined_date: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  spiritual_description: z.string().max(500).optional().nullable(),
  prayer_needs: z.string().max(500).optional().nullable(),
  emergency_contact_name: z.string().optional().nullable(),
  emergency_contact_phone: z.string().optional().nullable(),
  civil_status: z.enum(['single', 'married', 'widowed']).optional().nullable(),
  spouse_name: z.string().optional().nullable(),
  wedding_anniversary: z.string().optional().nullable(),
  num_children: z.number().min(0).optional().nullable(),
  member_category: z.enum(['Kid', 'Student', 'Young Pro', 'Mother', 'Father']).optional().nullable(),
  discipler_id: z.string().uuid().optional().nullable(),
  follow_through: z.enum(['Salvation', 'Prayer', 'Bible and Devotion', 'Transformation', 'Cell and Church']).optional().nullable(),
  discipleship_journey: z.enum(['Consolidations', 'Pre Encounter', 'Encounter', 'Post-Encounter', 'SOD1', 'SOD2', 'SOD3', 'Bible School', 'QBS Theology 101', 'QBS Preaching 101']).optional().nullable(),
  leadership_level: z.enum(['Member', 'Disciple Maker', 'Eagle', 'Pastor', 'Head Pastor']).default('Member'),
  spiritual_name: z.string().optional().nullable(),
  is_vision_keeper: z.boolean().optional(),
  is_full_time: z.boolean().optional(),
  community: z.string().optional().nullable(),
  facebook_url: z.string().optional().nullable(),
})

const memberUpdateSchema = memberInsertSchema.partial()

// Fields a member may change on their own record without members.write.
const SELF_EDITABLE_FIELDS = new Set(['photo_url'])

// ============================================
// GET MEMBER WITH RELATIONS
// ============================================

export const getMemberWithRelations = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }) => {
    await getCaller(data.accessToken)
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
          cell_group:cell_groups(
            id, name, meeting_day, meeting_time,
            leader:members!cell_groups_leader_id_fkey(id, name, photo_url),
            co_leader:members!cell_groups_co_leader_id_fkey(id, name, photo_url)
          )
        ),
        ministries:member_ministries(
          role,
          joined_at,
          is_active,
          ministry:ministries(
            id, name, department,
            head:members!ministries_head_id_fkey(id, name, photo_url)
          )
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
  .inputValidator((data: MemberInsert & { accessToken: string }) => {
    const result = memberInsertSchema.extend({ accessToken: z.string() }).safeParse(data)
    if (!result.success) {
      const fieldErrors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
      throw new Error(`Validation failed — ${fieldErrors}`)
    }
    return result.data
  })
  .handler(async ({ data }): Promise<Member> => {
    const { accessToken, ...insert } = data
    await requirePermission(accessToken, 'members.write')
    const supabase = createServerAdminClient()

    const { data: member, error } = await supabase
      .from('members')
      .insert(insert)
      .select()
      .single()

    if (error) {
      console.error('Error creating member:', error)
      if (error.code === '23505') {
        throw new Error('A member with this email already exists')
      }
      throw new Error(`Failed to create member: ${error.message}`)
    }

    return member as Member
  })

// ============================================
// UPDATE MEMBER
// ============================================

export const updateMember = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; updates: MemberUpdate }) => {
    const parsed = z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      updates: memberUpdateSchema,
    }).parse(data)
    // .partial() still fills schema defaults (stage, status, leadership level);
    // write only the fields the caller actually sent.
    return { ...parsed, updates: pickProvided(parsed.updates, data.updates) }
  })
  .handler(async ({ data }): Promise<Member> => {
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    const selfEdit =
      Object.keys(data.updates).every((k) => SELF_EDITABLE_FIELDS.has(k)) &&
      (await getCallerMemberId(supabase, caller.userId)) === data.id
    if (!selfEdit) await requirePermission(data.accessToken, 'members.write')

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
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'members.write')
    const supabase = createServerAdminClient()

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
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'members.write')
    const supabase = createServerAdminClient()

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
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'members.delete')
    const supabase = createServerAdminClient()

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
// GET ALL MEMBERS (lightweight: id + name only)
// ============================================

export const getAllMembersLite = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string }) => z.object({ accessToken: z.string() }).parse(data))
  .handler(async ({ data }): Promise<{ id: string; name: string }[]> => {
    await getCaller(data.accessToken)
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
// SEARCH MEMBERS (simple text search)
// ============================================

export const searchMembers = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; query: string; limit?: number }) =>
    z.object({
      accessToken: z.string(),
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(10),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Member[]> => {
    await getCaller(data.accessToken)
    // Service-role client: the anon server client has no user session, so the
    // members RLS (authenticated only) returned zero rows.
    const supabase = createServerAdminClient()
    const q = toSafeSearchTerm(data.query)
    if (!q) return []

    const { data: members, error } = await supabase
      .from('members')
      .select('*')
      .eq('is_archived', false)
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%`)
      .order('name')
      .limit(data.limit)

    if (error) {
      console.error('Error searching members:', error)
      throw new Error('Failed to search members')
    }

    return members as Member[]
  })

