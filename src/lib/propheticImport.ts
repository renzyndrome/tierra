// Turn an imported prophetic-word document (PDF text, spreadsheet rows, or
// pasted text) into a word list for one service. Layouts vary, so this is
// heuristic: staff review and edit the result in a preview before saving.
//
//   heading  -> the passage reference ("LUKE 10:38-42" -> "Luke 10:38-42")
//   numbered -> one word per number ("1.", "1)", "(1)", bullets); unnumbered
//               lines after a number are its wrapped continuation
//   no numbers -> one word per line, joining a line that only continues the
//               previous sentence (PDF line wrap)
//   verse lines -> "Psalm 73:26 - My flesh and my heart may fail...": one word
//               per line that starts with a reference, which becomes that
//               word's own reference; other lines are its wrapped text

import type { PropheticListWord } from './propheticWord'

export interface ParsedWordList {
  reference: string
  words: PropheticListWord[]
  warnings: string[]
}

// Shortest and longest text kept as a word.
export const MIN_WORD_LENGTH = 8
export const MAX_WORD_LENGTH = 400
export const MAX_WORDS = 200

// A Bible reference: optional 1-3 prefix, one or more book words, chapter, and
// optional verse range. "Luke 10:38-42", "1 John 4:7-12", "Song of Songs 2".
const REFERENCE = /^(?:[1-3]\s*)?[A-Za-z]+(?:\s+(?:of\s+)?[A-Za-z]+)?\s+\d{1,3}(?::\d{1,3}(?:\s*[-–—]\s*\d{1,3}(?::\d{1,3})?)?)?$/
// A line that starts with its own verse reference, then a dash or colon:
// "Psalm 112:1-3 — Blessed is...", "2 Timothy 4:17 - But the Lord...".
const VERSE_LINE = /^((?:[1-3]\s*)?[A-Za-z]+(?:\s+(?:of\s+)?[A-Za-z]+)?\s+\d{1,3}:\d{1,3}(?:\s*[-–—]\s*\d{1,3}(?::\d{1,3})?)?)\s*[-–—:]\s+(\S.*)$/
const NUMBERED = /^\s*(?:\(?\d{1,3}[.):\]]|\d{1,3}\s*[-–]\s)\s*(.*)$/
const BULLETED = /^\s*[•●▪◦‣·*\-–—]\s+(.*)$/
const PAGE_NUMBER = /^(?:page\s+)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$/i
const HEADER_CELL = /^(?:no\.?|#|number|item|words?|prophetic\s+words?|text|reference)$/i

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Title-cases a reference and uses a plain hyphen: "LUKE 10:38–42" -> "Luke 10:38-42". */
export function normalizeReference(text: string): string {
  return clean(text)
    .replace(/\s*[–—]\s*/g, '-')
    .replace(/\s*-\s*/g, '-')
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, 'of')
}

/** The first passage reference within a heading line, if any. */
export function findReference(line: string): string | null {
  const text = clean(line)
  if (REFERENCE.test(text)) return normalizeReference(text)
  // A reference inside a longer heading: "Prophetic Words - Luke 10:38-42".
  const inner = text.match(/(?:[1-3]\s*)?[A-Za-z]+(?:\s+(?:of\s+)?[A-Za-z]+)?\s+\d{1,3}:\d{1,3}(?:\s*[-–—]\s*\d{1,3})?/)
  return inner ? normalizeReference(inner[0]) : null
}

