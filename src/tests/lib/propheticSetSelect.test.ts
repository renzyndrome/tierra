// Unit tests for the create-session word set dropdown: option labels and the
// set preselected for a service and date.

import { describe, it, expect } from 'vitest'
import { formatSetOption, matchingSet } from '../../components/PropheticSetSelect'
import type { PropheticWordSetSummary } from '../../lib/types'

const set = (id: string, typeId: string | null, date: string | null, title = `Set ${id}`): PropheticWordSetSummary => ({
  id,
  title,
  service_type_id: typeId,
  service_type_name: null,
  service_date: date,
  reference: '',
  word_count: 30,
  is_archived: false,
  updated_at: '2026-10-23T00:00:00Z',
})

describe('matchingSet', () => {
  const sets = [set('a', 'yp', '2026-10-23'), set('b', 'sun', '2026-10-25'), set('c', 'yp', null)]

  it('finds the one set for this service and date', () => {
    expect(matchingSet(sets, 'yp', '2026-10-23')?.id).toBe('a')
    expect(matchingSet(sets, 'sun', '2026-10-25')?.id).toBe('b')
  })

  it('preselects nothing for no match or two matches', () => {
    expect(matchingSet(sets, 'yp', '2026-10-25')).toBeNull()
    expect(matchingSet([...sets, set('d', 'yp', '2026-10-23')], 'yp', '2026-10-23')).toBeNull()
  })
})

describe('formatSetOption', () => {
  it('shows title, word count and a short date', () => {
    expect(formatSetOption(set('a', 'yp', '2026-10-23', 'Young Pro: Nehemiah 2:17-18'))).toBe(
      'Young Pro: Nehemiah 2:17-18 · 30 words · Oct 23',
    )
    expect(formatSetOption(set('c', null, null, 'Undated'))).toBe('Undated · 30 words')
  })
})
