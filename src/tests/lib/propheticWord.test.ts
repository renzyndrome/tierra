// Unit tests for the prophetic word shown after a QR check-in: matching a
// session's prompt to a verse list, picking a verse, and the shipped JSON.

import { describe, it, expect } from 'vitest'
import {
  findPropheticSet,
  pickPropheticWord,
  type PropheticLibrary,
} from '../../lib/propheticWord'
import library from '../../content/propheticWords.json'

const sample: PropheticLibrary = {
  translation: 'BSB',
  sets: [
    {
      topic: 'The Love of an Extravagant Father',
      keywords: ['father', 'love', 'prodigal'],
      verses: [
        { reference: 'Luke 15:20', text: 'He ran to his son.' },
        { reference: '1 John 4:19', text: 'We love because He first loved us.' },
      ],
    },
    {
      topic: 'Faith Over Fear',
      keywords: ['faith', 'fear'],
      verses: [{ reference: 'Isaiah 41:10', text: 'Do not fear.' }],
    },
  ],
}

describe('findPropheticSet', () => {
  it('returns null for an empty or missing prompt', () => {
    expect(findPropheticSet(null, sample)).toBeNull()
    expect(findPropheticSet('   ', sample)).toBeNull()
  })

  it('matches the topic ignoring case and punctuation', () => {
    expect(findPropheticSet('the love of an EXTRAVAGANT father!', sample)?.topic).toBe(
      'The Love of an Extravagant Father',
    )
  })

  it('matches by keyword when the prompt differs from the topic', () => {
    expect(findPropheticSet('Our Father who runs to us', sample)?.topic).toBe('The Love of an Extravagant Father')
    expect(findPropheticSet('Choosing faith', sample)?.topic).toBe('Faith Over Fear')
  })

  it('picks the set with the most keyword hits', () => {
    expect(findPropheticSet('Faith and fear and a father', sample)?.topic).toBe('Faith Over Fear')
  })

  it('returns null when nothing matches', () => {
    expect(findPropheticSet('Stewardship and giving', sample)).toBeNull()
  })

  it('ignores short filler words', () => {
    expect(findPropheticSet('of an the', sample)).toBeNull()
  })

  it('skips a set with no verses', () => {
    const empty: PropheticLibrary = {
      translation: 'BSB',
      sets: [{ topic: 'Love', keywords: ['love'], verses: [] }],
    }
    expect(findPropheticSet('Love', empty)).toBeNull()
  })
})

describe('pickPropheticWord', () => {
  it('returns a verse from the matched set with the translation', () => {
    expect(pickPropheticWord('father', sample, () => 0)).toEqual({
      reference: 'Luke 15:20',
      text: 'He ran to his son.',
      translation: 'BSB',
    })
    expect(pickPropheticWord('father', sample, () => 0.99)?.reference).toBe('1 John 4:19')
  })

  it('returns null without a matching set', () => {
    expect(pickPropheticWord('', sample)).toBeNull()
    expect(pickPropheticWord('Stewardship', sample)).toBeNull()
  })

  it('uses the set translation, and none for prophetic words', () => {
    const mixed: PropheticLibrary = {
      sets: [
        {
          topic: 'Luke 10:38-42',
          keywords: ['martha'],
          verses: [{ reference: 'Luke 10:38-42', text: 'Be faithful to what God asks.' }],
        },
        {
          topic: 'Faith Over Fear',
          keywords: ['fear'],
          translation: 'BSB',
          verses: [{ reference: 'Isaiah 41:10', text: 'Do not fear.' }],
        },
      ],
    }
    expect(pickPropheticWord('Martha', mixed)?.translation).toBeNull()
    expect(pickPropheticWord('fear', mixed)?.translation).toBe('BSB')
    expect(pickPropheticWord('father', { ...sample, sets: [{ ...sample.sets[0], translation: null }] })?.translation).toBeNull()
  })
})

describe('shipped word list (src/content/propheticWords.json)', () => {
  const sets = (library as PropheticLibrary).sets

  it('has the Young Pro list for Luke 10:38-42 with its 30 prophetic words', () => {
    const set = findPropheticSet('Luke 10:38-42', library as PropheticLibrary)
    expect(set).not.toBeNull()
    expect(set!.verses).toHaveLength(30)
    expect(pickPropheticWord('Mary and Martha', library as PropheticLibrary)?.translation).toBeNull()
  })

  it('no longer has the Sunday list', () => {
    expect(findPropheticSet('The Love of an Extravagant Father', library as PropheticLibrary)).toBeNull()
  })

  it('does not catch other Luke passages or generic topics', () => {
    for (const prompt of ['Luke 15:11-32', 'Faithful Stewardship', 'Bearing Fruit', 'Rest']) {
      expect(findPropheticSet(prompt, library as PropheticLibrary)).toBeNull()
    }
  })

  it('has well-formed references, unique entries and non-empty text without dashes', () => {
    for (const set of sets) {
      // Bible verses have one entry per reference; prophetic words share the
      // passage reference, so their text must be unique instead.
      const keys = set.verses.map((v) => (set.translation ? v.reference : v.text))
      expect(new Set(keys).size).toBe(keys.length)
      for (const v of set.verses) {
        expect(v.reference).toMatch(/^[1-3]? ?[A-Z][a-z]+ \d+:\d+(-\d+)?$/)
        expect(v.text.trim().length).toBeGreaterThan(10)
        expect(v.text).not.toMatch(/[—–]/)
      }
    }
  })
})
