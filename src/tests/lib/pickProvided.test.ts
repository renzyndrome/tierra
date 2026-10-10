// Unit tests for pickProvided: partial updates must not write schema defaults.

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { pickProvided } from '../../lib/pickProvided'

const insertSchema = z.object({
  name: z.string(),
  stage: z.enum(['Newbie', 'Growing', 'Leader']).default('Newbie'),
  photo_url: z.string().optional().nullable(),
})
const updateSchema = insertSchema.partial()

describe('pickProvided', () => {
  it('zod partial() fills defaults (the problem this guards against)', () => {
    expect(updateSchema.parse({ photo_url: 'x' })).toEqual({ stage: 'Newbie', photo_url: 'x' })
  })

  it('keeps only the keys the caller sent', () => {
    const input = { photo_url: 'x' }
    expect(pickProvided(updateSchema.parse(input), input)).toEqual({ photo_url: 'x' })
  })

  it('keeps an explicitly sent value, including null', () => {
    const input = { stage: 'Leader' as const, photo_url: null }
    expect(pickProvided(updateSchema.parse(input), input)).toEqual({ stage: 'Leader', photo_url: null })
  })

  it('returns an empty object for an empty update', () => {
    expect(pickProvided(updateSchema.parse({}), {})).toEqual({})
  })
})
