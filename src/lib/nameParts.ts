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
  | 'title'
  | 'stray_dot'
  | 'ambiguous_middle'
  | 'many_tokens'

/** What one word of `name` is: a part, or left out (titles, nicknames). */
export type WordRole = 'first' | 'middle' | 'last' | 'suffix' | 'skip'

export interface NameWord {
  /** The word as written in `name`, without commas. */
  text: string
  role: WordRole
}

export interface NameGuess extends NameParts {
  confidence: 'high' | 'medium' | 'low'
  flags: NameGuessFlag[]
  /** Every word of the name with its guessed role, in name order. */
  words: NameWord[]
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

/** Title words left out of the parts ("Sister", "Pastor", "Dr."). Compared lowercased without a dot. */
export const TITLE_WORDS: ReadonlySet<string> = new Set([
  'sister', 'sis', 'bro', 'brother', 'ptr', 'pastor', 'pastora', 'pas', 'rev', 'fr', 'dr', 'engr', 'atty',
])

// Abbreviations that keep their dot inside a part.
const KEEP_DOT: ReadonlySet<string> = new Set(['ma', 'sta', 'sto', 'jr', 'sr'])

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
const isTitle = (token: string) => TITLE_WORDS.has(bare(token))

/**
 * A word as it goes into a part. A stray dot after a full word goes
 * ("Dan." -> "Dan"); initials ("C."), "Ma.", "Sta.", "Jr." keep theirs.
 */
export function partWord(text: string): string {
  const letters = [...text.replace(/[^\p{L}]/gu, '')].length
  if (text.endsWith('.') && letters >= 3 && !KEEP_DOT.has(bare(text)) && !SUFFIX_TOKENS.has(bare(text))) {
    return text.replace(/\.+$/, '')
  }
  return text
}

/** The four parts from word roles: each part is its words in name order. */
export function partsFromWords(words: readonly NameWord[]): NameParts {
  const join = (role: WordRole) =>
    cleanPart(words.filter((w) => w.role === role).map((w) => partWord(w.text)).join(' '))
  return { first_name: join('first'), middle_name: join('middle'), last_name: join('last'), suffix: join('suffix') }
}

/** Every word with a different role swapped: e.g. middle -> first. Returns a new array. */
export function moveRole(words: readonly NameWord[], from: WordRole, to: WordRole): NameWord[] {
  return words.map((w) => (w.role === from ? { ...w, role: to } : w))
}

/** One word's role changed. Returns a new array. */
export function setWordRole(words: readonly NameWord[], index: number, role: WordRole): NameWord[] {
  return words.map((w, i) => (i === index ? { ...w, role } : w))
}

interface RawWord {
  text: string
  /** Commas before this word: 0 for the first segment. */
  segment: number
}

/** Words of a name with commas taken out; each word remembers its comma segment. */
function splitWords(name: string): RawWord[] {
  const out: RawWord[] = []
  let segment = 0
  for (const token of tokenizeName(name.replace(/,/g, ' , '))) {
    if (token === ',') segment++
    else out.push({ text: token, segment })
  }
  return out
}

// Groups of word indices handled as one unit ("Ma." + "Cristina").
type Unit = number[]

/** Units from the end: the last unit plus particle units before it, keeping `keep` in front. */
function trailingGroup(units: Unit[], words: RawWord[], keep: number): { group: Unit[]; rest: Unit[] } {
  const particle = (u: Unit) => u.length === 1 && isParticle(words[u[0]].text)
  let start = units.length - 1
  while (start - 1 >= keep && particle(units[start - 1])) start--
  return { group: units.slice(start), rest: units.slice(0, start) }
}

/** "Ma."/"Ma" in front joins the next word when 3+ units remain. */
function glueMa(units: Unit[], words: RawWord[], min = 3): Unit[] {
  if (units.length >= min && isMaPrefix(words[units[0][0]].text)) {
    return [[...units[0], ...units[1]], ...units.slice(2)]
  }
  return units
}

/** Given-name units: one unit is the first name; with more, the last unit (and its particles) is the middle. */
function assignGiven(units: Unit[], words: RawWord[], roles: WordRole[], flags: NameGuessFlag[]): void {
  const set = (us: Unit[], role: WordRole) => us.forEach((u) => u.forEach((i) => (roles[i] = role)))
  if (units.length === 0) return
  if (units.length === 1) {
    set(units, 'first')
    return
  }
  const middle = trailingGroup(units, words, 1)
  if (middle.group.length > 1 && !flags.includes('particle')) flags.push('particle')
  set(middle.group, 'middle')
  set(middle.rest, 'first')
  const middleText = middle.group.flat().map((i) => words[i].text).join(' ')
  if (INITIAL.test(middleText)) flags.push('initial')
  else flags.push(middle.rest.length > 1 ? 'many_tokens' : 'ambiguous_middle')
}

/** Surname at the end: "Juan C. Dela Cruz". */
function assignFirstLast(units: Unit[], words: RawWord[], roles: WordRole[], flags: NameGuessFlag[]): void {
  units = glueMa(units, words)
  if (units.length === 1) {
    units[0].forEach((i) => (roles[i] = 'first'))
    flags.push('single')
    return
  }
  const surname = trailingGroup(units, words, 1)
  if (surname.group.length > 1) flags.push('particle')
  surname.group.flat().forEach((i) => (roles[i] = 'last'))
  assignGiven(surname.rest, words, roles, flags)
}

/** Surname in front: "Navarro Liza Mae", "Dela Cruz Juan". */
function assignLastFirst(units: Unit[], words: RawWord[], roles: WordRole[], flags: NameGuessFlag[]): void {
  const particle = (u: Unit) => u.length === 1 && isParticle(words[u[0]].text)
  let end = 0
  while (end < units.length - 1 && particle(units[end])) end++
  units.slice(0, end + 1).flat().forEach((i) => (roles[i] = 'last'))
  if (end > 0) flags.push('particle')
  const given = glueMa(units.slice(end + 1), words, 2)
  if (given.length === 0) flags.push('single')
  assignGiven(given, words, roles, flags)
}

/**
 * Surname-first comma form: "Dela Cruz, Juan, C." or "Cruz, Juan C.".
 * Segment 0 is the last name, segment 1 the first name (a trailing initial
 * there is the middle), segments 2+ the middle name.
 */
function assignComma(core: number[], words: RawWord[], roles: WordRole[], flags: NameGuessFlag[]): void {
  const seg = (n: number) => core.filter((i) => words[i].segment === n)
  seg(0).forEach((i) => (roles[i] = 'last'))
  const given = seg(1)
  const middle = core.filter((i) => words[i].segment >= 2)
  if (middle.length === 0 && given.length >= 2 && INITIAL.test(words[given[given.length - 1]].text)) {
    middle.push(given.pop()!)
  }
  given.forEach((i) => (roles[i] = 'first'))
  middle.forEach((i) => (roles[i] = 'middle'))
  if (middle.length === 1 && INITIAL.test(words[middle[0]].text)) flags.push('initial')
}

/**
 * Best-guess role for every word, for an admin to confirm. Keeps the original
 * words; only partWord() drops stray dots when the parts are built.
 *   order 'first-last'  (default) surname at the end, or surname-first when
 *                       written with a comma ("Cruz, Juan")
 *   order 'last-first'  surname in front, no comma ("Navarro Liza Mae")
 * Titles ("Sister") and nicknames in brackets or quotes are left out. A
 * suffix (Jr., Sr., II, III, IV) is found anywhere after the first word.
 * Confidence:
 *   high    two words, or a middle initial ("Juan C. Cruz")
 *   medium  a full middle name, 4+ words, commas, nicknames, titles, stray dots
 *   low     empty or one word
 */
export function guessWordRoles(
  name: string | null | undefined,
  order: 'first-last' | 'last-first' = 'first-last',
): { words: NameWord[]; flags: NameGuessFlag[]; confidence: NameGuess['confidence'] } {
  const raw = splitWords(name ?? '')
  if (raw.length === 0) return { words: [], flags: ['empty'], confidence: 'low' }

  const flags: NameGuessFlag[] = []
  const roles: WordRole[] = raw.map(() => 'first')

  // Nicknames: every word inside brackets or quotes.
  let open: string | null = null
  raw.forEach((w, i) => {
    const t = w.text
    let opened = false
    if (!open && /^[("“]/.test(t)) {
      open = t[0] === '(' ? ')' : t[0] === '“' ? '”' : '"'
      opened = true
    }
    if (open) {
      roles[i] = 'skip'
      if (!flags.includes('nickname')) flags.push('nickname')
      // A lone opening bracket does not close itself.
      if (t.endsWith(open) && !(opened && t.length === 1)) open = null
    }
  })
  raw.forEach((w, i) => {
    if (roles[i] === 'skip') return
    if (isTitle(w.text)) {
      roles[i] = 'skip'
      if (!flags.includes('title')) flags.push('title')
    }
  })
  const firstKept = roles.findIndex((r) => r !== 'skip')
  raw.forEach((w, i) => {
    if (roles[i] !== 'skip' && i !== firstKept && isSuffix(w.text)) {
      roles[i] = 'suffix'
      if (!flags.includes('suffix')) flags.push('suffix')
    }
  })

  const core = raw.map((_, i) => i).filter((i) => roles[i] !== 'skip' && roles[i] !== 'suffix')
  const hasComma = raw.some((w) => w.segment > 0)
  if (hasComma) flags.push('comma')

  if (core.length > 0) {
    const seg0 = core.filter((i) => raw[i].segment === 0)
    const surnameFirstComma =
      order === 'first-last' &&
      hasComma &&
      seg0.length > 0 &&
      core.some((i) => raw[i].segment > 0) &&
      seg0.filter((i) => !isParticle(raw[i].text)).length <= 1
    if (surnameFirstComma) assignComma(core, raw, roles, flags)
    else if (order === 'last-first') assignLastFirst(core.map((i) => [i]), raw, roles, flags)
    else assignFirstLast(core.map((i) => [i]), raw, roles, flags)
  }

  const words: NameWord[] = raw.map((w, i) => ({ text: w.text, role: roles[i] }))
  if (words.some((w) => w.role !== 'skip' && partWord(w.text) !== w.text)) flags.push('stray_dot')

  const parts = partsFromWords(words)
  const confidence: NameGuess['confidence'] =
    flags.includes('single') || !parts.first_name
      ? 'low'
      : flags.some((f) =>
            ['comma', 'nickname', 'title', 'stray_dot', 'ambiguous_middle', 'many_tokens'].includes(f),
          )
        ? 'medium'
        : 'high'
  return { words, flags, confidence }
}

/** Best-guess split of a full name (see guessWordRoles). */
export function guessNameParts(name: string | null | undefined): NameGuess {
  const g = guessWordRoles(name)
  return { ...partsFromWords(g.words), confidence: g.confidence, flags: g.flags, words: g.words }
}

/**
 * Roles for the words of `name` that rebuild stored parts, for showing a
 * stored split as word menus. A word found in no part is left out.
 */
export function rolesFromParts(name: string, parts: NameParts): NameWord[] {
  const key = (t: string) => partWord(t).toLowerCase().replace(/[.,]+$/, '')
  const queues: [WordRole, string[]][] = [
    ['first', tokenizeName(parts.first_name).map(key)],
    ['middle', tokenizeName(parts.middle_name).map(key)],
    ['last', tokenizeName(parts.last_name).map(key)],
    ['suffix', tokenizeName(parts.suffix).map(key)],
  ]
  return splitWords(name).map((w) => {
    const k = key(w.text)
    const hit = queues.find(([, q]) => q[0] === k)
    if (!hit) return { text: w.text, role: 'skip' as WordRole }
    hit[1].shift()
    return { text: w.text, role: hit[0] }
  })
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

/**
 * Word menus and parts to show for a member on the review screen: the stored
 * split when trusted (words mapped back with rolesFromParts), otherwise a
 * fresh guess from `name`.
 */
export function initialWordRoles(member: NamePartsSource): {
  words: NameWord[]
  parts: NameParts
  source: 'confirmed' | 'auto' | 'guess'
  guess: NameGuess | null
} {
  const init = initialNameParts(member)
  if (init.guess) return { words: init.guess.words, parts: init.parts, source: init.source, guess: init.guess }
  return { words: rolesFromParts(member.name, init.parts), parts: init.parts, source: init.source, guess: null }
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
