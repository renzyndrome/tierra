// Unit tests for the member split-name helpers (src/lib/nameParts.ts).

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AUTO_SPLIT_BLOCKED_FIRST,
  AUTO_SPLIT_BLOCKED_LAST,
  cleanPart,
  composeName,
  guessNameParts,
  guessWordRoles,
  hasNameParts,
  initialNameParts,
  initialWordRoles,
  moveRole,
  partWord,
  partsFromWords,
  rolesFromParts,
  setWordRole,
  joinMiddleToFirst,
  joinMiddleToLast,
  splitTwoTokenName,
  tokenizeName,
  withNamePartsReview,
  type NameParts,
  type WordRole,
} from '../../lib/nameParts'

const parts = (first: string | null, middle: string | null, last: string | null, suffix: string | null = null): NameParts => ({
  first_name: first,
  middle_name: middle,
  last_name: last,
  suffix,
})

const partsOf = (name: string): NameParts => {
  const g = guessNameParts(name)
  return parts(g.first_name, g.middle_name, g.last_name, g.suffix)
}

describe('cleanPart / tokenizeName / composeName', () => {
  it('trims, collapses whitespace and turns blank into null', () => {
    expect(cleanPart('  Juan   Carlo ')).toBe('Juan Carlo')
    expect(cleanPart('   ')).toBeNull()
    expect(cleanPart(null)).toBeNull()
  })

  it('tokenizes on any whitespace', () => {
    expect(tokenizeName('  Juan \t Dela  Cruz ')).toEqual(['Juan', 'Dela', 'Cruz'])
    expect(tokenizeName('')).toEqual([])
  })

  it('composes first, middle, last, suffix and skips blanks', () => {
    expect(composeName(parts('Juan', 'C.', 'Cruz', 'Jr.'))).toBe('Juan C. Cruz Jr.')
    expect(composeName(parts(' Juan ', '', 'Cruz', null))).toBe('Juan Cruz')
    expect(composeName({})).toBe('')
  })

  it('hasNameParts needs both first and last', () => {
    expect(hasNameParts({ first_name: 'Juan', last_name: 'Cruz' })).toBe(true)
    expect(hasNameParts({ first_name: 'Juan', last_name: ' ' })).toBe(false)
    expect(hasNameParts({ first_name: null, last_name: 'Cruz' })).toBe(false)
  })
})

describe('splitTwoTokenName (mirrors the SQL backfill)', () => {
  it.each([
    ['Juan Cruz', { first_name: 'Juan', last_name: 'Cruz' }],
    ['  Ana   Peña ', { first_name: 'Ana', last_name: 'Peña' }],
    ["Mary O'Brien", { first_name: 'Mary', last_name: "O'Brien" }],
    ['Ana Cruz-Reyes', { first_name: 'Ana', last_name: 'Cruz-Reyes' }],
  ])('splits %s', (name, expected) => {
    expect(splitTwoTokenName(name)).toEqual(expected)
  })

  it.each([
    'Juan C.', // initial with dot
    'Juan C', // one letter
    'Cruz Jr', // suffix
    'De Guzman', // particle first
    'Delos Santos', // particle first
    'Van Dyke', // particle first
    'Ma. Cruz', // dot
    'Ma Cruz', // Ma prefix
    'Cruz, Juan', // comma
    'Juan Dela Cruz', // three words
    'Bong', // one word
    'Juan (Bong)', // symbols
    'Juan2 Cruz', // digit
    '',
  ])('leaves %s pending', (name) => {
    expect(splitTwoTokenName(name)).toBeNull()
  })
})

