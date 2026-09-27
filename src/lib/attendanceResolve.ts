// Pure decisions for resolving service check-ins against the member directory:
// ranking suggestions for a pending check-in, and whether the visitor record a
// mistaken "new member" registration created may be archived after re-linking.
// Kept free of Supabase so the rules are unit-testable.

import {
  nameMatchConfidence,
  normalizeName,
  findEmailMatches,
  findPhoneMatches,
  findInitialsMatches,
  findSurnameCandidates,
  splitInitials,
} from './nameMatch'
import type { MatchCandidate, SuggestionReason } from './types'

export interface DirectoryPerson {
  id: string
  name: string
  phone: string | null
  satellite_id: string | null
}

/**
 * Merge suggestion sources for one pending check-in into a single ranked list.
 * Trigram look-alikes keep the higher of their trigram and token scores;
 * same-surname members and email owners are scored by token confidence. Email
 * owners rank first, then by score; ties prefer the typed first initial
 * ("JC Eugenio": Justin before Maria), then the name.
 */
export function mergeMatchCandidates(
  typedName: string | null,
  sources: {
    fuzzy: readonly MatchCandidate[]
    surname: readonly DirectoryPerson[]
    email: readonly DirectoryPerson[]
  },
  limit: number,
): MatchCandidate[] {
  const byId = new Map<string, MatchCandidate>()
  const add = (p: DirectoryPerson, sim: number) => {
    const score = Math.max(sim, nameMatchConfidence(typedName, p.name))
    const prev = byId.get(p.id)
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      phone: p.phone,
      satellite_id: p.satellite_id,
      sim: Math.max(score, prev?.sim ?? 0),
      email_match: prev?.email_match ?? false,
    })
  }
  for (const c of sources.fuzzy) add(c, c.sim)
  for (const p of sources.surname) add(p, 0)
  for (const p of sources.email) {
    add(p, 0)
    const c = byId.get(p.id)
    if (c) byId.set(p.id, { ...c, email_match: true })
  }
  const emailFirst = (c: MatchCandidate) => (c.email_match ? 0 : 1)
  const initial = normalizeName(typedName)[0]
  const otherInitial = (c: MatchCandidate) => (normalizeName(c.name)[0] === initial ? 0 : 1)
  return [...byId.values()]
    .sort(
      (a, b) =>
        emailFirst(a) - emailFirst(b) ||
        b.sim - a.sim ||
        otherInitial(a) - otherInitial(b) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

/**
 * Attach Jev probabilities (member id -> probability) and re-rank: email owners
 * first, then Jev's probability, then the name score. Without probabilities
 * (Jev off or failed) the list is returned unchanged.
 */
export function applyJevProbabilities(
  candidates: readonly MatchCandidate[],
  probabilities: ReadonlyMap<string, number> | undefined,
): MatchCandidate[] {
  if (!probabilities || probabilities.size === 0) return [...candidates]
  const emailFirst = (c: MatchCandidate) => (c.email_match ? 0 : 1)
  return candidates
    .map((c) => ({ ...c, jev_probability: probabilities.get(c.id) ?? 0 }))
    .sort(
      (a, b) =>
        emailFirst(a) - emailFirst(b) ||
        (b.jev_probability ?? 0) - (a.jev_probability ?? 0) ||
        b.sim - a.sim,
    )
}

export interface SuggestionCandidate<T extends DirectoryPerson> {
  person: T
  reasons: SuggestionReason[]
  score: number
}

// Name score for an initials match: every initial fits a leading name and the
// rest of the typed name appears too ("JC Eugenio" -> "Juan Carlos Eugenio"),
// or initials alone ("JC"), which many members may fit.
const INITIALS_WITH_NAME_SCORE = 0.85
const INITIALS_ONLY_SCORE = 0.6

// Exact contact matches outrank any name evidence.
const REASON_RANK: Record<SuggestionReason, number> = {
  email: 0,
  phone: 0,
  initials: 1,
  surname: 1,
  similar: 1,
}

/**
 * Members to suggest for a staff search that found no exact name match: exact
 * email or phone owners, initials ("JC" -> "Juan Carlos ..."), same surname,
 * and trigram look-alikes (typos). Members in `excludeIds` (already shown as
 * search results) are left out. Contact matches first, then name score; ties
 * prefer the typed first initial, then the name.
 */
export function buildMemberSuggestions<T extends DirectoryPerson & { email?: string | null }>(
  query: string,
  directory: readonly T[],
  fuzzy: readonly { id: string; sim: number }[],
  excludeIds: ReadonlySet<string>,
  limit: number,
): SuggestionCandidate<T>[] {
  const byId = new Map(directory.map((m) => [m.id, m]))
  const found = new Map<string, SuggestionCandidate<T>>()
  const add = (person: T | undefined, reason: SuggestionReason, sim = 0) => {
    if (!person || excludeIds.has(person.id)) return
    const prev = found.get(person.id)
    const score = Math.max(sim, nameMatchConfidence(query, person.name), prev?.score ?? 0)
    const reasons = prev?.reasons.includes(reason) ? prev.reasons : [...(prev?.reasons ?? []), reason]
    found.set(person.id, { person, reasons, score })
  }
  for (const m of findEmailMatches(query, directory)) add(m, 'email')
  for (const m of findPhoneMatches(query, directory)) add(m, 'phone')
  const initialsScore = (splitInitials(query)?.rest.length ?? 0) > 0 ? INITIALS_WITH_NAME_SCORE : INITIALS_ONLY_SCORE
  for (const m of findInitialsMatches(query, directory)) add(m, 'initials', initialsScore)
  for (const m of findSurnameCandidates(query, directory)) add(m, 'surname')
  for (const c of fuzzy) add(byId.get(c.id), 'similar', c.sim)

  const rank = (c: SuggestionCandidate<T>) => Math.min(...c.reasons.map((r) => REASON_RANK[r]))
  const initial = normalizeName(query)[0]
  const otherInitial = (c: SuggestionCandidate<T>) => (normalizeName(c.person.name)[0] === initial ? 0 : 1)
  return [...found.values()]
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.score - a.score ||
        otherInitial(a) - otherInitial(b) ||
        a.person.name.localeCompare(b.person.name),
    )
    .slice(0, limit)
}

