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
  splitVerse,
  unquote,
  type ParsedWordList,
} from '../../lib/propheticImport'
import { asWordList, pickFromWordList } from '../../lib/propheticWord'
import library from '../../content/propheticWords.json'

const pdfText = readFileSync(resolve(process.cwd(), 'src/tests/fixtures/prophetic-luke-10-pdf.txt'), 'utf8')
const shippedWords = library.sets[0].verses.map((v) => v.text)
const texts = (parsed: ParsedWordList) => parsed.words.map((w) => w.text)

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
    expect(texts(parsed)).toEqual(shippedWords)
    expect(parsed.warnings).toEqual([])
  })

  it('joins wrapped lines to their numbered word', () => {
    const parsed = parsePropheticText(
      'Psalm 23\n1. The Lord is preparing a table for you\nin the presence of every fear.\n2) He restores what was worn out by striving.',
    )
    expect(parsed.reference).toBe('Psalm 23')
    expect(texts(parsed)).toEqual([
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
    expect(texts(parsed)).toEqual(['God is pruning what keeps you from bearing fruit.', 'Abide in Him and you will flourish.'])
  })

  it('drops page numbers, short lines and repeats, with warnings', () => {
    const parsed = parsePropheticText(
      '1. A word that repeats itself.\n2. A word that repeats itself.\n3. ok\nPage 2 of 3\n4. Another full prophetic word.',
    )
    expect(texts(parsed)).toEqual(['A word that repeats itself.', 'Another full prophetic word.'])
    expect(parsed.warnings).toContain('1 repeated word removed.')
    expect(parsed.warnings).toContain('1 short line skipped.')
    expect(parsed.warnings).toContain('No passage reference found. Type it in.')
  })

  it('says when nothing was found', () => {
    expect(parsePropheticText('   ').warnings).toContain('No words found. Check the file, or paste the text.')
  })
})

describe('verse lists: one verse per line, each with its own reference', () => {
  // The layout of a typed verse list exported to PDF: reference, a dash, the
  // verse; long verses wrap onto the next line, sometimes with a capital.
  const verses = [
    'Psalm 46:1-3 – God is our refuge and strength, an ever-present help in trouble. Therefore we',
    'will not fear, though the earth give way.',
    'Exodus 15:2 – “The Lord is my strength and my defence; he has become my salvation.',
    'Deuteronomy 31:6 - Be strong and courageous. Do not fear, for it is the',
    'Lord your God who goes with you.',
    '2 Corinthians 12:9 - “My grace is all you need, for my power is the greatest when you are weak.”',
    'Philippians 4:13 – I can do all things through Him who strengthens me.',
    'Philippians 4:13 - I can do all things through him who strengthens me.',
    'Psalm 112:1–3 — “Blessed is the man that feareth the LORD.”',
    '2',
  ].join('\n')

  it('gives every verse its own reference, joins wrapped lines, drops repeats', () => {
    const parsed = parsePropheticText(verses)
    expect(parsed.reference).toBe('')
    expect(parsed.words).toEqual([
      {
        reference: 'Psalm 46:1-3',
        text: 'God is our refuge and strength, an ever-present help in trouble. Therefore we will not fear, though the earth give way.',
      },
      { reference: 'Exodus 15:2', text: 'The Lord is my strength and my defence; he has become my salvation.' },
      {
        reference: 'Deuteronomy 31:6',
        text: 'Be strong and courageous. Do not fear, for it is the Lord your God who goes with you.',
      },
      { reference: '2 Corinthians 12:9', text: 'My grace is all you need, for my power is the greatest when you are weak.' },
      { reference: 'Philippians 4:13', text: 'I can do all things through Him who strengthens me.' },
      { reference: 'Psalm 112:1-3', text: 'Blessed is the man that feareth the LORD.' },
    ])
    // Every word has a reference, so no list reference is asked for.
    expect(parsed.warnings).toEqual(['1 repeated word removed.'])
  })

  it('keeps a heading above the verses as the list reference', () => {
    const parsed = parsePropheticText(`Strength verses - Isaiah 40:31\n${verses}`)
    expect(parsed.reference).toBe('Isaiah 40:31')
    expect(parsed.words[0].reference).toBe('Psalm 46:1-3')
  })

  it('splits a numbered verse and a spreadsheet reference column', () => {
    expect(texts(parsePropheticText('1. John 3:16 - For God so loved the world.\n2. Romans 8:28 - All things work together for good.'))).toEqual([
      'For God so loved the world.',
      'All things work together for good.',
    ])
    expect(parsePropheticRows([['Reference', 'Verse'], ['Joshua 24:15', 'As for me and my house, we will serve the LORD.']]).words).toEqual([
      { reference: 'Joshua 24:15', text: 'As for me and my house, we will serve the LORD.' },
    ])
  })

  it('splitVerse / unquote', () => {
    expect(splitVerse('3 John 1:2 — “Beloved, I wish above all things that thou mayest prosper.”')).toEqual({
      reference: '3 John 1:2',
      text: 'Beloved, I wish above all things that thou mayest prosper.',
    })
    expect(splitVerse('A prophetic word without a reference.')).toEqual({ reference: null, text: 'A prophetic word without a reference.' })
    // No colon in the reference: not a verse line ("Week 2 - ...").
    expect(splitVerse('Week 2 - Rest in Him this week.').reference).toBeNull()
    expect(unquote('“Do not grieve,” he said, “for the joy.”')).toBe('Do not grieve,” he said, “for the joy.”')
    expect(unquote('He said, “Come.”')).toBe('He said, “Come.”')
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
    expect(texts(parsed)).toEqual([
      'God is calling you into a season of obedience.',
      'Your quiet obedience today is preparing you.',
    ])
  })

  it('strips numbering typed into the same cell', () => {
    expect(texts(parsePropheticRows([['1. A numbered word in one cell.']]))).toEqual(['A numbered word in one cell.'])
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
  const list = {
    reference: 'Luke 10:38-42',
    words: [
      { text: 'First word.', reference: null },
      { text: 'Second word.', reference: null },
    ],
  }

  it('accepts a well-formed list and rejects malformed values', () => {
    expect(asWordList(list)).toEqual({ ...list, translation: null })
    // The first stored format: plain strings.
    expect(asWordList({ reference: 'Luke 10:38-42', words: ['First word.', 'Second word.'] })).toEqual({
      ...list,
      translation: null,
    })
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

  it("uses a word's own reference first", () => {
    const verses = {
      reference: '',
      words: [
        { text: 'The joy of the Lord is your strength.', reference: 'Nehemiah 8:10' },
        { text: 'Be strong in the Lord.', reference: 'Ephesians 6:10' },
      ],
    }
    expect(pickFromWordList(verses, () => 0.99)).toEqual({
      reference: 'Ephesians 6:10',
      text: 'Be strong in the Lord.',
      translation: null,
    })
    expect(pickFromWordList({ ...list, words: [{ text: 'Own word.', reference: 'Luke 10:41' }] }, () => 0)?.reference).toBe(
      'Luke 10:41',
    )
  })
})
