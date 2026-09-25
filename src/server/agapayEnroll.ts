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

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerAdminClient } from '../lib/supabase'
import { agapayCohort } from '../lib/agapay'

type AdminClient = ReturnType<typeof createServerAdminClient>

export type AgapayEnrollResult = 'enrolled' | 'already_enrolled' | 'not_eligible' | 'failed'

/**
 * Enroll one member when eligible. Best-effort: logs and returns 'failed'
 * instead of throwing, so a problem here never undoes an account link.
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
    if (existing) return 'already_enrolled'

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
    if (snapErr) console.error('Agapay enroll: checklist snapshot failed:', snapErr)

    return 'enrolled'
  } catch (err) {
    console.error('Agapay enroll failed:', err)
    return 'failed'
  }
}
