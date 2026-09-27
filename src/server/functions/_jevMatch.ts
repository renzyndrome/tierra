// Jev (TypeSafe System One) suggestions for the attendance review queue.
// Suggest-only: the probabilities re-rank and tag candidates for staff; nothing
// is linked or written from them. Off when TYPESAFE_API_KEY is unset, and any
// failure (timeout, HTTP error, bad body) returns no probabilities so the queue
// behaves exactly as without Jev. Server-only: the key never reaches a browser.

import { buildJevMatchRequest, parseJevMatchResponse, type JevMatchItem } from '../../lib/jevMatch'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const TIMEOUT_MS = 5000
const MAX_QUESTIONS_PER_REQUEST = 20
const MAX_CACHE_ENTRIES = 500

// Answers per (record, candidate set): the queue reloads after every staff
// action, and unchanged questions need not be asked again.
const cache = new Map<string, Map<string, number>>()

function cacheKey(item: JevMatchItem): string {
  return `${item.recordId}|${item.typedName}|${item.candidates.map((c) => c.id).join(',')}`
}

function remember(key: string, value: Map<string, number>) {
  cache.set(key, value)
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

async function ask(items: readonly JevMatchItem[], apiKey: string): Promise<Map<string, Map<string, number>>> {
  const { body, keys } = buildJevMatchRequest(items)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Jev request failed with HTTP ${res.status}`)
  return parseJevMatchResponse(await res.json(), keys)
}

/**
 * Record id -> (member id -> probability that this member typed the name).
 * Items without candidates are skipped. Never throws.
 */
export async function jevMatchProbabilities(
  items: readonly JevMatchItem[],
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>()
  const apiKey = process.env.TYPESAFE_API_KEY
  if (!apiKey) return out

  const todo: JevMatchItem[] = []
  for (const item of items) {
    if (item.candidates.length === 0 || !item.typedName.trim()) continue
    const hit = cache.get(cacheKey(item))
    if (hit) out.set(item.recordId, hit)
    else todo.push(item)
  }

  for (let i = 0; i < todo.length; i += MAX_QUESTIONS_PER_REQUEST) {
    const chunk = todo.slice(i, i + MAX_QUESTIONS_PER_REQUEST)
    try {
      const answers = await ask(chunk, apiKey)
      for (const item of chunk) {
        const probs = answers.get(item.recordId)
        if (!probs) continue
        remember(cacheKey(item), probs)
        out.set(item.recordId, probs)
      }
    } catch (err) {
      console.error('Jev match suggestions unavailable:', err instanceof Error ? err.message : err)
      break
    }
  }
  return out
}
