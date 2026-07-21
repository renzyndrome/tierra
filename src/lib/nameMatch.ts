// Name / phone normalization helpers for service-attendance matching.
// Kept dependency-free and pure so the matching logic is unit-testable in
// isolation from Supabase.

/**
 * Normalize a person's name for exact-match comparison:
 * strip diacritics, lowercase, replace punctuation with spaces, collapse
 * whitespace. "Jose  Cruz-Reyes!" -> "jose cruz reyes".
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation -> space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize a Philippine phone number to a comparable digit string.
 * Drops non-digits and maps local mobile format to the country-code form:
 * "0917 123 4567" and "+63 917 123 4567" both -> "639171234567".
 * Returns null when there are no usable digits.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return '63' + digits.slice(1)
  return digits
}

export interface NamedRecord {
  id: string
  name: string
}

export interface DirectoryMember extends NamedRecord {
  phone: string | null
}

/**
 * Find members whose normalized name exactly equals the normalized query.
 * Returns all exact matches (caller decides what to do when there is more
 * than one — an ambiguous match should not auto-link).
 */
export function findExactNameMatches<T extends NamedRecord>(
  query: string,
  members: readonly T[],
): T[] {
  const target = normalizeName(query)
  if (!target) return []
  return members.filter((m) => normalizeName(m.name) === target)
}

// Confidence at/above which a fuzzy name match is trusted enough to auto-link
// without human review. Below this, the check-in goes to the review queue.
export const AUTO_MATCH_CONFIDENCE = 0.9

/**
 * Confidence (0..1) that a typed name refers to a given member's name, using a
 * token-set comparison (order- and duplicate-insensitive). Designed so that
 * middle-name usage scores high — a Filipino naming pattern:
 *   "Laurence Rebadulla" vs "Gabriel Laurence Rebadulla" -> 0.9
 * Scoring:
 *   1.00  identical normalized strings
 *   0.97  same set of tokens (order/dupes aside)
 *   0.90  one name's tokens are a subset of the other, with >= 2 shared tokens
 *         (a confident partial — e.g. dropped/added first or middle name)
 *   else  Dice coefficient over the token sets (2*shared / (a + b))
 * A single shared token (e.g. just a first name) never reaches 0.90, so it
 * won't auto-link.
 */
export function nameMatchConfidence(typed: string | null | undefined, candidate: string | null | undefined): number {
  const a = normalizeName(typed)
  const b = normalizeName(candidate)
  if (!a || !b) return 0
  if (a === b) return 1

  const setA = new Set(a.split(' '))
  const setB = new Set(b.split(' '))
  let shared = 0
  for (const t of setA) if (setB.has(t)) shared++

  if (shared === setA.size && shared === setB.size) return 0.97
  if (shared >= 2 && (shared === setA.size || shared === setB.size)) return 0.9
  return (2 * shared) / (setA.size + setB.size)
}

/**
 * Resolve a typed name/phone to a single directory member for auto-linking.
 * Resolution order:
 *   1. Confident name match (exact or high-confidence subset) — auto-link only
 *      when exactly ONE member clears AUTO_MATCH_CONFIDENCE. Ties (e.g. two
 *      family members sharing a name) stay ambiguous and go to review.
 *   2. Phone — auto-link (and disambiguate ties) when exactly one member has
 *      that normalized number.
 * Anything else returns null: the caller records the check-in as pending for
 * admin review rather than guessing.
 */
export function resolveMemberMatch<T extends DirectoryMember>(
  rawName: string,
  rawPhone: string | null | undefined,
  directory: readonly T[],
  autoThreshold: number = AUTO_MATCH_CONFIDENCE,
): T | null {
  // Members confident enough to auto-link (deduped by id).
  const byId = new Map<string, T>()
  for (const m of directory) {
    if (nameMatchConfidence(rawName, m.name) >= autoThreshold) byId.set(m.id, m)
  }
  if (byId.size === 1) return [...byId.values()][0]

  // Phone can both stand alone and break a name tie.
  const phone = normalizePhone(rawPhone)
  if (phone) {
    const byPhone = directory.filter((m) => normalizePhone(m.phone) === phone)
    if (byPhone.length === 1) return byPhone[0]
  }

  return null
}
