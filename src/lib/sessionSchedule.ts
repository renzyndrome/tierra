// Service-session schedule rules: the church-local calendar date and the
// "overdue" gate. Pure and dependency-free so the rule is unit-testable and
// shared by the server (public QR check-in gate) and the admin UI (badges).

export const CHURCH_TIME_ZONE = 'Asia/Manila'

/**
 * Calendar date (YYYY-MM-DD) of `now` in the church's time zone. The server
 * runs in UTC, so a plain toISOString() date would flip at 8 AM Manila time.
 */
export function churchToday(now: Date = new Date(), timeZone: string = CHURCH_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * A session is overdue once its date is before today (church time). Session
 * dates are plain YYYY-MM-DD strings, so string order is date order.
 */
export function isSessionOverdue(sessionDate: string, today: string = churchToday()): boolean {
  return sessionDate < today
}

/**
 * Whether the public QR check-in accepts new check-ins: the session is open
 * AND its date has not passed. Staff manual check-in only needs `is_open`, so
 * a past session can be reopened to backfill attendance from a paper list.
 */
export function acceptsQrCheckin(
  session: { is_open: boolean; session_date: string },
  today: string = churchToday(),
): boolean {
  return session.is_open && !isSessionOverdue(session.session_date, today)
}
