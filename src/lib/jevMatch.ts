// Request/response shaping for Jev (TypeSafe System One) member-match
// suggestions. One Choice question per pending check-in: which listed member
// typed this name, or none. Only names are sent: no phone, email or ids.
// Pure so the question wording and parsing are unit-testable.

export interface JevMatchItem {
  recordId: string
  typedName: string
  candidates: readonly { id: string; name: string }[]
}

export const JEV_MODEL = 'jev-latest'

const NONE = 'none'

function instructions(index: number): string {
  return (
    `A person gave the name \`checkins[${index}].typed_name\` at a church service check-in. ` +
    'Which listed church member is that same person? Filipino guests often type nicknames, ' +
    'initials or a shortened first name (e.g. "JC" for "Juan Carlos", "Bong" for "Ramon", ' +
    '"Kat" for "Katherine"). A shared surname alone is not enough: relatives share surnames. ' +
    'Pick "none" when no listed member is plausibly this person.'
  )
}

export interface JevMatchRequest {
  body: {
    model: string
    state: { checkins: { typed_name: string }[] }
    questions: Record<string, { type: 'choice'; instructions: string; criteria: Record<string, string> }>
  }
  // Question id -> the record it asks about and option key -> member id.
  keys: Map<string, { recordId: string; options: Map<string, string> }>
}

export function buildJevMatchRequest(items: readonly JevMatchItem[]): JevMatchRequest {
  const questions: JevMatchRequest['body']['questions'] = {}
  const keys: JevMatchRequest['keys'] = new Map()
  items.forEach((item, i) => {
    const criteria: Record<string, string> = {}
    const options = new Map<string, string>()
    item.candidates.forEach((c, j) => {
      const key = `c${j + 1}`
      criteria[key] = `Church member "${c.name}"`
      options.set(key, c.id)
    })
    criteria[NONE] = 'None of the listed members'
    questions[`q${i}`] = { type: 'choice', instructions: instructions(i), criteria }
    keys.set(`q${i}`, { recordId: item.recordId, options })
  })
  return {
    body: {
      model: JEV_MODEL,
      state: { checkins: items.map((item) => ({ typed_name: item.typedName })) },
      questions,
    },
    keys,
  }
}

/**
 * Read Choice answers back into record id -> (member id -> probability).
 * Malformed or missing answers are skipped, never thrown.
 */
export function parseJevMatchResponse(
  json: unknown,
  keys: JevMatchRequest['keys'],
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  const answers = (json as { answers?: Record<string, unknown> } | null)?.answers
  if (!answers || typeof answers !== 'object') return out
  for (const [qid, key] of keys) {
    const probs = (answers[qid] as { probabilities?: Record<string, unknown> } | undefined)?.probabilities
    if (!probs || typeof probs !== 'object') continue
    const byMember = new Map<string, number>()
    for (const [option, memberId] of key.options) {
      const p = probs[option]
      if (typeof p === 'number' && Number.isFinite(p)) byMember.set(memberId, p)
    }
    if (byMember.size > 0) out.set(key.recordId, byMember)
  }
  return out
}
