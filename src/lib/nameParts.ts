// Split-name helpers for members.first_name / middle_name / last_name / suffix.
//
// `members.name` stays the display and matching source. These helpers guess a
// split for the admin review screen (/admin/name-review) and the member form,
// and mirror the two-word backfill rule in
// supabase/2026-10-11_member_name_parts.sql (splitTwoTokenName). Kept pure and
// dependency-free, like nameMatch.ts, so the rules are unit-testable.

import type { NamePartsStatus } from './types'

export type { NamePartsStatus }

export interface NameParts {
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  suffix: string | null
}

export type NameGuessFlag =
  | 'empty'
  | 'single'
  | 'comma'
  | 'suffix'
  | 'particle'
  | 'initial'
  | 'nickname'
  | 'ambiguous_middle'
  | 'many_tokens'

export interface NameGuess extends NameParts {
  confidence: 'high' | 'medium' | 'low'
  flags: NameGuessFlag[]
}

/** Generational suffixes, compared lowercased with trailing dots and commas removed. */
export const SUFFIX_TOKENS: ReadonlySet<string> = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

/**
 * Surname particles that belong to the following word ("Dela Cruz",
 * "de los Reyes", "Sta. Maria"). Compared lowercased without a trailing dot.
 */
export const SURNAME_PARTICLES: ReadonlySet<string> = new Set([
  'de', 'dela', 'del', 'delos', 'delas', 'la', 'las', 'los', 'san', 'sta', 'sto', 'santa', 'santo', 'y',
  'da', 'di', 'van', 'von',
])

/**
 * Lowercased first words that block the two-word auto split. Must equal the
 * first NOT IN list in supabase/2026-10-11_member_name_parts.sql (section 4).
 */
export const AUTO_SPLIT_BLOCKED_FIRST: readonly string[] = [
  'de', 'dela', 'del', 'delos', 'delas', 'la', 'las', 'los', 'san', 'sta', 'sto', 'santa', 'santo', 'y', 'da', 'di',
  'van', 'von', 'ma',
]

/**
 * Lowercased second words that block the two-word auto split. Must equal the
 * second NOT IN list in supabase/2026-10-11_member_name_parts.sql (section 4).
 */
export const AUTO_SPLIT_BLOCKED_LAST: readonly string[] = [
  'jr', 'sr', 'ii', 'iii', 'iv', 'de', 'dela', 'del', 'la', 'las', 'los', 'san', 'sta', 'sto', 'santa', 'santo', 'y',
]

const EMPTY_PARTS: NameParts = { first_name: null, middle_name: null, last_name: null, suffix: null }

