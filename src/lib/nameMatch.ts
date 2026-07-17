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

/**
 * Resolve a typed name/phone to a single directory member for auto-linking.
 * Resolution order:
 *   1. Exact normalized name — auto-link only when exactly one member matches.
 *   2. Phone — auto-link only when exactly one member has that normalized number.
 * Ambiguous (more than one match) or unknown returns null: the caller records
 * the check-in as pending for admin review rather than guessing.
 */
export function resolveMemberMatch<T extends DirectoryMember>(
  rawName: string,
  rawPhone: string | null | undefined,
  directory: readonly T[],
): T | null {
  const exact = findExactNameMatches(rawName, directory)
  if (exact.length === 1) return exact[0]

  const phone = normalizePhone(rawPhone)
  if (phone) {
    const byPhone = directory.filter((m) => normalizePhone(m.phone) === phone)
    if (byPhone.length === 1) return byPhone[0]
  }

  return null
}
