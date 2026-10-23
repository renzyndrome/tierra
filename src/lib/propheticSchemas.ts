// Validation for prophetic word lists, shared by the session and set server
// functions.

import { z } from 'zod'
import { MAX_WORDS, MAX_WORD_LENGTH } from './propheticImport'

// A word list imported for one service (PDF, Word, spreadsheet or paste,
// parsed and reviewed in the browser). Stored as JSON on the session. A word
// may carry its own verse reference. The list reference is optional: a list
// without one shows "Prophetic word" in its place.
export const propheticListWordSchema = z.object({
  text: z.string().trim().min(1).max(MAX_WORD_LENGTH, `Each word: ${MAX_WORD_LENGTH} characters or fewer.`),
  reference: z.string().trim().max(80).optional().nullable(),
})
export const propheticWordListSchema = z.object({
  reference: z.string().trim().max(80),
  translation: z.string().trim().max(20).optional().nullable(),
  words: z
    .array(propheticListWordSchema)
    .min(1, 'At least one word required.')
    .max(MAX_WORDS, `${MAX_WORDS} words or fewer.`),
})