// Letters, apostrophes and hyphens only; same as the SQL [[:alpha:]'-] check.
const PLAIN_WORD = /^[\p{L}'-]+$/u
// "C", "C." : a one-letter middle initial.
const INITIAL = /^\p{L}\.?$/u

/** Trim and collapse inner whitespace; blank becomes null. */
export function cleanPart(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return cleaned === '' ? null : cleaned
}

/** Whitespace-separated words of a name, trimmed. */
export function tokenizeName(name: string | null | undefined): string[] {
  if (!name) return []
  return name.trim().split(/\s+/).filter(Boolean)
}

/** Join the non-blank parts with single spaces: first, middle, last, suffix. */
export function composeName(parts: Partial<NameParts>): string {
  return [parts.first_name, parts.middle_name, parts.last_name, parts.suffix]
    .map((p) => cleanPart(p))
    .filter((p): p is string => p !== null)
    .join(' ')
}

/** True when both a first and a last name are present. */
export function hasNameParts(parts: Pick<NameParts, 'first_name' | 'last_name'>): boolean {
  return cleanPart(parts.first_name) !== null && cleanPart(parts.last_name) !== null
}

/**
 * The two-word backfill rule, exactly as the migration applies it: two plain
 * words (letters, apostrophes, hyphens; 2+ characters each), no comma, and no
 * blocked word. Returns null for every name the rule leaves pending.
 */
export function splitTwoTokenName(name: string | null | undefined): { first_name: string; last_name: string } | null {
  if (!name || name.includes(',')) return null
  const tokens = tokenizeName(name)
  if (tokens.length !== 2) return null
  const [first, last] = tokens
  const plain = (t: string) => [...t].length >= 2 && PLAIN_WORD.test(t)
  if (!plain(first) || !plain(last)) return null
  if (AUTO_SPLIT_BLOCKED_FIRST.includes(first.toLowerCase())) return null
  if (AUTO_SPLIT_BLOCKED_LAST.includes(last.toLowerCase())) return null
  return { first_name: first, last_name: last }
}

const bare = (token: string) => token.toLowerCase().replace(/[.,]+$/, '')
const isSuffix = (token: string) => SUFFIX_TOKENS.has(bare(token))
const isParticle = (token: string) => SURNAME_PARTICLES.has(bare(token))
const isMaPrefix = (token: string) => bare(token) === 'ma'

/**
 * Take the last word plus any particles before it, keeping at least `keep`
 * words in front. ["Juan","Dela","Cruz"] -> group "Dela Cruz", rest ["Juan"].
 */
function takeTrailingGroup(tokens: string[], keep: number): { group: string[]; rest: string[] } {
  let start = tokens.length - 1
  while (start - 1 >= keep && isParticle(tokens[start - 1])) start--
  return { group: tokens.slice(start), rest: tokens.slice(0, start) }
}

/**
 * Best-guess split of a space-form name (no comma). Suffix first, then the
 * surname with its particles, then the middle (last remaining word with its
 * particles), and the rest is the first name. "Ma."/"Ma" as the first word
 * joins the next word ("Ma. Cristina").
 */
function guessSpaceForm(raw: string[], flags: NameGuessFlag[]): NameParts {
  let tokens = [...raw]
  let suffix: string | null = null

  if (tokens.length >= 3 && isSuffix(tokens[tokens.length - 1])) {
    suffix = tokens[tokens.length - 1].replace(/,+$/, '')
    tokens = tokens.slice(0, -1)
    flags.push('suffix')
  }

  if (tokens.length >= 3 && isMaPrefix(tokens[0])) {
    tokens = [`${tokens[0]} ${tokens[1]}`, ...tokens.slice(2)]
  }

  if (tokens.length === 0) return { ...EMPTY_PARTS, suffix }
  if (tokens.length === 1) {
    flags.push('single')
    return { first_name: tokens[0], middle_name: null, last_name: null, suffix }
  }

  const surname = takeTrailingGroup(tokens, 1)
  if (surname.group.length > 1) flags.push('particle')
  const remaining = surname.rest
  const last_name = surname.group.join(' ')

  if (remaining.length === 1) {
    return { first_name: remaining[0], middle_name: null, last_name, suffix }
  }

  const middle = takeTrailingGroup(remaining, 1)
  if (middle.group.length > 1 && !flags.includes('particle')) flags.push('particle')
  const middle_name = middle.group.join(' ')
  if (INITIAL.test(middle_name)) flags.push('initial')
  else flags.push(middle.rest.length > 1 ? 'many_tokens' : 'ambiguous_middle')

  return { first_name: middle.rest.join(' '), middle_name, last_name, suffix }
}

/**
 * Comma forms. "Juan Cruz, Jr." is a space-form name with a suffix. Anything
 * else is surname first: "Dela Cruz, Juan, C." or "Cruz, Juan C.".
 */
function guessCommaForm(name: string, flags: NameGuessFlag[]): NameParts {
  const segments = name.split(',').map((s) => s.trim()).filter(Boolean)

  if (segments.length === 2 && isSuffix(segments[1]) && !segments[1].includes(' ')) {
    const parts = guessSpaceForm(tokenizeName(segments[0]), flags)
    if (!flags.includes('suffix')) flags.push('suffix')
    return { ...parts, suffix: segments[1] }
  }

  flags.push('comma')
  const suffixIndex = segments.findIndex((seg, i) => i > 0 && isSuffix(seg) && !seg.includes(' '))
  const suffix = suffixIndex === -1 ? null : segments[suffixIndex]
  const rest = segments.filter((_, i) => i !== suffixIndex)
  if (suffix) flags.push('suffix')

  const last_name = cleanPart(rest[0])
  let first_name = cleanPart(rest[1])
  let middle_name: string | null = null

  if (rest.length >= 3) {
    const m = cleanPart(rest.slice(2).join(' '))
    // A full middle name with a stray trailing dot ("Santos.") loses the dot;
    // an initial ("C.") keeps it.
    middle_name = m && !INITIAL.test(m) ? m.replace(/\.+$/, '') : m
  } else if (first_name) {
    const given = tokenizeName(first_name)
    if (given.length >= 2 && INITIAL.test(given[given.length - 1])) {
      middle_name = given[given.length - 1]
      first_name = given.slice(0, -1).join(' ')
    }
  }
  if (middle_name && INITIAL.test(middle_name)) flags.push('initial')

  return { first_name, middle_name, last_name, suffix }
}

/** Pull "(Bong)" and "Bong" in quotes out of a name; they are nicknames, not parts. */
function stripNicknames(name: string, flags: NameGuessFlag[]): string {
  const stripped = name.replace(/\([^)]*\)|"[^"]*"|“[^”]*”/g, ' ')
  if (stripped !== name) flags.push('nickname')
  return stripped
}

