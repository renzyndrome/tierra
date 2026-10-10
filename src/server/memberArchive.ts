// Member archive and permanent-delete checks — server-only.
//
// Gathers the facts for src/lib/memberArchiveRules.ts and ends the plain
// circle memberships of an archived member. Used by archiveMember and
// deleteMember (src/server/functions/members.ts).

import { createServerAdminClient } from '../lib/supabase'
import { hasAgapayEnrollment } from './agapayEnroll'
import { archiveBlockReason, deleteBlockReason, type MemberArchiveFacts } from '../lib/memberArchiveRules'

type AdminClient = ReturnType<typeof createServerAdminClient>

/**
 * Does any non-archived member walk with this member, and which active
 * circle (first by name) does this member lead or co-lead?
 * Throws on a failed read, so the caller refuses instead of guessing.
 */
async function archiveFacts(supabase: AdminClient, memberId: string): Promise<MemberArchiveFacts> {
  const [disciplesRes, circlesRes] = await Promise.all([
    supabase
      .from('members')
      .select('id')
      .eq('discipler_id', memberId)
      .not('is_archived', 'is', true)
      .limit(1),
    supabase
      .from('cell_groups')
      .select('name')
      // memberId is a validated uuid, safe inside the filter string.
      .or(`leader_id.eq.${memberId},co_leader_id.eq.${memberId}`)
      .not('is_active', 'is', false)
      .order('name')
      .limit(1),
  ])

  const readErr = disciplesRes.error ?? circlesRes.error
  if (readErr) throw readErr

  const circles = (circlesRes.data ?? []) as unknown as { name: string | null }[]
  return {
    hasActiveDisciples: ((disciplesRes.data ?? []) as unknown[]).length > 0,
    ledCircleName: circles.length > 0 ? circles[0].name ?? '' : null,
  }
}

/** Why archiving the member is refused, or null. Throws on a failed read. */
export async function memberArchiveBlockReason(supabase: AdminClient, memberId: string): Promise<string | null> {
  return archiveBlockReason(await archiveFacts(supabase, memberId))
}

/**
 * Why permanently deleting the member is refused, or null: the archive
 * refusals, then an Agapay record. Throws on a failed read.
 */
export async function memberDeleteBlockReason(supabase: AdminClient, memberId: string): Promise<string | null> {
  const facts = await archiveFacts(supabase, memberId)
  const archiveReason = archiveBlockReason(facts)
  if (archiveReason) return archiveReason
  return deleteBlockReason({ ...facts, agapayEnrolled: await hasAgapayEnrollment(supabase, memberId) })
}

/**
 * Soft-remove the member from every circle where they are an active plain
 * member (is_active false, left_at now), as on archive. Leader and co-leader
 * rows are left alone. Best-effort: logs instead of throwing, so the archive
 * itself stands.
 */
export async function endPlainCircleMemberships(supabase: AdminClient, memberId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('member_cell_groups')
      .update({ is_active: false, left_at: new Date().toISOString() } as never)
      .eq('member_id', memberId)
      .eq('role', 'member')
      .not('is_active', 'is', false)
    if (error) console.error('Error ending circle memberships of archived member:', error)
  } catch (err) {
    console.error('Error ending circle memberships of archived member:', err)
  }
}