describe('guessNameParts', () => {
  it.each<[string, NameParts]>([
    ['Juan Cruz', parts('Juan', null, 'Cruz')],
    ['Juan C. Cruz', parts('Juan', 'C.', 'Cruz')],
    ['Maria Santos Reyes', parts('Maria', 'Santos', 'Reyes')],
    ['John Paul C. Reyes', parts('John Paul', 'C.', 'Reyes')],
    ['Maria Cristina Santos Reyes', parts('Maria Cristina', 'Santos', 'Reyes')],
    ['Juan de la Cruz', parts('Juan', null, 'de la Cruz')],
    ['Maria Dela Cruz', parts('Maria', null, 'Dela Cruz')],
    ['Juan Dela Cruz Santos', parts('Juan', 'Dela Cruz', 'Santos')],
    ['Ana Santos de los Reyes', parts('Ana', 'Santos', 'de los Reyes')],
    ['Juan C. Dela Cruz', parts('Juan', 'C.', 'Dela Cruz')],
    ['Juan Cruz Jr.', parts('Juan', null, 'Cruz', 'Jr.')],
    ['Jose Reyes III', parts('Jose', null, 'Reyes', 'III')],
    ['Juan C. Cruz Jr', parts('Juan', 'C.', 'Cruz', 'Jr')],
    ['Ma. Cristina Reyes', parts('Ma. Cristina', null, 'Reyes')],
    ['Ma. Cristina Santos Reyes', parts('Ma. Cristina', 'Santos', 'Reyes')],
    ['Ana Cruz-Reyes', parts('Ana', null, 'Cruz-Reyes')],
    ['Bong', parts('Bong', null, null)],
    ['Juan (Bong) Cruz', parts('Juan', null, 'Cruz')],
  ])('splits %s', (name, expected) => {
    expect(partsOf(name)).toEqual(expected)
  })

  it.each<[string, NameParts]>([
    ['Dela Cruz, Juan, C.', parts('Juan', 'C.', 'Dela Cruz')],
    ['Cruz, Juan, Santos.', parts('Juan', 'Santos', 'Cruz')],
    ['Cruz, Juan C.', parts('Juan', 'C.', 'Cruz')],
    ['Cruz, Juan', parts('Juan', null, 'Cruz')],
    ['Cruz, Juan, Jr.', parts('Juan', null, 'Cruz', 'Jr.')],
    ['Juan Cruz, Jr.', parts('Juan', null, 'Cruz', 'Jr.')],
  ])('splits comma form %s', (name, expected) => {
    expect(partsOf(name)).toEqual(expected)
  })

  it('rates confidence', () => {
    expect(guessNameParts('Juan Cruz').confidence).toBe('high')
    expect(guessNameParts('Juan C. Cruz').confidence).toBe('high')
    expect(guessNameParts('Maria Santos Reyes').confidence).toBe('medium')
    expect(guessNameParts('Maria Cristina Santos Reyes').confidence).toBe('medium')
    expect(guessNameParts('Cruz, Juan').confidence).toBe('medium')
    expect(guessNameParts('Bong').confidence).toBe('low')
    expect(guessNameParts('').confidence).toBe('low')
  })

  it('flags what an admin should check', () => {
    expect(guessNameParts('Maria Santos Reyes').flags).toContain('ambiguous_middle')
    expect(guessNameParts('Maria Cristina Santos Reyes').flags).toContain('many_tokens')
    expect(guessNameParts('Juan C. Cruz').flags).toContain('initial')
    expect(guessNameParts('Juan Dela Cruz').flags).toContain('particle')
    expect(guessNameParts('Juan Cruz Jr.').flags).toContain('suffix')
    expect(guessNameParts('Cruz, Juan').flags).toContain('comma')
    expect(guessNameParts('Juan (Bong) Cruz').flags).toContain('nickname')
    expect(guessNameParts('Bong').flags).toContain('single')
    expect(guessNameParts('  ').flags).toEqual(['empty'])
  })

  it('keeps original casing', () => {
    expect(partsOf('JUAN DELA CRUZ')).toEqual(parts('JUAN', null, 'DELA CRUZ'))
  })

  it.each([
    'Juan Cruz',
    'Juan C. Cruz',
    'Maria Cristina Santos Reyes',
    'Juan de la Cruz',
    'Juan Dela Cruz Santos',
    'Juan C. Cruz Jr.',
    'Ma. Cristina Santos Reyes',
    '  Juan   Cruz ',
  ])('round-trips space-form %s through composeName', (name) => {
    expect(composeName(guessNameParts(name))).toBe(tokenizeName(name).join(' '))
  })
})

