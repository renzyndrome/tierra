// First-timer rules for service check-ins.
//
// Staff tick "First timer" when registering a walk-in, so a known attendee who
// is only new to the system is not filed as New Friends. QR check-ins and
// check-ins recorded before the flag existed carry no answer; analytics then
// fall back to "the member's first check-in on record".

import type { DiscipleshipStage } from './types'

/**
 * Directory stage for a booth walk-in: New Friends for a first timer,
 * Schooling for a known attendee. An unknown answer keeps the New Friends
 * default.
 */
export function walkInStage(isFirstTimer: boolean | undefined): DiscipleshipStage {
  return isFirstTimer === false ? 'Growing' : 'Newbie'
}

interface FirstTimerFacts {
  session_id: string
  member_id: string | null
  is_first_timer?: boolean | null
}

/**
 * Whether a check-in counts as a first visit in analytics. A recorded answer
 * wins; without one, a member's first check-in on record counts.
 */
export function isFirstTimerCheckin(
  record: FirstTimerFacts,
  firstSessionByMember: ReadonlyMap<string, string>,
): boolean {
  if (typeof record.is_first_timer === 'boolean') return record.is_first_timer
  return record.member_id ? firstSessionByMember.get(record.member_id) === record.session_id : false
}
