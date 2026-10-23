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
  // Bible translation, from a template's "Translation" row; null when none.
  translation?: string | null
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
const HEADER_CELL = /^(?:no\.?|#|number|item|words?|prophetic\s+words?(?:\s+or\s+verses?)?|text|verses?|reference(?:\s*\(optional\))?)$/i
// Label rows of the import template: "Passage reference | Luke 10:38-42".
const REFERENCE_LABEL = /^passage\s+reference:?$/i
const TRANSLATION_LABEL = /^translation(?:\s*\(optional\))?:?$/i

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
  if (!reference && words.some((w) => !w.reference)) warnings.push('No passage reference found. Optional.')
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
  let translation: string | null = null
  const items: string[] = []
  rows.forEach((row, index) => {
    const raw = row.map((c) => (c === null || c === undefined ? '' : clean(String(c))))
    // Template label rows: the value sits in the next filled cell.
    const labelAt = raw.findIndex((c) => REFERENCE_LABEL.test(c) || TRANSLATION_LABEL.test(c))
    if (labelAt >= 0) {
      const value = raw.slice(labelAt + 1).find((c) => c) ?? ''
      if (REFERENCE_LABEL.test(raw[labelAt])) reference = value ? (findReference(value) ?? value) : reference
      else translation = value || null
      return
    }
    const cells = raw.filter((c) => c && !/^\d+(?:\.\d+)?$/.test(c) && !HEADER_CELL.test(c))
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
  return { ...finish(reference, items, []), translation }
}

/** A PDF text item with its position (pdf.js getTextContent). */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

/** One run of text on a PDF line, between wide horizontal gaps. */
export interface PdfSegment {
  text: string
  x: number
  end: number
  y: number
  // Index of the PDF line the segment came from.
  line: number
}

// A horizontal gap this wide (points) splits a line: a column gutter or a
// table gap, never the space between words.
const SEGMENT_GAP = 24

function joinItems(sorted: PdfTextItem[]): string {
  let text = ''
  let end = -Infinity
  for (const item of sorted) {
    const gap = item.x - end
    const needsSpace = text && gap > 1.5 && !/\s$/.test(text) && !/^\s/.test(item.str)
    text += (needsSpace ? ' ' : '') + item.str
    end = item.x + item.width
  }
  return clean(text)
}

function lineSegments(line: PdfTextItem[], lineIndex: number): PdfSegment[] {
  const sorted = [...line].sort((a, b) => a.x - b.x)
  const segments: PdfSegment[] = []
  let run: PdfTextItem[] = []
  let end = -Infinity
  for (const item of sorted) {
    if (run.length && item.str.trim() && item.x - end > SEGMENT_GAP) {
      segments.push({ text: joinItems(run), x: run[0].x, end, y: run[0].y, line: lineIndex })
      run = []
    }
    run.push(item)
    end = Math.max(end, item.x + item.width)
  }
  if (run.length) segments.push({ text: joinItems(run), x: run[0].x, end, y: run[0].y, line: lineIndex })
  return segments.filter((s) => s.text)
}

/** The x position between two text columns, or null for a one-column page.
 *  Wide segments (headings across the page) are left out of the search. A
 *  reference | text table is not two columns: its rows pair up side by side
 *  and the right side has no numbered items. */
export function findColumnSplit(segments: PdfSegment[]): number | null {
  if (segments.length < 6) return null
  const minX = Math.min(...segments.map((s) => s.x))
  const maxX = Math.max(...segments.map((s) => s.end))
  const narrow = segments.filter((s) => s.end - s.x < (maxX - minX) * 0.6)
  const covered = new Uint8Array(Math.ceil(maxX - minX) + 1)
  for (const s of narrow) covered.fill(1, Math.floor(s.x - minX), Math.ceil(s.end - minX))
  let best = { from: 0, length: 0 }
  let from = -1
  for (let i = 0; i < covered.length; i++) {
    if (!covered[i] && from < 0) from = i
    if (covered[i] && from >= 0) {
      if (i - from > best.length) best = { from, length: i - from }
      from = -1
    }
  }
  if (best.length < SEGMENT_GAP) return null
  const split = minX + best.from + best.length / 2
  const left = narrow.filter((s) => s.end <= split)
  const right = narrow.filter((s) => s.x >= split)
  if (left.length < 3 || right.length < 3) return null
  const paired = right.filter((r) => left.some((l) => l.line === r.line)).length
  const numberedRight = right.filter((r) => NUMBERED.test(r.text) || BULLETED.test(r.text)).length
  if (paired / right.length > 0.5 && numberedRight < 2) return null
  return split
}

/** Rebuilds reading-order text lines from PDF text items: items on the same
 *  baseline form one line (left to right), lines run top to bottom. A space
 *  goes between items only where the PDF leaves a visible gap. On a page with
 *  two text columns, the left column is read before the right one (headings
 *  across the page first). */
export function pdfItemsToText(items: PdfTextItem[]): string {
  const visible = items.filter((i) => i.str.length > 0)
  const lines: PdfTextItem[][] = []
  for (const item of [...visible].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines[lines.length - 1]
    const tolerance = Math.max(2, (item.height || 10) * 0.4)
    if (line && Math.abs(line[0].y - item.y) <= tolerance) line.push(item)
    else lines.push([item])
  }
  const segments = lines.flatMap((line, index) => lineSegments(line, index))
  const split = findColumnSplit(segments)
  if (split === null) return lines.map((line) => joinItems([...line].sort((a, b) => a.x - b.x))).filter(Boolean).join('\n')

  // Column order: headings above the columns, left column, right column,
  // anything across the page below them.
  const inColumns = segments.filter((s) => s.end <= split || s.x >= split)
  const top = Math.max(...inColumns.map((s) => s.y))
  const group = (s: PdfSegment): number =>
    s.end <= split ? 1 : s.x >= split ? 2 : s.y > top ? 0 : 3
  return [...segments]
    .sort((a, b) => group(a) - group(b) || b.y - a.y || a.x - b.x)
    .map((s) => s.text)
    .join('\n')
}

/** Text lines of a Word document body (word/document.xml): one line per
 *  paragraph. Auto-numbered and bulleted paragraphs get a "• " mark, so the
 *  text parser reads them as list items. Tables come back as rows of cells. */
export function docxXmlToContent(xml: string): { lines: string[]; rows: string[][] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const textOf = (el: Element): string => {
    let out = ''
    for (const node of Array.from(el.getElementsByTagName('*'))) {
      if (node.tagName === 'w:t') out += node.textContent ?? ''
      else if (node.tagName === 'w:tab' || node.tagName === 'w:br') out += ' '
    }
    return clean(out)
  }
  const lines: string[] = []
  const rows: string[][] = []
  // numId 0 switches numbering off.
  const isListed = (p: Element): boolean =>
    Array.from(p.getElementsByTagName('w:numId')).some((n) => n.getAttribute('w:val') !== '0')
  const walk = (blocks: Element[]) => {
    for (const block of blocks) {
      if (block.tagName === 'w:tbl') {
        for (const tr of Array.from(block.getElementsByTagName('w:tr'))) {
          rows.push(Array.from(tr.getElementsByTagName('w:tc')).map(textOf))
        }
      } else if (block.tagName === 'w:p') {
        const text = textOf(block)
        if (text) lines.push(isListed(block) ? `• ${text}` : text)
      } else if (block.tagName === 'w:sdt') {
        // Content control: its paragraphs and tables sit in w:sdtContent.
        const content = Array.from(block.children).find((c) => c.tagName === 'w:sdtContent')
        if (content) walk(Array.from(content.children))
      }
    }
  }
  walk(Array.from(doc.getElementsByTagName('w:body')[0]?.children ?? []))
  return { lines, rows }
}

/** A Word document's word list: from its tables when they hold words (the
 *  import template; paragraphs there are titles and notes), else from its
 *  paragraphs. */
export function parsePropheticDocx(xml: string): ParsedWordList {
  const { lines, rows } = docxXmlToContent(xml)
  const fromText = parsePropheticText(lines.join('\n'))
  if (rows.length < 2) return fromText
  const parsed = parsePropheticRows(rows)
  // The template's table always wins; any other table (e.g. a letterhead) only
  // when it holds more words than the paragraphs.
  const template = rows.some((r) => r.some((c) => REFERENCE_LABEL.test(c) || /^prophetic\s+word\s+or\s+verse$/i.test(c)))
  if (parsed.words.length === 0 || (!template && parsed.words.length < fromText.words.length)) return fromText
  if (parsed.reference) return parsed
  const heading = lines.map(findReference).find((r): r is string => r !== null)
  if (!heading) return parsed
  return { ...parsed, reference: heading, warnings: parsed.warnings.filter((w) => !w.startsWith('No passage reference')) }
}
