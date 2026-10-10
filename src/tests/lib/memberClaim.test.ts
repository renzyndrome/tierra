// Unit tests for the member-claim scoring engine.
//
// The stakes: an auto-link hands one person another person's giving history and
// attendance. These tests pin down exactly which submissions are confident
// enough to link without a human, and which must stay in the review queue.

import { describe, it, expect } from 'vitest'
import {
  scoreClaimCandidate,
  resolveClaim,
  topScore,
  claimReasonLabel,
  CLAIM_AUTO_THRESHOLD,
  CLAIM_SHOW_THRESHOLD,
  CLAIM_MAX_CANDIDATES,
  type ClaimCandidateMember,
  type ClaimContext,
  type ClaimSubmission,
} from '../../lib/memberClaim'

function member(over: Partial<ClaimCandidateMember> & { id: string; name: string }): ClaimCandidateMember {
  return {
    email: null,
    phone: null,
    birthday: null,
    satellite_id: null,
    ...over,
  }
}

function ctx(over: Partial<ClaimContext> = {}): ClaimContext {
  return {
    groupMemberIds: new Set<string>(),
    linkedMemberIds: new Set<string>(),
    ...over,
  }
}

const submission = (over: Partial<ClaimSubmission> = {}): ClaimSubmission => ({
  name: 'Maria Santos',
  email: 'maria@example.com',
  ...over,
})

describe('scoreClaimCandidate', () => {
  it('scores an exact email match at 0.95 even when the name differs', () => {
    // Married name / nickname changes are common; email is unique on members.
    const m = member({ id: 'm1', name: 'Maria Dela Cruz', email: 'maria@example.com' })
    const { score, reasons } = scoreClaimCandidate(submission(), m, ctx())
    expect(score).toBeCloseTo(0.95, 5)
    expect(score).toBeGreaterThanOrEqual(CLAIM_AUTO_THRESHOLD)
    expect(reasons).toContain('exact_email')
  })

  it('ignores case and surrounding spaces on email', () => {
    const m = member({ id: 'm1', name: 'Zzz', email: '  MARIA@Example.COM ' })
    const { score } = scoreClaimCandidate(submission(), m, ctx())
    expect(score).toBeCloseTo(0.95, 5)
  })

  it('scores an exact name alone below the auto threshold', () => {
    // 0.85 — a full-name match with nothing else is strong but not proof.
    const m = member({ id: 'm1', name: 'Maria Santos' })
    const { score, reasons } = scoreClaimCandidate(submission(), m, ctx())
    expect(score).toBeCloseTo(0.85, 5)
    expect(score).toBeLessThan(CLAIM_AUTO_THRESHOLD)
    expect(reasons).toContain('name_strong')
  })

  it('lifts an exact name over the threshold when they are in the scanned circle', () => {
    const m = member({ id: 'm1', name: 'Maria Santos' })
    const { score, reasons } = scoreClaimCandidate(
      submission(),
      m,
      ctx({ groupMemberIds: new Set(['m1']) }),
    )
    expect(score).toBeCloseTo(0.97, 5)
    expect(score).toBeGreaterThanOrEqual(CLAIM_AUTO_THRESHOLD)
    expect(reasons).toContain('in_group')
  })

  it('lifts an exact name over the threshold with a matching phone', () => {
    const m = member({ id: 'm1', name: 'Maria Santos', phone: '+63 917 123 4567' })
    const { score, reasons } = scoreClaimCandidate(
      submission({ phone: '0917 123 4567' }),
      m,
      ctx(),
    )
    expect(score).toBeCloseTo(1, 5)
    expect(reasons).toContain('phone_match')
  })

  it('adds the birthday bonus on an exact date, tolerating ISO timestamps', () => {
    const m = member({ id: 'm1', name: 'Maria Santos', birthday: '1990-04-15T00:00:00.000Z' })
    const { score, reasons } = scoreClaimCandidate(
      submission({ birthday: '1990-04-15' }),
      m,
      ctx(),
    )
    expect(score).toBeCloseTo(0.95, 5)
    expect(reasons).toContain('birthday_match')
  })

  it('keeps a middle-name variant strong (Filipino naming pattern)', () => {
    // nameMatchConfidence gives the subset tier 0.9 -> 0.765 here.
    const m = member({ id: 'm1', name: 'Maria Angela Santos' })
    const { score, reasons } = scoreClaimCandidate(submission(), m, ctx())
    expect(score).toBeCloseTo(0.765, 3)
    expect(score).toBeLessThan(CLAIM_AUTO_THRESHOLD)
    expect(reasons).toContain('name_strong')
  })

  it('keeps a first-name-only submission far below the threshold', () => {
    const m = member({ id: 'm1', name: 'Maria Santos' })
    const { score, reasons } = scoreClaimCandidate(submission({ name: 'Maria' }), m, ctx())
    // Dice over token sets: 2*1/(1+2) = 0.667 -> 0.567
    expect(score).toBeCloseTo(0.567, 2)
    expect(score).toBeLessThan(CLAIM_AUTO_THRESHOLD)
    expect(reasons).toContain('name_partial')
  })

  it('does not let a first name plus circle membership reach auto', () => {
    const m = member({ id: 'm1', name: 'Maria Santos' })
    const { score } = scoreClaimCandidate(
      submission({ name: 'Maria' }),
      m,
      ctx({ groupMemberIds: new Set(['m1']) }),
    )
    expect(score).toBeLessThan(CLAIM_AUTO_THRESHOLD)
  })

  it('uses trigram similarity when it beats the token score (typos)', () => {
    const m = member({ id: 'm1', name: 'Maria Santos' })
    const bare = scoreClaimCandidate(submission({ name: 'Maria Santoss' }), m, ctx())
    const withTrigram = scoreClaimCandidate(
      submission({ name: 'Maria Santoss' }),
      m,
      ctx({ trigramSim: new Map([['m1', 0.92]]) }),
    )
    expect(withTrigram.score).toBeGreaterThan(bare.score)
    expect(withTrigram.score).toBeCloseTo(0.782, 3)
  })

  it('never exceeds 1.0 when every signal fires', () => {
    const m = member({
      id: 'm1',
      name: 'Maria Santos',
      email: 'maria@example.com',
      phone: '09171234567',
      birthday: '1990-04-15',
    })
    const { score } = scoreClaimCandidate(
      submission({ phone: '09171234567', birthday: '1990-04-15' }),
      m,
      ctx({ groupMemberIds: new Set(['m1']) }),
    )
    expect(score).toBe(1)
  })

  it('scores an unrelated member at zero', () => {
    const m = member({ id: 'm1', name: 'Pedro Reyes' })
    const { score } = scoreClaimCandidate(submission(), m, ctx())
    expect(score).toBe(0)
  })

  it('gives no phone or birthday bonus when the submission omits them', () => {
    const m = member({ id: 'm1', name: 'Maria Santos', phone: '09171234567', birthday: '1990-04-15' })
    const { score, reasons } = scoreClaimCandidate(submission(), m, ctx())
    expect(score).toBeCloseTo(0.85, 5)
    expect(reasons).not.toContain('phone_match')
    expect(reasons).not.toContain('birthday_match')
  })
})