export interface DuplicateVisitorFacts {
  membershipStatus: string | null
  isArchived: boolean
  // The member was created by this check-in's registration (created no earlier
  // than shortly before the check-in), not an older directory record.
  createdByCheckin: boolean
  // Rows elsewhere that point at the member, by "table.column". null when the
  // count could not be read.
  referenceCounts: Readonly<Record<string, number | null>>
}

// A walk-in's member row is inserted a moment before its check-in row.
const REGISTRATION_TOLERANCE_MS = 60_000

/**
 * Whether a member row was created by the registration behind a check-in:
 * created no earlier than shortly before the check-in time. Unparseable
 * timestamps count as not created by it.
 */
export function createdByCheckin(memberCreatedAt: string | null, checkedInAt: string | null): boolean {
  const created = Date.parse(memberCreatedAt ?? '')
  const checkedIn = Date.parse(checkedInAt ?? '')
  if (Number.isNaN(created) || Number.isNaN(checkedIn)) return false
  return created >= checkedIn - REGISTRATION_TOLERANCE_MS
}

/**
 * True only for a plain visitor record that this check-in's registration
 * created and that has no footprint anywhere else: not archived, and every
 * reference count read successfully as zero. Anything unknown keeps the record.
 */
export function canArchiveDuplicateVisitor(f: DuplicateVisitorFacts): boolean {
  const counts = Object.values(f.referenceCounts)
  return (
    f.membershipStatus === 'visitor' &&
    !f.isArchived &&
    f.createdByCheckin &&
    counts.length > 0 &&
    counts.every((n) => n === 0)
  )
}
