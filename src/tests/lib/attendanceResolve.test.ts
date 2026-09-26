// Unit tests for check-in resolution rules: suggestion ranking and the
// duplicate-visitor archive fence.

import { describe, it, expect } from 'vitest'
import {
  mergeMatchCandidates,
  applyJevProbabilities,
  canArchiveDuplicateVisitor,
  createdByCheckin,
  type DuplicateVisitorFacts,
} from '../../lib/attendanceResolve'
import type { MatchCandidate } from '../../lib/types'

const person = (id: string, name: string) => ({ id, name, phone: null, satellite_id: null })
const fuzzy = (id: string, name: string, sim: number): MatchCandidate => ({ ...person(id, name), sim })

describe('mergeMatchCandidates', () => {
  it('merges sources without duplicates and keeps the best score', () => {
    const out = mergeMatchCandidates(
      'JC Eugenio',
      {
        fuzzy: [fuzzy('a', 'Justin Eugenio', 0.45)],
        surname: [person('a', 'Justin Eugenio'), person('b', 'Maria Eugenio')],
        email: [],
      },
      8,
    )
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
    expect(out[0].sim).toBeCloseTo(0.5)
  })

  it('ranks the email owner first even with a weaker name score', () => {
    const out = mergeMatchCandidates(
      'JC Eugenio',
      {
        fuzzy: [fuzzy('b', 'Maria Eugenio', 0.6)],
        surname: [],
        email: [person('a', 'Justin Eugenio')],
      },
      8,
    )
    expect(out[0]).toMatchObject({ id: 'a', email_match: true })
    expect(out[1]).toMatchObject({ id: 'b', email_match: false })
  })

  it('breaks score ties by the typed first initial', () => {
    const out = mergeMatchCandidates(
      'JC Eugenio',
      { fuzzy: [], surname: [person('m', 'Aaron Eugenio'), person('j', 'Justin Eugenio')], email: [] },
      8,
    )
    expect(out.map((c) => c.id)).toEqual(['j', 'm'])
  })

  it('caps the list at the limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => fuzzy(`m${i}`, `Member ${i} Eugenio`, 0.4))
    expect(mergeMatchCandidates('JC Eugenio', { fuzzy: many, surname: [], email: [] }, 8)).toHaveLength(8)
  })
})

describe('applyJevProbabilities', () => {
  const base = [
    { ...fuzzy('b', 'Maria Eugenio', 0.5), email_match: false },
    { ...fuzzy('a', 'Justin Eugenio', 0.5), email_match: false },
  ]

  it('returns the list unchanged without probabilities (Jev off or failed)', () => {
    expect(applyJevProbabilities(base, undefined)).toEqual(base)
    expect(applyJevProbabilities(base, new Map())).toEqual(base)
  })

  it('re-ranks by Jev probability and attaches it', () => {
    const out = applyJevProbabilities(base, new Map([['a', 0.71], ['b', 0.01]]))
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
    expect(out[0].jev_probability).toBe(0.71)
  })

  it('keeps an email owner above a higher Jev pick', () => {
    const withEmail = [{ ...base[0], email_match: true }, base[1]]
    const out = applyJevProbabilities(withEmail, new Map([['a', 0.9], ['b', 0.05]]))
    expect(out[0].id).toBe('b')
  })
})

describe('canArchiveDuplicateVisitor', () => {
  const clean: DuplicateVisitorFacts = {
    membershipStatus: 'visitor',
    isArchived: false,
    createdByCheckin: true,
    referenceCounts: {
      'public.attendance_records.member_id': 0,
      'public.user_profiles.member_id': 0,
      'public.member_cell_groups.member_id': 0,
    },
  }

  it('allows a plain visitor with no other footprint', () => {
    expect(canArchiveDuplicateVisitor(clean)).toBe(true)
  })

  it('keeps a record that is not a visitor', () => {
    expect(canArchiveDuplicateVisitor({ ...clean, membershipStatus: 'regular' })).toBe(false)
    expect(canArchiveDuplicateVisitor({ ...clean, membershipStatus: null })).toBe(false)
  })

  it('keeps an older directory record not created by this check-in', () => {
    expect(canArchiveDuplicateVisitor({ ...clean, createdByCheckin: false })).toBe(false)
  })

  it('keeps a record that is already archived', () => {
    expect(canArchiveDuplicateVisitor({ ...clean, isArchived: true })).toBe(false)
  })

  it('keeps a record referenced anywhere else', () => {
    for (const key of Object.keys(clean.referenceCounts)) {
      const facts = { ...clean, referenceCounts: { ...clean.referenceCounts, [key]: 1 } }
      expect(canArchiveDuplicateVisitor(facts)).toBe(false)
    }
  })

  it('keeps a record when any count could not be read', () => {
    const facts = { ...clean, referenceCounts: { ...clean.referenceCounts, 'public.user_profiles.member_id': null } }
    expect(canArchiveDuplicateVisitor(facts)).toBe(false)
  })

  it('keeps a record when no reference was checked at all', () => {
    expect(canArchiveDuplicateVisitor({ ...clean, referenceCounts: {} })).toBe(false)
  })
})

describe('createdByCheckin', () => {
  const checkedIn = '2026-09-25T11:18:00.000Z'

  it('accepts a member created just before the check-in (walk-in) or after it (queue)', () => {
    expect(createdByCheckin('2026-09-25T11:17:59.950Z', checkedIn)).toBe(true)
    expect(createdByCheckin('2026-09-27T02:00:00.000Z', checkedIn)).toBe(true)
  })

  it('rejects a member created well before the check-in', () => {
    expect(createdByCheckin('2026-09-25T11:10:00.000Z', checkedIn)).toBe(false)
    expect(createdByCheckin('2026-02-18T10:45:29.410Z', checkedIn)).toBe(false)
  })

  it('rejects missing or unparseable timestamps', () => {
    expect(createdByCheckin(null, checkedIn)).toBe(false)
    expect(createdByCheckin('2026-09-25T11:18:00Z', null)).toBe(false)
    expect(createdByCheckin('not a date', checkedIn)).toBe(false)
  })
})
