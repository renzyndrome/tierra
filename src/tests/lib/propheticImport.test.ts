// Unit tests for importing a prophetic word list from a PDF, spreadsheet or
// paste. The fixture is the text the PDF reader rebuilt from the Young Pro
// Luke 10:38-42 PDF.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  findReference,
  normalizeReference,
  parsePropheticRows,
  parsePropheticText,
  pdfItemsToText,
} from '../../lib/propheticImport'
import { asWordList, pickFromWordList } from '../../lib/propheticWord'
import library from '../../content/propheticWords.json'

const pdfText = readFileSync(resolve(process.cwd(), 'src/tests/fixtures/prophetic-luke-10-pdf.txt'), 'utf8')
const shippedWords = library.sets[0].verses.map((v) => v.text)

describe('normalizeReference / findReference', () => {
  it('title-cases and uses a plain hyphen', () => {
    expect(normalizeReference('LUKE 10:38–42')).toBe('Luke 10:38-42')
    expect(normalizeReference('1 JOHN 4:7 - 12')).toBe('1 John 4:7-12')
    expect(normalizeReference('song of songs 2:1')).toBe('Song of Songs 2:1')
  })

  it('finds a reference alone or inside a heading', () => {
    expect(findReference('LUKE 10:38-42')).toBe('Luke 10:38-42')
    expect(findReference('Prophetic Words - Luke 10:38-42')).toBe('Luke 10:38-42')
    expect(findReference('God is calling you into a season')).toBeNull()
  })
})

describe('parsePropheticText', () => {
  it('reads the Young Pro PDF exactly: reference and all 30 words', () => {
    const parsed = parsePropheticText(pdfText)
    expect(parsed.reference).toBe('Luke 10:38-42')
    expect(parsed.words).toEqual(shippedWords)
    expect(parsed.warnings).toEqual([])
  })

  it('joins wrapped lines to their numbered word', () => {
    const parsed = parsePropheticText(
      'Psalm 23\n1. The Lord is preparing a table for you\nin the presence of every fear.\n2) He restores what was worn out by striving.',
    )
    expect(parsed.reference).toBe('Psalm 23')
    expect(parsed.words).toEqual([
      'The Lord is preparing a table for you in the presence of every fear.',
      'He restores what was worn out by striving.',
    ])
  })

  it('accepts (1) numbering and bullets', () => {
    expect(parsePropheticText('(1) First prophetic word here.\n(2) Second prophetic word here.').words).toHaveLength(2)
    expect(parsePropheticText('• First prophetic word here.\n• Second prophetic word here.').words).toHaveLength(2)
  })

  it('reads one word per line without numbers, joining sentence continuations', () => {
    const parsed = parsePropheticText(
      'JOHN 15:1-8\nGod is pruning what keeps you from\nbearing fruit.\nAbide in Him and you will flourish.',
    )
    expect(parsed.reference).toBe('John 15:1-8')
    expect(parsed.words).toEqual(['God is pruning what keeps you from bearing fruit.', 'Abide in Him and you will flourish.'])
  })

  it('drops page numbers, short lines and repeats, with warnings', () => {
    const parsed = parsePropheticText(
      '1. A word that repeats itself.\n2. A word that repeats itself.\n3. ok\nPage 2 of 3\n4. Another full prophetic word.',
    )
    expect(parsed.words).toEqual(['A word that repeats itself.', 'Another full prophetic word.'])
    expect(parsed.warnings).toContain('1 repeated word removed.')
    expect(parsed.warnings).toContain('1 short line skipped.')
    expect(parsed.warnings).toContain('No passage reference found. Type it in.')
  })

  it('says when nothing was found', () => {
    expect(parsePropheticText('   ').warnings).toContain('No words found. Check the file, or paste the text.')
  })
})

describe('parsePropheticRows (Excel / CSV)', () => {
  it('skips the header and number column, takes the reference row', () => {
    const parsed = parsePropheticRows([
      ['Luke 10:38-42'],
      ['No.', 'Prophetic Word'],
      [1, 'God is calling you into a season of obedience.'],
      [2, 'Your quiet obedience today is preparing you.'],
      [],
    ])
    expect(parsed.reference).toBe('Luke 10:38-42')
    expect(parsed.words).toEqual([
      'God is calling you into a season of obedience.',
      'Your quiet obedience today is preparing you.',
    ])
  })

  it('strips numbering typed into the same cell', () => {
    expect(parsePropheticRows([['1. A numbered word in one cell.']]).words).toEqual(['A numbered word in one cell.'])
  })
})

describe('pdfItemsToText', () => {
  it('rebuilds lines from positioned items, top to bottom', () => {
    const text = pdfItemsToText([
      { str: 'second line', x: 54, y: 900, width: 60, height: 12 },
      { str: 'LUKE 10:38-42', x: 18, y: 955, width: 107, height: 18 },
      { str: '1.', x: 36, y: 939, width: 9, height: 12 },
      { str: ' ', x: 45, y: 939, width: 9, height: 0 },
      { str: 'First word', x: 54, y: 939, width: 60, height: 12 },
      { str: 'part', x: 120, y: 939, width: 20, height: 12 },
    ])
    expect(text).toBe('LUKE 10:38-42\n1. First word part\nsecond line')
  })
})

describe('service word list (stored JSON)', () => {
  const list = { reference: 'Luke 10:38-42', words: ['First word.', 'Second word.'] }

  it('accepts a well-formed list and rejects malformed values', () => {
    expect(asWordList(list)).toEqual({ ...list, translation: null })
    expect(asWordList(null)).toBeNull()
    expect(asWordList({ reference: 'X', words: [] })).toBeNull()
    expect(asWordList({ reference: 3, words: ['a'] })).toBeNull()
    expect(asWordList('nope')).toBeNull()
  })

  it('picks one word with the list reference', () => {
    expect(pickFromWordList(list, () => 0)).toEqual({ reference: 'Luke 10:38-42', text: 'First word.', translation: null })
    expect(pickFromWordList(list, () => 0.99)?.text).toBe('Second word.')
    expect(pickFromWordList(undefined)).toBeNull()
  })
})
