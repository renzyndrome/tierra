// Pure helpers shared with Agapay, the discipleship app that runs on this same
// Supabase project (github: agapay, discipleship.questlaguna.org). Kept
// dependency-free so they are unit-testable.

/**
 * Agapay cohort label from a member's joined_date: "Q2 2026".
 * Same rule as agapay/scripts/import-disciples.ts `cohortOf`, so members
 * enrolled from tierra land in the same cohorts as imported ones. Uses UTC
 * parts so a date-only string never shifts quarter with the server timezone.
 */
export function agapayCohort(joined: string | null | undefined): string | null {
  if (!joined) return null
  const d = new Date(joined)
  if (Number.isNaN(d.getTime())) return null
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}

/** Today's date as YYYY-MM-DD (UTC), for members.joined_date. */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Did this member save assign a discipler? True when the written fields
 * include discipler_id and the saved row now has one. Such a save also
 * enrolls the member in Agapay, so the disciple shows in the discipler's
 * follow-up queue without a second step there.
 */
export function savedWithDiscipler(
  written: Record<string, unknown>,
  saved: { discipler_id: string | null } | null,
): boolean {
  return 'discipler_id' in written && Boolean(saved?.discipler_id)
}

/** The member fields Agapay also changes (promotion, reassignment). */
export interface AgapayOwnedFields {
  discipleship_stage?: string
  discipler_id?: string | null
}

/**
 * After a Quest Circle move on the member edit page: the discipler to save
 * again, or null. Leaving the old circle clears a discipler who leads it and
 * joining the new one gives that circle's leader. Only a discipler the admin
 * changed in this same save is put back; an unchanged one gives way to the
 * new circle's leader, so discipler and circle agree.
 */
export function disciplerToKeepAfterMove(
  written: Record<string, unknown>,
  saved: { discipler_id: string | null } | null,
): string | null {
  return savedWithDiscipler(written, saved) ? (saved?.discipler_id ?? null) : null
}

/**
 * A member edit payload without the Agapay-owned fields left as loaded.
 * discipleship_stage and discipler_id are written only when the admin changed
 * them on the form, so an edit page opened earlier never reverts a change
 * made in Agapay meanwhile. Every other field passes through unchanged.
 */
export function withoutUnchangedAgapayFields<T extends AgapayOwnedFields>(
  form: T,
  loaded: { discipleship_stage: string; discipler_id: string | null },
): Partial<T> {
  const { discipleship_stage, discipler_id, ...rest } = form
  const stageChanged = 'discipleship_stage' in form && discipleship_stage !== loaded.discipleship_stage
  const disciplerChanged = 'discipler_id' in form && (discipler_id ?? null) !== (loaded.discipler_id ?? null)
  return {
    ...rest,
    ...(stageChanged ? { discipleship_stage } : {}),
    ...(disciplerChanged ? { discipler_id: discipler_id ?? null } : {}),
  } as Partial<T>
}

/**
 * The stage change a member save made, or null: discipleship_stage not among
 * the written fields, no stage read before the save, or the same stage.
 */
export function savedStageChange(
  written: Record<string, unknown>,
  stageBefore: string | null,
  saved: { discipleship_stage: string } | null,
): { from: string; to: string } | null {
  if (!('discipleship_stage' in written) || !stageBefore || !saved) return null
  return saved.discipleship_stage !== stageBefore ? { from: stageBefore, to: saved.discipleship_stage } : null
}

// ============================================
// ENROLLMENT FAILURE AFTER A SAVE
// ============================================

/** Warning on a member form after a save whose Agapay enrollment failed. The save stands. */
export const AGAPAY_ENROLL_FAILED_SAVED = 'Saved. Agapay enrollment failed. Save again to retry.'

/** Warning where there is no form to save again (create result, circle add). */
export const AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT = 'Agapay enrollment failed. Save on the Edit Member page to retry.'

/** The enrollment flag a server response carries: present only when an enrollment ran. */
export interface AgapayEnrollFlag {
  agapayEnrollFailed?: boolean
}

/** The flag for an enrollment result, or no flag when no enrollment ran (undefined). */
export function agapayEnrollFlag(result: string | undefined): AgapayEnrollFlag {
  return result === undefined ? {} : { agapayEnrollFailed: result === 'failed' }
}

/**
 * Whether enrollment stands failed after one more server response in a chain
 * of saves: the last enrollment that ran decides, and a response without the
 * flag (no enrollment ran) keeps the previous state.
 */
export function enrollFailedAfter(previous: boolean, response: AgapayEnrollFlag | null | undefined): boolean {
  return typeof response?.agapayEnrollFailed === 'boolean' ? response.agapayEnrollFailed : previous
}

/**
 * A claim approver's note with a failed enrollment added. A resolved claim
 * cannot be confirmed again, so the note points to the Edit Member page, whose
 * Save retries the enrollment. No failure keeps the note as it is.
 */
export function withAgapayEnrollNote(note: string | null, enrollFailed: boolean): string | null {
  if (!enrollFailed) return note
  return note ? `${note} ${AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT}` : AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT
}

/**
 * Outcome line for enrollments that failed in a batch step (circle leader
 * change, spreadsheet import), or null when none failed. Each member's Edit
 * page Save retries the enrollment.
 */
export function agapayEnrollFailedCount(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? "1 Agapay enrollment failed. Save on the member's Edit page to retry."
    : `${count} Agapay enrollments failed. Save on each member's Edit page to retry.`
}
