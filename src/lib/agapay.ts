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
