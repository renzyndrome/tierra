// Enroll a member in Agapay — server-only.
//
// Agapay (the discipleship app) shares this Supabase project. A disciple
// appears in their discipler's follow-up queue only with a row in
// discipleship.disciple_profiles: its queue view selects FROM that table, so
// setting members.discipler_id alone is not enough.
//
// This mirrors agapay/scripts/import-disciples.ts exactly:
//   eligibility  non-archived member, has a discipler_id, not yet enrolled
//   writes       1. disciple_profiles row (member_id, cohort)
//                2. "Joined Agapay" stage_transitions audit row
//                3. discipleship.snapshot_checklist for the current stage
// Same rule, so re-running that script afterwards is a no-op for anyone
// enrolled here. Touches only the discipleship schema.
//
// A profile row with no checklist items (an enrollment that stopped after the
// insert) is repaired on the next call: the checklist is snapshotted for the
// member's current stage.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminClient } from '../lib/supabase'
import { agapayCohort } from '../lib/agapay'
import { disciplerFromCircle, disciplersClearedOnLeave, type CircleLeaders } from '../lib/circleRules'

type AdminClient = ReturnType<typeof createServerAdminClient>

export type AgapayEnrollResult = 'enrolled' | 'repaired' | 'already_enrolled' | 'not_eligible' | 'failed'

/**
 * Enroll one member when eligible. Best-effort: logs and returns 'failed'
 * instead of throwing, so a problem here never undoes an account link.
 *
 * Already enrolled with no checklist items: snapshots the checklist for the
 * current stage and returns 'repaired'. A new enrollment whose checklist
 * snapshot fails returns 'failed' (the profile row stays, so a retry repairs it).
 *
 * @param actorUserId auth user recorded as the audit row's created_by
 */
