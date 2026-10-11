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
import { agapayEnrollFlag, savedStageChange, savedWithDiscipler, type AgapayEnrollFlag } from '../../lib/agapay'
import { enrollInAgapayIfEligible, recordAgapayStageChange, type AgapayEnrollResult } from '../agapayEnroll'
import { endPlainCircleMemberships, memberArchiveBlockReason, memberDeleteBlockReason } from '../memberArchive'
import { toSafeSearchTerm } from '../../lib/searchTerm'
import { withNamePartsReview } from '../../lib/nameParts'
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
  // Split name from the admin member form. name_parts_status is never taken
  // from the client; withNamePartsReview sets it.
  first_name: z.string().max(60).optional().nullable(),
  middle_name: z.string().max(60).optional().nullable(),
  last_name: z.string().max(60).optional().nullable(),
  suffix: z.string().max(20).optional().nullable(),
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
            id, name, is_team, meeting_day, meeting_time,
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

    // The discipler is a separate lookup by id, not a PostgREST self-embed.
    // Best-effort: a failed lookup shows no discipler instead of failing the page.
    // Typed as Member; the embedded relations above ride along untyped.
    const row = member as unknown as Member
    const discipler = row.discipler_id ? await getMemberChip(supabase, row.discipler_id) : null

    return { ...row, discipler }
  })

/** id, name and photo of one member for a profile link; null when missing or on error. */
async function getMemberChip(
  supabase: ReturnType<typeof createServerAdminClient>,
  memberId: string,
): Promise<{ id: string; name: string; photo_url: string | null } | null> {
  const { data: row, error } = await supabase
    .from('members')
    .select('id, name, photo_url')
    .eq('id', memberId)
    .maybeSingle()
  if (error) {
    console.error('Error fetching discipler:', error)
    return null
  }
  return (row as unknown as { id: string; name: string; photo_url: string | null } | null) ?? null
}

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
  .handler(async ({ data }): Promise<Member & AgapayEnrollFlag> => {
    const { accessToken, ...fields } = data
    const caller = await requirePermission(accessToken, 'members.write')
    const insert = withNamePartsReview(fields, caller.userId)
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

    // A discipler set here also enrolls the member in Agapay (best-effort,
    // never fails the save), so no second step is needed there.
    // agapayEnrollFailed is set when an enrollment ran.
    let enroll: AgapayEnrollResult | undefined
    if (savedWithDiscipler(insert, member as Member)) {
      enroll = await enrollInAgapayIfEligible(supabase, (member as Member).id, caller.userId, 'directory')
    }

    return { ...(member as Member), ...agapayEnrollFlag(enroll) }
  })

// ============================================
// UPDATE MEMBER
// ============================================

export const updateMember = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    accessToken: string
    id: string
    updates: MemberUpdate
    /**
     * Run Agapay enrollment when the saved member has a discipler, even when
     * discipler_id is not among the written fields (the edit page sends it
     * only when changed). Retries a failed or half-done enrollment.
     */
    retryAgapayEnroll?: boolean
  }) => {
    const parsed = z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      updates: memberUpdateSchema,
      retryAgapayEnroll: z.boolean().optional(),
    }).parse(data)
    // .partial() still fills schema defaults (stage, status, leadership level);
    // write only the fields the caller actually sent.
    return { ...parsed, updates: pickProvided(parsed.updates, data.updates) }
  })
  .handler(async ({ data }): Promise<Member & AgapayEnrollFlag> => {
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    const selfEdit =
      Object.keys(data.updates).every((k) => SELF_EDITABLE_FIELDS.has(k)) &&
      (await getCallerMemberId(supabase, caller.userId)) === data.id
    if (!selfEdit) await requirePermission(data.accessToken, 'members.write')
    const updates = withNamePartsReview(data.updates, caller.userId)

    // The stage before the save, to record a stage change on the member's
    // Agapay record. Read only when the save writes the stage.
    let stageBefore: string | null = null
    if ('discipleship_stage' in data.updates) {
      const { data: before, error: beforeErr } = await supabase
        .from('members')
        .select('discipleship_stage')
        .eq('id', data.id)
        .maybeSingle()
      if (beforeErr) {
        console.error('Error reading member before update:', beforeErr)
        throw new Error('Failed to update member')
      }
      stageBefore = (before as unknown as { discipleship_stage: string } | null)?.discipleship_stage ?? null
    }

    const { data: member, error } = await supabase
      .from('members')
      .update(updates)
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

    // A stage changed here gets the same Agapay audit row and checklist reset
    // as a promotion there (best-effort, never fails the save). Runs before
    // enrollment, so a member enrolled by this save gets only its intake row.
    const stageChange = savedStageChange(data.updates, stageBefore, member as Member)
    if (stageChange) {
      await recordAgapayStageChange(supabase, data.id, stageChange.from, stageChange.to, caller.userId)
    }

    // agapayEnrollFailed is set when an enrollment ran. A retry (edit page)
    // also runs it for a discipler left unchanged; never on a self-edit.
    const retryEnroll = data.retryAgapayEnroll === true && !selfEdit && Boolean((member as Member).discipler_id)
    let enroll: AgapayEnrollResult | undefined
    if (savedWithDiscipler(data.updates, member as Member) || retryEnroll) {
      enroll = await enrollInAgapayIfEligible(supabase, data.id, caller.userId, 'directory')
    }

    return { ...(member as Member), ...agapayEnrollFlag(enroll) }
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

    // Disciples and led circles move first (see memberArchiveRules.ts).
    let blockReason: string | null
    try {
      blockReason = await memberArchiveBlockReason(supabase, data.id)
    } catch (err) {
      console.error('Error checking member before archive:', err)
      throw new Error('Failed to archive member')
    }
    if (blockReason) throw new Error(blockReason)

    const { error } = await supabase
      .from('members')
      .update({ is_archived: true })
      .eq('id', data.id)

    if (error) {
      console.error('Error archiving member:', error)
      throw new Error('Failed to archive member')
    }

    // An archived member leaves their plain circle memberships (kept as
    // history, is_active false). Best-effort, never fails the archive.
    await endPlainCircleMemberships(supabase, data.id)

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

    // Same refusals as archive, plus Agapay history (see memberArchiveRules.ts).
    let blockReason: string | null
    try {
      blockReason = await memberDeleteBlockReason(supabase, data.id)
    } catch (err) {
      console.error('Error checking member before delete:', err)
      throw new Error('Failed to delete member')
    }
    if (blockReason) throw new Error(blockReason)

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