function endsSentence(text: string): boolean {
  return /[.!?;:"”’)]$/.test(text)
}

/** Drops the quote marks around a whole word: “Do not fear.” -> Do not fear.
 *  A closing mark goes only when no other quote opens inside the text. */
export function unquote(text: string): string {
  const opened = /^[“"]/.test(text)
  let out = text.replace(/^[“"]\s*/, '')
  if (opened && !/[“"]/.test(out.slice(0, -1))) out = out.replace(/\s*[”"]$/, '')
  return out
}

/** Splits a leading verse reference off a word, if it has one. */
export function splitVerse(text: string): PropheticListWord {
  const m = clean(text).match(VERSE_LINE)
  if (!m) return { text: unquote(clean(text)), reference: null }
  return { text: unquote(m[2]), reference: normalizeReference(m[1]) }
}

function finish(reference: string, items: string[], dropped: string[]): ParsedWordList {
  const warnings: string[] = [...dropped]
  const seen = new Set<string>()
  const words: PropheticListWord[] = []
  let duplicates = 0
  let short = 0
  let long = 0
  for (const raw of items) {
    const word = splitVerse(raw)
    if (word.text.length < MIN_WORD_LENGTH) {
      if (word.text) short++
      continue
    }
    const key = `${word.reference ?? ''}|${word.text.toLowerCase()}`
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)
    if (word.text.length > MAX_WORD_LENGTH) long++
    words.push(word)
  }
  if (duplicates) warnings.push(`${duplicates} repeated ${duplicates === 1 ? 'word' : 'words'} removed.`)
  if (short) warnings.push(`${short} short ${short === 1 ? 'line' : 'lines'} skipped.`)
  if (long) warnings.push(`${long} ${long === 1 ? 'word is' : 'words are'} over ${MAX_WORD_LENGTH} characters. Shorten before saving.`)
  if (words.length > MAX_WORDS) warnings.push(`Over ${MAX_WORDS} words. Only the first ${MAX_WORDS} are kept.`)
  if (!reference && words.some((w) => !w.reference)) warnings.push('No passage reference found. Type it in.')
  if (words.length === 0) warnings.push('No words found. Check the file, or paste the text.')
  return { reference, words: words.slice(0, MAX_WORDS), warnings }
}

/** Parses text (from a PDF or a paste) into a word list. */
export function parsePropheticText(raw: string): ParsedWordList {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(clean)
    .filter((l) => l && !PAGE_NUMBER.test(l))

  let reference = ''
  const numberedCount = lines.filter((l) => NUMBERED.test(l) || BULLETED.test(l)).length
  const verseCount = lines.filter((l) => VERSE_LINE.test(l)).length
  const items: string[] = []

  if (verseCount >= 2 && numberedCount < 2) {
    // Each verse line starts a word; any other line continues it (a capital
    // letter included: "Lord your God..."). Lines before the first verse are
    // a heading.
    let current: string | null = null
    for (const line of lines) {
      if (VERSE_LINE.test(line)) {
        if (current !== null) items.push(current)
        current = line
        continue
      }
      if (current !== null) current = `${current} ${line}`
      else if (!reference) reference = findReference(line) ?? ''
    }
    if (current !== null) items.push(current)
  } else if (numberedCount >= 2) {
    let current: string | null = null
    for (const line of lines) {
      const m = line.match(NUMBERED) ?? line.match(BULLETED)
      if (m) {
        if (current !== null) items.push(current)
        current = m[1]
        continue
      }
      const ref = findReference(line)
      if (ref && current === null && !reference) {
        reference = ref
        continue
      }
      // Heading text before the first item; wrapped text after it.
      if (current !== null) current = `${current} ${line}`
    }
    if (current !== null) items.push(current)
  } else {
    for (const line of lines) {
      const ref = items.length === 0 && !reference ? findReference(line) : null
      if (ref) {
        reference = ref
        continue
      }
      const prev = items[items.length - 1]
      if (prev !== undefined && !endsSentence(prev) && /^[a-z]/.test(line)) {
        items[items.length - 1] = `${prev} ${line}`
      } else {
        items.push(line)
      }
    }
  }
  return finish(reference, items, [])
}

/** Parses spreadsheet rows (first sheet) into a word list: one word per row,
 *  taken from the row's longest text cell. Header rows and number-only cells
 *  are skipped; a reference cell in the first rows becomes the reference. */
export function parsePropheticRows(rows: unknown[][]): ParsedWordList {
  let reference = ''
  const items: string[] = []
  rows.forEach((row, index) => {
    const cells = row
      .map((c) => (c === null || c === undefined ? '' : clean(String(c))))
      .filter((c) => c && !/^\d+(?:\.\d+)?$/.test(c) && !HEADER_CELL.test(c))
    if (cells.length === 0) return
    const longest = cells.reduce((a, b) => (b.length > a.length ? b : a))
    const ref = index < 3 && !reference && cells.length === 1 ? findReference(longest) : null
    if (ref && longest.length < 40) {
      reference = ref
      return
    }
    const numbered = longest.match(NUMBERED)
    const text = numbered ? numbered[1] : longest
    // A reference column next to the text: that row's own verse reference.
    const refCell = cells.find((c) => c !== longest && REFERENCE.test(c) && c.includes(':'))
    items.push(refCell ? `${refCell} - ${text}` : text)
  })
  return finish(reference, items, [])
}

/** A PDF text item with its position (pdf.js getTextContent). */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

/** Rebuilds reading-order text lines from PDF text items: items on the same
 *  baseline form one line (left to right), lines run top to bottom. A space
 *  goes between items only where the PDF leaves a visible gap. */
export function pdfItemsToText(items: PdfTextItem[]): string {
  const visible = items.filter((i) => i.str.length > 0)
  const lines: PdfTextItem[][] = []
  for (const item of [...visible].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines[lines.length - 1]
    const tolerance = Math.max(2, (item.height || 10) * 0.4)
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item)
    else lines.push([item])
  }
  return lines
    .map((line) => {
      const sorted = [...line].sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const item of sorted) {
        const gap = item.x - end
        const needsSpace = text && gap > 1.5 && !/\s$/.test(text) && !/^\s/.test(item.str)
        text += (needsSpace ? ' ' : '') + item.str
        end = item.x + item.width
      }
      return clean(text)
    })
    .filter(Boolean)
    .join('\n')
}