describe('guessNameParts: cases seen in the directory', () => {
  it.each<[string, NameParts]>([
    // Suffix in the middle of the name
    ['Alexander Jr. Pareja Bazar', parts('Alexander', 'Pareja', 'Bazar', 'Jr.')],
    ['Jose Iii L. Deveza', parts('Jose', 'L.', 'Deveza', 'Iii')],
    ['Sonny Sr. Martija Romero', parts('Sonny', 'Martija', 'Romero', 'Sr.')],
    // Title word left out
    ['Cindy Sister Bartolome', parts('Cindy', null, 'Bartolome')],
    ['Pastor Juan Cruz', parts('Juan', null, 'Cruz')],
    // Stray dot after a full word dropped, initials and abbreviations kept
    ['Hanzy Bom. Bobis', parts('Hanzy', 'Bom', 'Bobis')],
    ['Angela N. De Castro', parts('Angela', 'N.', 'De Castro')],
    ['Ma. Cristina Sta. Maria', parts('Ma. Cristina', null, 'Sta. Maria')],
    // Comma after more than one word is not surname-first
    ['April Micosa DA, Tuico', parts('April', 'Micosa', 'DA Tuico')],
    // Multi-word nickname
    ['Juan (Jun Jun) Cruz', parts('Juan', null, 'Cruz')],
    ['Juan "Bong" Cruz', parts('Juan', null, 'Cruz')],
  ])('splits %s', (name, expected) => {
    expect(partsOf(name)).toEqual(expected)
  })

  it('flags titles and stray dots', () => {
    expect(guessNameParts('Cindy Sister Bartolome').flags).toContain('title')
    expect(guessNameParts('Hanzy Bom. Bobis').flags).toContain('stray_dot')
    expect(guessNameParts('Angela N. De Castro').flags).not.toContain('stray_dot')
  })
})

describe('guessWordRoles', () => {
  const roles = (name: string, order?: 'first-last' | 'last-first') =>
    guessWordRoles(name, order).words.map((w) => `${w.text}:${w.role}`)

  it('gives every word a role, in name order', () => {
    expect(roles('Juan C. Dela Cruz Jr.')).toEqual(['Juan:first', 'C.:middle', 'Dela:last', 'Cruz:last', 'Jr.:suffix'])
    expect(roles('Cindy Sister Bartolome')).toEqual(['Cindy:first', 'Sister:skip', 'Bartolome:last'])
    expect(roles('Cruz, Juan')).toEqual(['Cruz:last', 'Juan:first'])
  })

  it('reads last name first on request', () => {
    expect(roles('Abando Chloe Gail', 'last-first')).toEqual(['Abando:last', 'Chloe:first', 'Gail:middle'])
    expect(roles('Abando Chloe', 'last-first')).toEqual(['Abando:last', 'Chloe:first'])
    expect(roles('Dela Cruz Juan Carlo', 'last-first')).toEqual(['Dela:last', 'Cruz:last', 'Juan:first', 'Carlo:middle'])
    expect(roles('Reyes Ma. Cristina Santos', 'last-first')).toEqual([
      'Reyes:last',
      'Ma.:first',
      'Cristina:first',
      'Santos:middle',
    ])
    expect(roles('Santos Juan Jr.', 'last-first')).toEqual(['Santos:last', 'Juan:first', 'Jr.:suffix'])
  })

  it('returns no words for an empty name', () => {
    expect(guessWordRoles('  ')).toEqual({ words: [], flags: ['empty'], confidence: 'low' })
  })

  it('keeps a lone opening bracket open', () => {
    expect(roles('Juan ( Bong ) Cruz')).toEqual(['Juan:first', '(:skip', 'Bong:skip', '):skip', 'Cruz:last'])
  })
})

