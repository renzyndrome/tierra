// Unit tests for the service-attendance name/phone matching engine.

import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  normalizePhone,
  findExactNameMatches,
  resolveMemberMatch,
  nameMatchConfidence,
  searchDirectoryByName,
  findSimilarMembers,
  AUTO_MATCH_CONFIDENCE,
  type DirectoryMember,
} from '../../lib/nameMatch'

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  John Cruz  ')).toBe('john cruz')
  })

  it('collapses internal whitespace', () => {
    expect(normalizeName('John   Cruz')).toBe('john cruz')
  })

  it('strips diacritics', () => {
    expect(normalizeName('José Peña')).toBe('jose pena')
  })

  it('replaces punctuation with spaces', () => {
    expect(normalizeName('Cruz-Reyes, Jr.')).toBe('cruz reyes jr')
  })

  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
    expect(normalizeName('   ')).toBe('')
  })
})

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('0917 123 4567')).toBe('639171234567')
  })

  it('maps leading 0 to country code 63', () => {
    expect(normalizePhone('09171234567')).toBe('639171234567')
  })

  it('keeps an already country-coded number', () => {
    expect(normalizePhone('+63 917 123 4567')).toBe('639171234567')
  })

  it('returns null when there are no digits', () => {
    expect(normalizePhone('n/a')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('findExactNameMatches', () => {
  const dir = [
    { id: '1', name: 'John Cruz' },
    { id: '2', name: 'john  cruz' },
    { id: '3', name: 'Jane Cruz' },
  ]

  it('matches case- and whitespace-insensitively', () => {
    const matches = findExactNameMatches('JOHN CRUZ', dir)
    expect(matches.map((m) => m.id).sort()).toEqual(['1', '2'])
  })

  it('returns empty for blank query', () => {
    expect(findExactNameMatches('', dir)).toEqual([])
  })

  it('returns empty when nothing matches', () => {
    expect(findExactNameMatches('Nobody Here', dir)).toEqual([])
  })
})

describe('resolveMemberMatch', () => {
  const directory: DirectoryMember[] = [
    { id: 'a', name: 'John Cruz', phone: '09171234567' },
    { id: 'b', name: 'Jane Dela Cruz', phone: '09990001111' },
    { id: 'c', name: 'John Cruz', phone: '09225556666' }, // duplicate name
  ]

  it('auto-links on a unique exact name match', () => {
    const only = [{ id: 'a', name: 'John Cruz', phone: null }]
    expect(resolveMemberMatch('john cruz', null, only)?.id).toBe('a')
  })

  it('does NOT auto-link an ambiguous name (falls through to null)', () => {
    // Two "John Cruz" entries with different phones and no phone provided.
    expect(resolveMemberMatch('John Cruz', null, directory)).toBeNull()
  })

  it('disambiguates an ambiguous name via a unique phone match', () => {
    const match = resolveMemberMatch('John Cruz', '0922 555 6666', directory)
    expect(match?.id).toBe('c')
  })

  it('matches on phone even when the name is unknown', () => {
    const match = resolveMemberMatch('Totally Different', '0999 000 1111', directory)
    expect(match?.id).toBe('b')
  })

  it('returns null when neither name nor phone resolve', () => {
    expect(resolveMemberMatch('Ghost Person', '0000', directory)).toBeNull()
  })

  it('strips diacritics/punctuation before matching', () => {
    const only = [{ id: 'x', name: 'José Peña', phone: null }]
    expect(resolveMemberMatch('Jose Pena', null, only)?.id).toBe('x')
  })
})

describe('nameMatchConfidence', () => {
  it('scores identical normalized names 1.0', () => {
    expect(nameMatchConfidence('John Cruz', 'john  cruz')).toBe(1)
  })

  it('scores same token set (different order) high', () => {
    expect(nameMatchConfidence('Cruz John', 'John Cruz')).toBeGreaterThanOrEqual(0.9)
  })

  it('scores a middle-name subset (>=2 shared tokens) at the auto-match bar', () => {
    // Typed dropped the first name; both typed tokens appear in the member name.
    expect(nameMatchConfidence('Laurence Rebadulla', 'Gabriel Laurence Rebadulla')).toBeGreaterThanOrEqual(
      AUTO_MATCH_CONFIDENCE,
    )
  })

  it('does NOT reach the auto-match bar on a single shared token', () => {
    expect(nameMatchConfidence('Laurence', 'Gabriel Laurence Rebadulla')).toBeLessThan(AUTO_MATCH_CONFIDENCE)
  })

  it('scores unrelated names low', () => {
    expect(nameMatchConfidence('Juan Cruz', 'Pedro Santos')).toBeLessThan(0.3)
  })
})

describe('resolveMemberMatch — confident subset (middle-name) auto-match', () => {
  it('auto-links a confident subset when exactly one member matches', () => {
    const dir: DirectoryMember[] = [
      { id: 'g', name: 'Gabriel Laurence Rebadulla', phone: '+639171477836' },
      { id: 'e', name: 'Laurence Eusebio', phone: null },
    ]
    // "Laurence Rebadulla" is a confident subset of only "Gabriel Laurence Rebadulla".
    expect(resolveMemberMatch('Laurence Rebadulla', null, dir)?.id).toBe('g')
  })

  it('does NOT auto-link when two members (e.g. family) both match — goes to review', () => {
    const dir: DirectoryMember[] = [
      { id: 'g', name: 'Gabriel Laurence Rebadulla', phone: null },
      { id: 'm', name: 'Maria Laurence Rebadulla', phone: null },
    ]
    expect(resolveMemberMatch('Laurence Rebadulla', null, dir)).toBeNull()
  })

  it('does NOT auto-link on just a first name', () => {
    const dir: DirectoryMember[] = [
      { id: 'g', name: 'Gabriel Laurence Rebadulla', phone: null },
      { id: 'e', name: 'Laurence Eusebio', phone: null },
    ]
    expect(resolveMemberMatch('Laurence', null, dir)).toBeNull()
  })

  it('breaks an ambiguous subset tie with a unique phone', () => {
    const dir: DirectoryMember[] = [
      { id: 'g', name: 'Gabriel Laurence Rebadulla', phone: '09171477836' },
      { id: 'm', name: 'Maria Laurence Rebadulla', phone: '09990001111' },
    ]
    expect(resolveMemberMatch('Laurence Rebadulla', '0917 147 7836', dir)?.id).toBe('g')
  })
})

describe('searchDirectoryByName (staff manual check-in search)', () => {
  const dir = [
    { id: '1', name: 'Juan Dela Cruz' },
    { id: '2', name: 'Maria Peña' },
    { id: '3', name: 'Juan' },
    { id: '4', name: 'Anna Juanico' },
    { id: '5', name: 'Pedro Santos' },
  ]

  it('returns nothing for a blank query', () => {
    expect(searchDirectoryByName('   ', dir)).toEqual([])
  })

  it('matches every typed token in any order', () => {
    expect(searchDirectoryByName('cruz juan', dir).map((m) => m.id)).toEqual(['1'])
  })

  it('ignores accents and case', () => {
    expect(searchDirectoryByName('PENA', dir).map((m) => m.id)).toEqual(['2'])
  })

  it('ranks exact, then prefix, then substring matches', () => {
    expect(searchDirectoryByName('juan', dir).map((m) => m.id)).toEqual(['3', '1', '4'])
  })

  it('respects the limit', () => {
    expect(searchDirectoryByName('a', dir, 2)).toHaveLength(2)
  })

  it('returns no match when a token is missing', () => {
    expect(searchDirectoryByName('juan santos', dir)).toEqual([])
  })
})

describe('findSimilarMembers (walk-in duplicate check)', () => {
  const dir = [
    { id: 'g', name: 'Gabriel Laurence Rebadulla' },
    { id: 'm', name: 'Maria Laurence Rebadulla' },
    { id: 'e', name: 'Laurence Eusebio' },
    { id: 'p', name: 'Pedro Santos' },
  ]

  it('finds an exact name, ignoring case and accents', () => {
    expect(findSimilarMembers('pedro SANTOS', dir).map((m) => m.id)).toEqual(['p'])
  })

  it('finds middle-name variants (confident subset matches)', () => {
    expect(findSimilarMembers('Laurence Rebadulla', dir).map((m) => m.id)).toEqual(['g', 'm'])
  })

  it('ignores a single shared first name', () => {
    expect(findSimilarMembers('Laurence', dir)).toEqual([])
  })

  it('returns nothing for a new name', () => {
    expect(findSimilarMembers('Lola Remedios Cruz', dir)).toEqual([])
  })

  it('respects the limit', () => {
    expect(findSimilarMembers('Laurence Rebadulla', dir, 1)).toHaveLength(1)
  })
})
