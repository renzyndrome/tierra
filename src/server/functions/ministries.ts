// Quest Laguna Directory - Ministry Server Functions
//
// Every function takes the caller's accessToken. Reads need a signed-in user
// (the same exposure as the table RLS); writes need ministries.write and
// deletes ministries.delete.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, requirePermission } from './_authGuard'
import type { Ministry, MinistryInsert, MinistryUpdate, MemberMinistry } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const ministryInsertSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  head_id: z.string().uuid().optional().nullable(),
  photo_url: z.string().url().optional().nullable(),
  is_active: z.boolean().optional(),
})

const ministryUpdateSchema = ministryInsertSchema.partial()

// ============================================
// GET ALL MINISTRIES (simple list for dropdowns)
// ============================================

export const getAllMinistries = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; activeOnly?: boolean }) =>
    z.object({ accessToken: z.string(), activeOnly: z.boolean().optional().default(true) }).parse(data)
  )
  .handler(async ({ data }): Promise<Ministry[]> => {
    // Any signed-in user: the complete-profile page (every role) lists these.
    await getCaller(data.accessToken)
    // Use the admin client: the anon server client has no user session, so the
    // `ministries_read_auth` RLS policy (auth.role() = 'authenticated') returns zero
    // rows, leaving the "Add to Ministry" dropdown empty. Mirrors getAllCellGroups.
    const supabase = createServerAdminClient()

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
// CREATE MINISTRY
// ============================================

export const createMinistry = createServerFn({ method: 'POST' })
  .inputValidator((data: MinistryInsert & { accessToken: string }) =>
    ministryInsertSchema.extend({ accessToken: z.string() }).parse(data)
  )
  .handler(async ({ data }): Promise<Ministry> => {
    const { accessToken, ...insert } = data
    await requirePermission(accessToken, 'ministries.write')
    const supabase = createServerAdminClient()

    const { data: ministry, error } = await supabase
      .from('ministries')
      .insert(insert)
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
  .inputValidator((data: { accessToken: string; id: string; updates: MinistryUpdate }) =>
    z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      updates: ministryUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Ministry> => {
    await requirePermission(data.accessToken, 'ministries.write')
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
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'ministries.delete')
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
  .inputValidator((data: { accessToken: string; memberId: string; ministryId: string; role?: 'head' | 'coordinator' | 'volunteer' }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      ministryId: z.string().uuid(),
      role: z.enum(['head', 'coordinator', 'volunteer']).optional().default('volunteer'),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<MemberMinistry> => {
    await requirePermission(data.accessToken, 'ministries.write')
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
  .inputValidator((data: { accessToken: string; memberId: string; ministryId: string }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      ministryId: z.string().uuid(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'ministries.write')
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
  .inputValidator((data: { accessToken: string; memberId: string; ministryId: string; role: 'head' | 'coordinator' | 'volunteer' }) =>
    z.object({
      accessToken: z.string(),
      memberId: z.string().uuid(),
      ministryId: z.string().uuid(),
      role: z.enum(['head', 'coordinator', 'volunteer']),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'ministries.write')
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

