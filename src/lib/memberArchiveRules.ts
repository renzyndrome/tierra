// Archive and permanent-delete refusals for a member. Pure and dependency-free
// so they are unit-testable; src/server/memberArchive.ts gathers the facts.
//
// A member who still disciples someone, or who leads or co-leads an active
// Quest Circle, stays until those links move. A member with Agapay history is
// archived, never deleted, so that history is kept.

/** Refusal when non-archived members still have this member as discipler. */
export const DISCIPLES_ASSIGNED = 'Disciples assigned. Reassign them first.'

/** Refusal of a permanent delete when the member has an Agapay record. */
export const AGAPAY_HISTORY_EXISTS = 'Agapay history exists. Archive instead.'

export interface MemberArchiveFacts {
  /** True when a non-archived member has this member as discipler. */
  hasActiveDisciples: boolean
  /** Name of an active circle this member leads or co-leads, or null. */
  ledCircleName: string | null
}

export interface MemberDeleteFacts extends MemberArchiveFacts {
  /** True when the member has a discipleship.disciple_profiles row. */
  agapayEnrolled: boolean
}

/** Why archiving this member is refused, or null when it may go ahead. */
export function archiveBlockReason(facts: MemberArchiveFacts): string | null {
  if (facts.hasActiveDisciples) return DISCIPLES_ASSIGNED
  if (facts.ledCircleName != null) {
    const name = facts.ledCircleName.trim() || 'a Quest Circle'
    return `Leads ${name}. Change the leader first.`
  }
  return null
}

/**
 * Why permanently deleting this member is refused, or null when it may go
 * ahead: the archive refusals first, then Agapay history.
 */
export function deleteBlockReason(facts: MemberDeleteFacts): string | null {
  return archiveBlockReason(facts) ?? (facts.agapayEnrolled ? AGAPAY_HISTORY_EXISTS : null)
}
