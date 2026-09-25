// Unit tests for toSafeSearchTerm: search text must not alter PostgREST filters.

import { describe, it, expect } from 'vitest'
import { toSafeSearchTerm } from '../../lib/searchTerm'

describe('toSafeSearchTerm', () => {
  it('keeps ordinary names, accents and dots', () => {
    expect(toSafeSearchTerm('  Maria Peña Jr. ')).toBe('Maria Peña Jr.')
  })

  it('removes filter separators so no extra or() clause can be added', () => {
    expect(toSafeSearchTerm('a%,is_archived.eq.true')).toBe('a is_archived.eq.true')
    expect(toSafeSearchTerm('x),and(id.eq.1')).toBe('x and id.eq.1')
  })

  it('removes ilike wildcards, quotes and backslashes', () => {
    expect(toSafeSearchTerm('50%*"\\')).toBe('50')
  })

  it('returns an empty string when nothing searchable remains', () => {
    expect(toSafeSearchTerm(',,()%')).toBe('')
  })
})
