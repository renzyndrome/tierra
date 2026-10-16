// Prophetic word shown after a QR check-in.
//
// A session may carry a "prophetic prompt" (the sermon topic). Until an AI
// connector exists, words come from a hand-made list in
// src/content/propheticWords.json: one set per topic, each with match keywords.
// A set holds Bible verses (with a translation, e.g. "BSB") or prophetic words
// written for the passage (no translation). The prompt picks a set (exact
// topic first, then most keyword hits) and each check-in gets one random entry
// from it. No matching set: no word.

export interface PropheticVerse {
  reference: string
  text: string
}

export interface PropheticWordSet {
  topic: string
  keywords: string[]
  verses: PropheticVerse[]
  // Bible translation of this set's verses, e.g. "BSB". Omitted for prophetic
  // words written for a passage.
  translation?: string | null
}

export interface PropheticLibrary {
  // Default translation for sets that do not name one.
  translation?: string | null
  sets: PropheticWordSet[]
}

export interface PropheticWord extends PropheticVerse {
  translation: string | null
}

// Words too common to signal a topic.
const FILLER_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'our', 'his', 'her', 'its', 'this', 'that',
  'who', 'are', 'was', 'you', 'your', 'him', 'them', 'they', 'into', 'unto', 'over',
])

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function topicWords(text: string): string[] {
  const words = normalize(text).split(' ')
  // A word right before a number is the book of a Bible reference ("Luke 15"):
  // every passage of that book shares it, so it does not identify a topic.
  return words.filter(
    (w, i) => w.length >= 3 && !FILLER_WORDS.has(w) && !/^\d/.test(words[i + 1] ?? ''),
  )
}

/** The verse set for a session prompt, or null when none fits. */
export function findPropheticSet(
  prompt: string | null | undefined,
  library: PropheticLibrary,
): PropheticWordSet | null {
  const wanted = normalize(prompt ?? '')
  if (!wanted) return null
  const sets = library.sets.filter((s) => s.verses.length > 0)

  const exact = sets.find((s) => normalize(s.topic) === wanted)
  if (exact) return exact

  const promptWords = new Set(topicWords(wanted))
  let best: PropheticWordSet | null = null
  let bestHits = 0
  for (const set of sets) {
    const setWords = new Set([...set.keywords.map(normalize), ...topicWords(set.topic)])
    const hits = [...promptWords].filter((w) => setWords.has(w)).length
    if (hits > bestHits) {
      best = set
      bestHits = hits
    }
  }
  return best
}

/** One random verse for a session prompt, or null when no set fits. */
export function pickPropheticWord(
  prompt: string | null | undefined,
  library: PropheticLibrary,
  random: () => number = Math.random,
): PropheticWord | null {
  const set = findPropheticSet(prompt, library)
  if (!set) return null
  const index = Math.min(set.verses.length - 1, Math.floor(random() * set.verses.length))
  const translation = set.translation === undefined ? library.translation ?? null : set.translation
  return { ...set.verses[index], translation }
}
