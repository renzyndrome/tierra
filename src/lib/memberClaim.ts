// Scoring for "claim your member record" sign-ups.
//
// A person scans their Quest Circle's sign-up QR and submits name/email/phone/
// birthday. We score that submission against the member directory to decide
// whether it can be auto-linked or must be reviewed by the circle leader.
//
// Kept dependency-free and pure (like src/lib/nameMatch.ts) so the decision
// logic is unit-testable in isolation from Supabase. The name comparison itself
// is delegated to nameMatchConfidence — the same engine the attendance check-in
// queue uses — so both flows rank names the same way.

import { nameMatchConfidence, normalizePhone } from './nameMatch'

export interface ClaimSubmission {
  name: string
  email: string
  phone?: string | null
  birthday?: string | null
}

/** Directory row shape needed for scoring. */
export interface ClaimCandidateMember {
  id: string
  name: string
  email: string | null
  phone: string | null
  birthday: string | null
  satellite_id: string | null
}

export interface ClaimContext {
  /** Member ids belonging to the circle whose QR was scanned (incl. its leaders). */
  groupMemberIds: ReadonlySet<string>
  /** Trigram similarity by member id, from the search_members_similar RPC. */
  trigramSim?: ReadonlyMap<string, number>
  /** Member ids already linked to some account — never auto-link to these. */
  linkedMemberIds: ReadonlySet<string>
}

export type ClaimReason =
  | 'exact_email'
  | 'name_strong'
  | 'name_partial'
  | 'phone_match'
  | 'birthday_match'
  | 'in_group'

export interface ScoredClaimCandidate {
  member: ClaimCandidateMember
  score: number
  reasons: ClaimReason[]
  alreadyLinked: boolean
}

export interface ClaimResolution {
  decision: 'auto' | 'pending'
  autoMember: ClaimCandidateMember | null
  candidates: ScoredClaimCandidate[]
}

/**
 * Score at/above which a claim is trusted enough to link without human review.
 * Matches AUTO_MATCH_CONFIDENCE in nameMatch.ts on purpose — one threshold for
 * "confident enough" across the app.
 */
export const CLAIM_AUTO_THRESHOLD = 0.9

/** Below this a candidate isn't worth showing an approver at all. */
export const CLAIM_SHOW_THRESHOLD = 0.3

/** Max candidates surfaced to an approver for one claim. */
export const CLAIM_MAX_CANDIDATES = 5

// Weights. The name carries most of the signal; the rest are corroborating
// evidence that can lift a good-but-not-certain name over the line.
const NAME_WEIGHT = 0.85
const IN_GROUP_BONUS = 0.12
const PHONE_BONUS = 0.15
const BIRTHDAY_BONUS = 0.1
// Email is unique on members, so an exact hit is near-proof on its own.
const EXACT_EMAIL_SCORE = 0.95
// A name this close counts as "strong" for display purposes (0.9 = the
// subset/middle-name tier in nameMatchConfidence).
const NAME_STRONG = 0.9

function normalizeEmail(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase()
}

/** Normalize a date to YYYY-MM-DD, tolerating full ISO timestamps. */
function normalizeBirthday(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  return trimmed.slice(0, 10)
}

/**
 * Score (0..1) that a submission refers to a given member, with the reasons that
 * produced it so an approver can see WHY a candidate ranked where it did.
 *
 * Name score is the better of the token-set confidence and the DB trigram
 * similarity (trigrams rescue typos; tokens handle dropped/added middle names).
 * Phone, birthday and circle membership add on top. An exact email match floors
 * the score at 0.95 — members.email is UNIQUE, so at most one member can hit it.
 */
export function scoreClaimCandidate(
  submission: ClaimSubmission,
  member: ClaimCandidateMember,
  ctx: ClaimContext,
): { score: number; reasons: ClaimReason[] } {
  const reasons: ClaimReason[] = []

  const tokenScore = nameMatchConfidence(submission.name, member.name)
  const trigram = ctx.trigramSim?.get(member.id) ?? 0
  const nameScore = Math.max(tokenScore, trigram)

  let score = NAME_WEIGHT * nameScore
  if (nameScore >= NAME_STRONG) reasons.push('name_strong')
  else if (nameScore > 0) reasons.push('name_partial')

  if (ctx.groupMemberIds.has(member.id)) {
    score += IN_GROUP_BONUS
    reasons.push('in_group')
  }

  const submittedPhone = normalizePhone(submission.phone)
  if (submittedPhone && normalizePhone(member.phone) === submittedPhone) {
    score += PHONE_BONUS
    reasons.push('phone_match')
  }

  const submittedBirthday = normalizeBirthday(submission.birthday)
  if (submittedBirthday && normalizeBirthday(member.birthday) === submittedBirthday) {
    score += BIRTHDAY_BONUS
    reasons.push('birthday_match')
  }

  const submittedEmail = normalizeEmail(submission.email)
  if (submittedEmail && normalizeEmail(member.email) === submittedEmail) {
    score = Math.max(score, EXACT_EMAIL_SCORE)
    reasons.unshift('exact_email')
  }

  return { score: Math.min(1, score), reasons }
}

/**
 * Decide what happens to a claim.
 *
 * Auto-links ONLY when exactly one candidate clears CLAIM_AUTO_THRESHOLD and
 * that member isn't already backing another account. Ties (e.g. a father and son
 * with the same name in the same circle) deliberately stay pending — guessing
 * would hand someone else's giving history to the wrong person.
 *
 * Everything else returns `pending` with the candidates worth showing, best
 * first, so a leader can pick in one tap.
 */
export function resolveClaim(
  submission: ClaimSubmission,
  members: readonly ClaimCandidateMember[],
  ctx: ClaimContext,
): ClaimResolution {
  const scored: ScoredClaimCandidate[] = members.map((member) => {
    const { score, reasons } = scoreClaimCandidate(submission, member, ctx)
    return { member, score, reasons, alreadyLinked: ctx.linkedMemberIds.has(member.id) }
  })

  const confident = scored.filter((c) => c.score >= CLAIM_AUTO_THRESHOLD && !c.alreadyLinked)

  const candidates = scored
    .filter((c) => c.score >= CLAIM_SHOW_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.member.name.localeCompare(b.member.name))
    .slice(0, CLAIM_MAX_CANDIDATES)

  if (confident.length === 1) {
    return { decision: 'auto', autoMember: confident[0].member, candidates }
  }

  return { decision: 'pending', autoMember: null, candidates }
}

/** Highest score among candidates, or null when there are none. */
export function topScore(candidates: readonly ScoredClaimCandidate[]): number | null {
  if (candidates.length === 0) return null
  return candidates.reduce((max, c) => (c.score > max ? c.score : max), 0)
}

/** Human-readable label for a reason chip in the approver UI. */
export function claimReasonLabel(reason: ClaimReason): string {
  switch (reason) {
    case 'exact_email':
      return 'Same email'
    case 'name_strong':
      return 'Name matches'
    case 'name_partial':
      return 'Name is similar'
    case 'phone_match':
      return 'Same phone'
    case 'birthday_match':
      return 'Same birthday'
    case 'in_group':
      return 'In this circle'
  }
}