describe('word role helpers', () => {
  const w = (text: string, role: WordRole) => ({ text, role })

  it('builds parts from roles in name order', () => {
    expect(partsFromWords([w('Abando', 'last'), w('Chloe', 'first'), w('Gail', 'first')])).toEqual(
      parts('Chloe Gail', null, 'Abando'),
    )
    expect(partsFromWords([w('Hanzy', 'first'), w('Bom.', 'middle'), w('Bobis', 'last'), w('Sister', 'skip')])).toEqual(
      parts('Hanzy', 'Bom', 'Bobis'),
    )
  })

  it('drops stray dots but keeps initials and abbreviations', () => {
    expect(partWord('Bom.')).toBe('Bom')
    expect(partWord('C.')).toBe('C.')
    expect(partWord('Ma.')).toBe('Ma.')
    expect(partWord('Sta.')).toBe('Sta.')
    expect(partWord('Jr.')).toBe('Jr.')
    expect(partWord('Iii.')).toBe('Iii.')
  })

  it('changes one word or one role without touching the input', () => {
    const words = [w('Abando', 'first'), w('Chloe', 'middle'), w('Gail', 'last')]
    const moved = moveRole(words, 'middle', 'first')
    expect(moved.map((x) => x.role)).toEqual(['first', 'first', 'last'])
    const set = setWordRole(words, 0, 'last')
    expect(set.map((x) => x.role)).toEqual(['last', 'middle', 'last'])
    expect(words.map((x) => x.role)).toEqual(['first', 'middle', 'last'])
  })

  it('maps stored parts back onto the words', () => {
    expect(rolesFromParts('Abando Chloe Gail', parts('Chloe Gail', null, 'Abando')).map((x) => x.role)).toEqual([
      'last',
      'first',
      'first',
    ])
    expect(rolesFromParts('Hanzy Bom. Bobis', parts('Hanzy', 'Bom', 'Bobis')).map((x) => x.role)).toEqual([
      'first',
      'middle',
      'last',
    ])
    expect(rolesFromParts('Cindy Sister Bartolome', parts('Cindy', null, 'Bartolome')).map((x) => x.role)).toEqual([
      'first',
      'skip',
      'last',
    ])
  })

  it('initialWordRoles uses the stored split when trusted', () => {
    const r = initialWordRoles({
      name: 'Abando Chloe Gail',
      first_name: 'Chloe Gail',
      last_name: 'Abando',
      name_parts_status: 'confirmed',
    })
    expect(r.source).toBe('confirmed')
    expect(r.words.map((x) => x.role)).toEqual(['last', 'first', 'first'])
    expect(r.parts).toEqual(parts('Chloe Gail', null, 'Abando'))
  })

  it('initialWordRoles guesses when pending', () => {
    const r = initialWordRoles({ name: 'Juan C. Cruz', name_parts_status: 'pending' })
    expect(r.source).toBe('guess')
    expect(r.words.map((x) => x.role)).toEqual(['first', 'middle', 'last'])
    expect(r.parts).toEqual(parts('Juan', 'C.', 'Cruz'))
  })
})

describe('joinMiddleToFirst / joinMiddleToLast', () => {
  it('moves the middle name into the first name', () => {
    expect(joinMiddleToFirst(parts('John', 'Paul', 'Reyes'))).toEqual(parts('John Paul', null, 'Reyes'))
  })

  it('moves the middle name into the last name', () => {
    expect(joinMiddleToLast(parts('Ana', 'Santos', 'Reyes'))).toEqual(parts('Ana', null, 'Santos Reyes'))
  })

  it('returns the same parts when there is no middle name', () => {
    const p = parts('Juan', null, 'Cruz')
    expect(joinMiddleToFirst(p)).toBe(p)
    expect(joinMiddleToLast(p)).toBe(p)
  })

  it('does not change the input object', () => {
    const p = parts('John', 'Paul', 'Reyes')
    joinMiddleToFirst(p)
    expect(p).toEqual(parts('John', 'Paul', 'Reyes'))
  })
})