/**
 * Best-guess split of a full name for an admin to confirm. Keeps the original
 * casing and never rewrites words. Confidence:
 *   high    two words, or a middle initial ("Juan C. Cruz")
 *   medium  a full middle name, 4+ words, commas, nicknames
 *   low     empty or one word
 */
export function guessNameParts(name: string | null | undefined): NameGuess {
  const flags: NameGuessFlag[] = []
  const cleaned = stripNicknames(name ?? '', flags).trim()

  if (!cleaned.replace(/[,\s]/g, '')) {
    return { ...EMPTY_PARTS, confidence: 'low', flags: ['empty'] }
  }

  const parts = cleaned.includes(',')
    ? guessCommaForm(cleaned, flags)
    : guessSpaceForm(tokenizeName(cleaned), flags)

  const confidence: NameGuess['confidence'] =
    flags.includes('single') || !parts.first_name
      ? 'low'
      : flags.some((f) => f === 'comma' || f === 'nickname' || f === 'ambiguous_middle' || f === 'many_tokens')
        ? 'medium'
        : 'high'

  return { ...parts, confidence, flags }
}

/** Move the middle name to the end of the first name ("John" + "Paul" -> "John Paul"). */
export function joinMiddleToFirst(parts: NameParts): NameParts {
  if (!cleanPart(parts.middle_name)) return parts
  return { ...parts, first_name: composeName({ first_name: parts.first_name, middle_name: parts.middle_name }), middle_name: null }
}

/** Move the middle name to the front of the last name ("Santos" + "Reyes" -> "Santos Reyes"). */
export function joinMiddleToLast(parts: NameParts): NameParts {
  if (!cleanPart(parts.middle_name)) return parts
  return { ...parts, last_name: composeName({ middle_name: parts.middle_name, last_name: parts.last_name }), middle_name: null }
}

export interface NamePartsSource {
  name: string
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  suffix?: string | null
  name_parts_status?: NamePartsStatus | null
}

/**
 * The parts to show for a member: the stored split when it is trusted
 * (auto or confirmed), otherwise a fresh guess from `name`.
 */
export function initialNameParts(member: NamePartsSource): { parts: NameParts; source: 'confirmed' | 'auto' | 'guess'; guess: NameGuess | null } {
  const status = member.name_parts_status ?? 'pending'
  if (status !== 'pending' && cleanPart(member.first_name)) {
    return {
      parts: {
        first_name: cleanPart(member.first_name),
        middle_name: cleanPart(member.middle_name),
        last_name: cleanPart(member.last_name),
        suffix: cleanPart(member.suffix),
      },
      source: status,
      guess: null,
    }
  }
  const guess = guessNameParts(member.name)
  const parts: NameParts = {
    first_name: guess.first_name,
    middle_name: guess.middle_name,
    last_name: guess.last_name,
    suffix: guess.suffix,
  }
  return { parts, source: 'guess', guess }
}

const NAME_PART_KEYS = ['first_name', 'middle_name', 'last_name', 'suffix'] as const

/** Review stamp written with a confirmed split. */
export type NamePartsReviewStamp = {
  name_parts_status: 'confirmed'
  name_parts_reviewed_at: string
  name_parts_reviewed_by: string
}

/**
 * Server-side handling of member saves (createMember / updateMember /
 * confirmNameParts). Name parts come only from the admin member form and the
 * review screen, which send all four. Blank parts become null. A save with
 * parts must carry a first and a last name and marks the split confirmed by
 * the caller. A save without parts is returned unchanged, so an unrelated edit
 * never touches the review state. Never adds or changes `name`.
 */
export function withNamePartsReview<T extends object>(
  fields: T,
  userId: string,
  now: Date = new Date(),
): T | (T & NamePartsReviewStamp) {
  const record = fields as Record<string, unknown>
  const sent = NAME_PART_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(fields, k))
  if (sent.length === 0) return fields
  const cleaned: Partial<NameParts> = Object.fromEntries(
    sent.map((k) => [k, typeof record[k] === 'string' ? cleanPart(record[k] as string) : null]),
  )
  const next = { ...fields, ...cleaned }
  if (!hasNameParts({ first_name: next.first_name ?? null, last_name: next.last_name ?? null })) {
    throw new Error('First name and last name required.')
  }
  return {
    ...next,
    name_parts_status: 'confirmed',
    name_parts_reviewed_at: now.toISOString(),
    name_parts_reviewed_by: userId,
  }
}
