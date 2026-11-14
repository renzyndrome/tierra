// Validation for prophetic word lists, shared by the session and set server
// functions.

import { z } from 'zod'
import { MAX_WORDS, MAX_WORD_LENGTH } from './propheticImport'

// Longest welcome message (one text, line breaks kept).
export const MAX_MESSAGE_LENGTH = 1000

// A word list imported for one service (PDF, Word, spreadsheet or paste,
// parsed and reviewed in the browser). Stored as JSON on the session. A word
// may carry its own verse reference. The list reference is optional: a list
// without one shows "Prophetic word" in its place.
export const propheticListWordSchema = z.object({
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH, `Text: ${MAX_MESSAGE_LENGTH} characters or fewer.`),
  reference: z.string().trim().max(80).optional().nullable(),
})
// A welcome message (kind 'message') is one text of up to MAX_MESSAGE_LENGTH;
// prophetic words stay at MAX_WORD_LENGTH each.
export const propheticWordListSchema = z
  .object({
    reference: z.string().trim().max(80),
    translation: z.string().trim().max(20).optional().nullable(),
    words: z
      .array(propheticListWordSchema)
      .min(1, 'At least one word required.')
      .max(MAX_WORDS, `${MAX_WORDS} words or fewer.`),
    kind: z.literal('message').optional(),
  })
  .superRefine((list, ctx) => {
    if (list.kind === 'message') {
      if (list.words.length !== 1) ctx.addIssue({ code: 'custom', path: ['words'], message: 'One message only.' })
      return
    }
    if (list.words.some((w) => w.text.length > MAX_WORD_LENGTH)) {
      ctx.addIssue({ code: 'custom', path: ['words'], message: `Each word: ${MAX_WORD_LENGTH} characters or fewer.` })
    }
  })