describe('initialNameParts', () => {
  it('uses stored parts when the split is trusted', () => {
    const r = initialNameParts({
      name: 'Juan Carlo Cruz',
      first_name: 'Juan Carlo',
      middle_name: null,
      last_name: 'Cruz',
      suffix: null,
      name_parts_status: 'confirmed',
    })
    expect(r.source).toBe('confirmed')
    expect(r.parts).toEqual(parts('Juan Carlo', null, 'Cruz'))
    expect(r.guess).toBeNull()
  })

  it('reports an auto split as auto', () => {
    const r = initialNameParts({ name: 'Juan Cruz', first_name: 'Juan', last_name: 'Cruz', name_parts_status: 'auto' })
    expect(r.source).toBe('auto')
  })

  it('guesses from name when pending, even with leftover parts', () => {
    const r = initialNameParts({ name: 'Juan C. Cruz', first_name: 'Old', last_name: 'Name', name_parts_status: 'pending' })
    expect(r.source).toBe('guess')
    expect(r.parts).toEqual(parts('Juan', 'C.', 'Cruz'))
    expect(r.guess?.confidence).toBe('high')
  })

  it('guesses when the status is missing', () => {
    expect(initialNameParts({ name: 'Juan Cruz' }).source).toBe('guess')
  })
})

describe('withNamePartsReview (createMember / updateMember / confirmNameParts)', () => {
  const now = new Date('2026-10-11T00:00:00.000Z')

  it('returns a save without name parts unchanged', () => {
    const fields = { phone: '0917', name: 'Juan Cruz' }
    expect(withNamePartsReview(fields, 'user-1', now)).toBe(fields)
  })

  it('stamps a save with first and last name as confirmed', () => {
    const out = withNamePartsReview(
      { name: 'Juan C. Cruz', first_name: ' Juan ', middle_name: 'C.', last_name: 'Cruz', suffix: '' },
      'user-1',
      now,
    )
    expect(out).toEqual({
      name: 'Juan C. Cruz',
      first_name: 'Juan',
      middle_name: 'C.',
      last_name: 'Cruz',
      suffix: null,
      name_parts_status: 'confirmed',
      name_parts_reviewed_at: '2026-10-11T00:00:00.000Z',
      name_parts_reviewed_by: 'user-1',
    })
  })

  it('never writes name itself', () => {
    const out = withNamePartsReview({ first_name: 'Juan', last_name: 'Cruz' }, 'user-1', now)
    expect('name' in out).toBe(false)
  })

  it.each([
    [{ first_name: 'Juan', last_name: '' }],
    [{ first_name: '  ', last_name: 'Cruz' }],
    [{ first_name: 'Juan' }],
    [{ middle_name: 'C.' }],
  ])('refuses parts without both first and last name: %o', (fields) => {
    expect(() => withNamePartsReview(fields, 'user-1', now)).toThrow('First name and last name required.')
  })

  it('does not change the input object', () => {
    const fields = { first_name: ' Juan ', last_name: 'Cruz' }
    withNamePartsReview(fields, 'user-1', now)
    expect(fields).toEqual({ first_name: ' Juan ', last_name: 'Cruz' })
  })
})

// The SQL backfill and splitTwoTokenName must block the same words. The SQL
// file is gitignored, so this runs only where the migration exists locally.
const MIGRATION = resolve(__dirname, '../../../supabase/2026-10-11_member_name_parts.sql')

describe('migration token lists', () => {
  it.skipIf(!existsSync(MIGRATION))('match AUTO_SPLIT_BLOCKED_FIRST / _LAST', () => {
    const all = readFileSync(MIGRATION, 'utf8')
    const sql = all.slice(all.indexOf('-- 4. Backfill'))
    const lists = [...sql.matchAll(/NOT IN \(([^)]*)\)/g)].map((m) =>
      [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]),
    )
    expect(lists).toHaveLength(2)
    expect(lists[0]).toEqual([...AUTO_SPLIT_BLOCKED_FIRST])
    expect(lists[1]).toEqual([...AUTO_SPLIT_BLOCKED_LAST])
  })
})
