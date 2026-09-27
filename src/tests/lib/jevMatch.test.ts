// Unit tests for the Jev member-match request: only names leave the server,
// and answers map back to member ids safely.

import { describe, it, expect } from 'vitest'
import { buildJevMatchRequest, parseJevMatchResponse, JEV_MODEL } from '../../lib/jevMatch'

const items = [
  {
    recordId: 'rec-1',
    typedName: 'JC Eugenio',
    candidates: [
      { id: 'mem-a', name: 'Justin Eugenio' },
      { id: 'mem-b', name: 'Maria Eugenio' },
    ],
  },
  { recordId: 'rec-2', typedName: 'Kat Reyes', candidates: [{ id: 'mem-c', name: 'Katherine Reyes' }] },
]

describe('buildJevMatchRequest', () => {
  it('asks one choice question per check-in with a none option', () => {
    const { body } = buildJevMatchRequest(items)
    expect(body.model).toBe(JEV_MODEL)
    expect(Object.keys(body.questions)).toEqual(['q0', 'q1'])
    expect(body.questions.q0.type).toBe('choice')
    expect(Object.keys(body.questions.q0.criteria)).toEqual(['c1', 'c2', 'none'])
    expect(body.questions.q0.instructions).toContain('`checkins[0].typed_name`')
    expect(body.state.checkins).toEqual([{ typed_name: 'JC Eugenio' }, { typed_name: 'Kat Reyes' }])
  })

  it('sends names only: no record or member ids', () => {
    const json = JSON.stringify(buildJevMatchRequest(items).body)
    for (const id of ['rec-1', 'rec-2', 'mem-a', 'mem-b', 'mem-c']) expect(json).not.toContain(id)
    expect(json).toContain('Justin Eugenio')
  })
})

describe('parseJevMatchResponse', () => {
  const { keys } = buildJevMatchRequest(items)

  it('maps option probabilities back to member ids per record', () => {
    const out = parseJevMatchResponse(
      {
        answers: {
          q0: { type: 'choice', choice: 'c1', probabilities: { c1: 0.71, c2: 0.01, none: 0.28 }, confidence: 0.61 },
          q1: { type: 'choice', choice: 'c1', probabilities: { c1: 0.99, none: 0.01 }, confidence: 0.98 },
        },
      },
      keys,
    )
    expect(out.get('rec-1')).toEqual(new Map([['mem-a', 0.71], ['mem-b', 0.01]]))
    expect(out.get('rec-2')).toEqual(new Map([['mem-c', 0.99]]))
  })

  it('skips malformed or missing answers instead of throwing', () => {
    expect(parseJevMatchResponse(null, keys).size).toBe(0)
    expect(parseJevMatchResponse({ answers: 'x' }, keys).size).toBe(0)
    const partial = parseJevMatchResponse(
      { answers: { q0: { probabilities: { c1: 'high' } }, q1: { probabilities: { c1: 0.5 } } } },
      keys,
    )
    expect(partial.has('rec-1')).toBe(false)
    expect(partial.get('rec-2')).toEqual(new Map([['mem-c', 0.5]]))
  })
})