describe('resolveClaim', () => {
  const directory: ClaimCandidateMember[] = [
    member({ id: 'm1', name: 'Maria Santos' }),
    member({ id: 'm2', name: 'Pedro Reyes' }),
    member({ id: 'm3', name: 'Maria Lopez' }),
  ]

  it('auto-links when exactly one candidate clears the threshold', () => {
    const res = resolveClaim(submission(), directory, ctx({ groupMemberIds: new Set(['m1']) }))
    expect(res.decision).toBe('auto')
    expect(res.autoMember?.id).toBe('m1')
  })

  it('stays pending when a strong name has no corroboration', () => {
    const res = resolveClaim(submission(), directory, ctx())
    expect(res.decision).toBe('pending')
    expect(res.autoMember).toBeNull()
    expect(res.candidates[0].member.id).toBe('m1')
  })

  it('stays pending on a tie between two same-name members', () => {
    // A father and son in the same circle must never be guessed.
    const twins: ClaimCandidateMember[] = [
      member({ id: 'a', name: 'Maria Santos' }),
      member({ id: 'b', name: 'Maria Santos' }),
    ]
    const res = resolveClaim(
      submission(),
      twins,
      ctx({ groupMemberIds: new Set(['a', 'b']) }),
    )
    expect(res.decision).toBe('pending')
    expect(res.candidates).toHaveLength(2)
  })

  it('never auto-links to a member already backing another account', () => {
    const res = resolveClaim(
      submission(),
      directory,
      ctx({ groupMemberIds: new Set(['m1']), linkedMemberIds: new Set(['m1']) }),
    )
    expect(res.decision).toBe('pending')
    // still shown, flagged, so an approver can see why it is blocked
    expect(res.candidates[0].member.id).toBe('m1')
    expect(res.candidates[0].alreadyLinked).toBe(true)
  })

  it('returns no candidates for a name nobody in the directory resembles', () => {
    const res = resolveClaim(submission({ name: 'Xiomara Quintanilla' }), directory, ctx())
    expect(res.decision).toBe('pending')
    expect(res.candidates).toEqual([])
  })

  it('drops candidates below the show threshold', () => {
    const res = resolveClaim(submission(), directory, ctx())
    for (const c of res.candidates) expect(c.score).toBeGreaterThanOrEqual(CLAIM_SHOW_THRESHOLD)
    expect(res.candidates.some((c) => c.member.id === 'm2')).toBe(false)
  })

  it('sorts candidates best-first', () => {
    const res = resolveClaim(submission(), directory, ctx())
    const scores = res.candidates.map((c) => c.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('caps the candidate list', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      member({ id: `m${i}`, name: 'Maria Santos' }),
    )
    const res = resolveClaim(submission(), many, ctx())
    expect(res.candidates).toHaveLength(CLAIM_MAX_CANDIDATES)
  })

  it('handles an empty directory', () => {
    const res = resolveClaim(submission(), [], ctx())
    expect(res.decision).toBe('pending')
    expect(res.candidates).toEqual([])
  })

  it('auto-links on email alone even when the person is not in the circle', () => {
    const dir = [member({ id: 'm9', name: 'M. Santos-Cruz', email: 'maria@example.com' })]
    const res = resolveClaim(submission(), dir, ctx())
    expect(res.decision).toBe('auto')
    expect(res.autoMember?.id).toBe('m9')
  })
})

describe('topScore', () => {
  it('returns null for no candidates', () => {
    expect(topScore([])).toBeNull()
  })

  it('returns the highest score', () => {
    const res = resolveClaim(
      submission(),
      [member({ id: 'm1', name: 'Maria Santos' }), member({ id: 'm3', name: 'Maria Lopez' })],
      ctx(),
    )
    expect(topScore(res.candidates)).toBeCloseTo(0.85, 5)
  })
})

describe('claimReasonLabel', () => {
  it('gives a plain-language label for every reason', () => {
    const reasons = [
      'exact_email',
      'name_strong',
      'name_partial',
      'phone_match',
      'birthday_match',
      'in_group',
    ] as const
    for (const r of reasons) {
      expect(claimReasonLabel(r)).toBeTruthy()
    }
  })
})
