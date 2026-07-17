// Unit tests for the service-attendance name/phone matching engine.

import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  normalizePhone,
  findExactNameMatches,
  resolveMemberMatch,
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
