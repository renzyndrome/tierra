// Unit tests for welcome messages: one text shown in full after check-in in
// place of a random prophetic word (stored as a word list with kind 'message').

import { describe, it, expect } from 'vitest'
import { asWordList, messageParts, pickFromWordList } from '../../lib/propheticWord'
import { propheticWordListSchema } from '../../lib/propheticSchemas'
import { messageList } from '../../components/WelcomeMessageDialog'

const TEXT = 'WELCOME, GUESTS!\n\nThe weekend starts now.\nOpen hearts, open hands.\n\nHave a blessed time!'

describe('stored welcome message', () => {
  it('keeps the kind and its one text, line breaks included', () => {
    const list = asWordList(messageList(TEXT))
    expect(list?.kind).toBe('message')
    expect(list?.words).toEqual([{ text: TEXT, reference: null }])
  })

  it('a plain word list has no kind', () => {
    expect(asWordList({ reference: '', words: ['First word here.'] })?.kind).toBeUndefined()
  })

  it('every check-in gets the whole message', () => {
    const word = pickFromWordList(messageList(TEXT), () => 0.99)
    expect(word).toEqual({ reference: '', text: TEXT, translation: null, kind: 'message' })
  })

  it('reads only the first text of a stored message', () => {
    const list = asWordList({ kind: 'message', reference: '', words: [{ text: 'One.' }, { text: 'Two.' }] })
    expect(list?.words).toEqual([{ text: 'One.', reference: null }])
  })
})

describe('propheticWordListSchema', () => {
  const long = 'x'.repeat(600)

  it('allows a message up to 1000 characters', () => {
    expect(propheticWordListSchema.safeParse(messageList(long)).success).toBe(true)
    expect(propheticWordListSchema.safeParse(messageList('x'.repeat(1001))).success).toBe(false)
  })

  it('keeps prophetic words at 400 characters each', () => {
    const result = propheticWordListSchema.safeParse({ reference: '', words: [{ text: long }] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Each word: 400 characters or fewer.')
  })

  it('takes one message only', () => {
    const result = propheticWordListSchema.safeParse({ kind: 'message', reference: '', words: [{ text: 'A.' }, { text: 'B.' }] })
    expect(result.error?.issues[0].message).toBe('One message only.')
  })

  it('keeps the line breaks inside a message', () => {
    expect(propheticWordListSchema.parse(messageList(`  ${TEXT}  `)).words[0].text).toBe(TEXT)
  })
})

describe('messageParts', () => {
  it('reads a short first paragraph as the heading', () => {
    expect(messageParts(TEXT)).toEqual({
      heading: 'WELCOME, GUESTS!',
      paragraphs: ['The weekend starts now.\nOpen hearts, open hands.', 'Have a blessed time!'],
    })
  })

  it('has no heading for one paragraph or a long first one', () => {
    expect(messageParts('Just one paragraph.').heading).toBeNull()
    expect(messageParts(`${'y'.repeat(70)}\n\nSecond.`).heading).toBeNull()
  })
})
