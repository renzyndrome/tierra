// Server-only helpers for prophetic word sets, shared by the set and session
// server functions. No server functions here (the leading "_" keeps this file
// out of the auth-guard scan).

import type { z } from 'zod'
import type { createServerAdminClient } from '../../lib/supabase'
import type { propheticWordListSchema } from '../../lib/propheticSchemas'
import { asWordList, type PropheticWordList } from '../../lib/propheticWord'

/** The stored form of a list: trimmed, empty per-word references as null. */
export function storedWordList(list: z.infer<typeof propheticWordListSchema>): PropheticWordList {
  return {
    reference: list.reference,
    translation: list.translation || null,
    words: list.words.map((w) => ({ text: w.text, reference: w.reference || null })),
  }
}

/** A set's words for copying onto a session; throws when the set is missing. */
export async function loadSetWords(
  admin: ReturnType<typeof createServerAdminClient>,
  setId: string,
): Promise<PropheticWordList> {
  const { data, error } = await admin.from('prophetic_word_sets').select('words').eq('id', setId).maybeSingle()
  if (error) {
    console.error('Error loading prophetic word set:', error)
    throw new Error('Word set not loaded. Retry.')
  }
  const list = asWordList((data as { words?: unknown } | null)?.words)
  if (!list) throw new Error('Word set not found.')
  return list
}