export async function enrollInAgapayIfEligible(
  admin: AdminClient,
  memberId: string,
  actorUserId: string | null,
  source: string,
): Promise<AgapayEnrollResult> {
  try {
    const { data: member, error: memErr } = await admin
      .from('members')
      .select('id, discipleship_stage, discipler_id, joined_date, is_archived')
      .eq('id', memberId)
      .maybeSingle()
    if (memErr) throw memErr
    const m = member as unknown as {
      id: string
      discipleship_stage: string
      discipler_id: string | null
      joined_date: string | null
      is_archived: boolean
    } | null
    if (!m || m.is_archived || !m.discipler_id) return 'not_eligible'

    // The tierra client is typed for the public schema only.
    const agapay = (admin as unknown as SupabaseClient).schema('discipleship')

    const { data: existing, error: exErr } = await agapay
      .from('disciple_profiles')
      .select('id')
      .eq('member_id', m.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (existing) {
      return await repairChecklistIfMissing(agapay, (existing as { id: string }).id, m.discipleship_stage)
    }

    const { data: inserted, error: insErr } = await agapay
      .from('disciple_profiles')
      .insert({ member_id: m.id, cohort: agapayCohort(m.joined_date) })
      .select('id')
      .single()
    if (insErr) {
      // member_id is UNIQUE: a concurrent enrollment already won the race.
      if (insErr.code === '23505') return 'already_enrolled'
      throw insErr
    }
    const discipleId = (inserted as { id: string }).id

    const { error: trErr } = await agapay.from('stage_transitions').insert({
      disciple_id: discipleId,
      from_stage: null,
      to_stage: m.discipleship_stage,
      note: `Joined Agapay (${source})`,
      created_by: actorUserId,
    })
    if (trErr) console.error('Agapay enroll: audit row failed:', trErr)

    const { error: snapErr } = await agapay.rpc('snapshot_checklist', {
      p_disciple: discipleId,
      p_stage_db: m.discipleship_stage,
    })
    if (snapErr) {
      console.error('Agapay enroll: checklist snapshot failed:', snapErr)
      return 'failed'
    }

    return 'enrolled'
  } catch (err) {
    console.error('Agapay enroll failed:', err)
    return 'failed'
  }
}

/**
 * An enrolled member with no checklist items gets the checklist for their
 * current stage. Items already there (any progress) are never touched.
 * Throws on a failed read; returns 'failed' when the snapshot fails.
 */
async function repairChecklistIfMissing(
  agapay: ReturnType<SupabaseClient['schema']>,
  discipleId: string,
  stage: string,
): Promise<AgapayEnrollResult> {
  const { data: items, error: itemsErr } = await agapay
    .from('disciple_checklist_items')
    .select('id')
    .eq('disciple_id', discipleId)
    .limit(1)
  if (itemsErr) throw itemsErr
  if (((items ?? []) as unknown[]).length > 0) return 'already_enrolled'

  const { error: snapErr } = await agapay.rpc('snapshot_checklist', {
    p_disciple: discipleId,
    p_stage_db: stage,
  })
  if (snapErr) {
    console.error('Agapay enroll: checklist repair failed:', snapErr)
    return 'failed'
  }
  return 'repaired'
}

/**
 * Point a member at the circle's leader as their discipler, or at its
 * co-leader when the circle has no leader (disciplerFromCircle), but ONLY when
 * the member has no discipler yet. Never overwrites an existing assignment
 * (that is an audited change in Agapay via reassign_disciples) and never
 * points a leader at themselves. A team (cell_groups.is_team) sets nothing:
 * it is not a discipleship circle. Best-effort: logs instead of throwing, so a
 * failure here never undoes the caller's main write (an account link or a
 * circle membership).
 */
export async function setDisciplerIfEmpty(
  admin: AdminClient,
  memberId: string,
  cellGroupId: string,
): Promise<void> {
  try {
    const { data: group, error: groupErr } = await admin
      .from('cell_groups')
      .select('leader_id, co_leader_id, is_team')
      .eq('id', cellGroupId)
      .maybeSingle()
    if (groupErr) {
      console.error('Error setting discipler from circle:', groupErr)
      return
    }
    const disciplerId = disciplerFromCircle(group as unknown as CircleLeaders | null, memberId)
    if (!disciplerId) return

    const { error } = await admin
      .from('members')
      .update({ discipler_id: disciplerId })
      .eq('id', memberId)
      .is('discipler_id', null)
    if (error) console.error('Error setting discipler from circle:', error)
  } catch (err) {
    console.error('Error setting discipler from circle:', err)
  }
}

/**
 * Undo the circle's discipler link when a plain member leaves the circle: clear
 * members.discipler_id, but ONLY when it still points at this circle's leader
 * or co-leader (disciplersClearedOnLeave). The condition sits in the UPDATE
 * itself (discipler_id in those ids), so a discipler changed in the meantime
 * is never cleared. Leaving a team (cell_groups.is_team) clears nothing.
 * Agapay rows are left alone. Best-effort: logs instead of throwing, so a
 * failure here never undoes the removal itself.
 */
export async function clearDisciplerIfCircleLeader(
  admin: AdminClient,
  memberId: string,
  cellGroupId: string,
): Promise<void> {
  try {
    const { data: group, error: groupErr } = await admin
      .from('cell_groups')
      .select('leader_id, co_leader_id, is_team')
      .eq('id', cellGroupId)
      .maybeSingle()
    if (groupErr) {
      console.error('Error clearing discipler from circle:', groupErr)
      return
    }
    const disciplerIds = disciplersClearedOnLeave(group as unknown as CircleLeaders | null, memberId)
    if (disciplerIds.length === 0) return

    const { error } = await admin
      .from('members')
      .update({ discipler_id: null } as never)
      .eq('id', memberId)
      .in('discipler_id', disciplerIds)
    if (error) console.error('Error clearing discipler from circle:', error)
  } catch (err) {
    console.error('Error clearing discipler from circle:', err)
  }
}

/** Note on the Agapay audit row for a stage changed on the directory edit page. */
export const DIRECTORY_STAGE_CHANGE_NOTE = 'Changed in the directory app'

export type AgapayStageChangeResult = 'recorded' | 'not_enrolled' | 'failed'

/**
 * Record a discipleship_stage change made in this app on the member's Agapay
 * record, the way Agapay's promote_disciple does: a stage_transitions audit
 * row (from, to, note, created_by), then discipleship.snapshot_checklist for
 * the new stage. Members not enrolled in Agapay are skipped. Best-effort:
 * logs and returns 'failed' instead of throwing, so the member save stands.
 *
 * @param actorUserId auth user recorded as the audit row's created_by
 */
export async function recordAgapayStageChange(
  admin: AdminClient,
  memberId: string,
  fromStage: string | null,
  toStage: string,
  actorUserId: string | null,
): Promise<AgapayStageChangeResult> {
  try {
    // The tierra client is typed for the public schema only.
    const agapay = (admin as unknown as SupabaseClient).schema('discipleship')

    const { data: profile, error: profErr } = await agapay
      .from('disciple_profiles')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()
    if (profErr) throw profErr
    if (!profile) return 'not_enrolled'
    const discipleId = (profile as { id: string }).id

    const { error: trErr } = await agapay.from('stage_transitions').insert({
      disciple_id: discipleId,
      from_stage: fromStage,
      to_stage: toStage,
      note: DIRECTORY_STAGE_CHANGE_NOTE,
      created_by: actorUserId,
    })
    if (trErr) console.error('Agapay stage change: audit row failed:', trErr)

    // The checklist follows the stage even when the audit row failed.
    const { error: snapErr } = await agapay.rpc('snapshot_checklist', {
      p_disciple: discipleId,
      p_stage_db: toStage,
    })
    if (snapErr) console.error('Agapay stage change: checklist snapshot failed:', snapErr)

    return trErr || snapErr ? 'failed' : 'recorded'
  } catch (err) {
    console.error('Agapay stage change not recorded:', err)
    return 'failed'
  }
}

/**
 * True when the member has an Agapay record (discipleship.disciple_profiles).
 * Throws on a failed read, so a caller refuses instead of guessing.
 */
export async function hasAgapayEnrollment(admin: AdminClient, memberId: string): Promise<boolean> {
  const agapay = (admin as unknown as SupabaseClient).schema('discipleship')
  const { data, error } = await agapay
    .from('disciple_profiles')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle()
  if (error) throw error
  return data != null
}
