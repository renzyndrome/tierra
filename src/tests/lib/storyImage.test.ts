// Unit tests for the story image text layout (the canvas drawing itself runs
// only in a browser).

import { describe, it, expect } from 'vitest'
import { wrapLines, fitText, storyFileName } from '../../lib/storyImage'

// Fixed-width measure: every character is 10 units at size 10.
const measure = (s: string) => s.length * 10
const measureAt = (size: number, s: string) => s.length * size

describe('wrapLines', () => {
  it('fills each line up to the width', () => {
    expect(wrapLines('one two three four', 90, measure)).toEqual(['one two', 'three', 'four'])
  })

  it('keeps an over-long word on its own line', () => {
    expect(wrapLines('a extraordinarily b', 50, measure)).toEqual(['a', 'extraordinarily', 'b'])
  })

  it('collapses extra spaces and returns nothing for empty text', () => {
    expect(wrapLines('  one   two  ', 200, measure)).toEqual(['one two'])
    expect(wrapLines('   ', 200, measure)).toEqual([])
  })
})

describe('fitText', () => {
  const text = 'God is teaching you to value spiritual depth over visible achievements.'

  it('uses the largest size that fits the line limit', () => {
    const { size, lines } = fitText(text, 2400, 2, measureAt, 80, 44)
    expect(size).toBeLessThan(80)
    expect(lines.length).toBeLessThanOrEqual(2)
    expect(wrapLines(text, 2400, (s) => measureAt(size + 2, s)).length).toBeGreaterThan(2)
  })

  it('falls back to the minimum size when nothing fits', () => {
    expect(fitText(text, 40, 2, measureAt, 80, 44).size).toBe(44)
  })
})

describe('storyFileName', () => {
  it('builds a readable, safe file name', () => {
    expect(storyFileName('Luke 10:38-42', 'night')).toBe('prophetic-word-luke-10-38-42-night.jpg')
    expect(storyFileName('  ', 'light')).toBe('prophetic-word-word-light.jpg')
  })
})
