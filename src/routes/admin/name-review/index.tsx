// Admin: split each member's name into first / middle / last / suffix, one
// member at a time. Confirm writes the four parts only; members.name (the
// display, search and matching value) is never changed here.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { SELECT_CLASS } from '../../../components/formClasses'
import { getNameReviewQueue, confirmNameParts } from '../../../server/functions/nameReview'
import {
  cleanPart,
  composeName,
  guessWordRoles,
  hasNameParts,
  initialWordRoles,
  moveRole,
  partsFromWords,
  setWordRole,
  tokenizeName,
  type NameGuess,
  type NameGuessFlag,
  type NameParts,
  type NameWord,
  type WordRole,
} from '../../../lib/nameParts'
import type { NamePartsStatus, NameReviewCounts, NameReviewItem } from '../../../lib/types'

export const Route = createFileRoute('/admin/name-review/')({
  component: () => (
    <AdminRoute requiredPermissions={['members.write']}>
      <NameReviewPage />
    </AdminRoute>
  ),
})

const STATUSES: NamePartsStatus[] = ['pending', 'auto', 'confirmed']
const STATUS_LABELS: Record<NamePartsStatus, string> = {
  pending: 'Pending',
  auto: 'Auto split',
  confirmed: 'Confirmed',
}
const EMPTY_MESSAGES: Record<NamePartsStatus, string> = {
  pending: 'No pending names.',
  auto: 'No auto splits.',
  confirmed: 'No confirmed names.',
}
const FLAG_LABELS: Record<NameGuessFlag, string> = {
  empty: 'Empty name',
  single: 'One word',
  comma: 'Comma in name',
  suffix: 'Suffix',
  particle: 'Surname particle',
  initial: 'Middle initial',
  nickname: 'Nickname left out',
  title: 'Title word left out',
  stray_dot: 'Stray dot removed',
  ambiguous_middle: 'Check middle name',
  many_tokens: 'Check first name',
}
const ROLE_OPTIONS: { value: WordRole; label: string }[] = [
  { value: 'first', label: 'First name' },
  { value: 'middle', label: 'Middle name' },
  { value: 'last', label: 'Last name' },
  { value: 'suffix', label: 'Suffix' },
  { value: 'skip', label: 'Leave out' },
]
// Card border per role, so the split reads at a glance.
const ROLE_TONE: Record<WordRole, string> = {
  first: 'border-blue-300 bg-blue-50',
  middle: 'border-violet-300 bg-violet-50',
  last: 'border-emerald-300 bg-emerald-50',
  suffix: 'border-amber-300 bg-amber-50',
  skip: 'border-gray-200 bg-gray-50 opacity-70',
}

type GuessInfo = Pick<NameGuess, 'flags' | 'confidence'>
const PAGE_SIZE = 50

type PartKey = keyof NameParts
type PartsForm = Record<PartKey, string>

const PART_FIELDS: { key: PartKey; label: string; required: boolean }[] = [
  { key: 'first_name', label: 'First name', required: true },
  { key: 'middle_name', label: 'Middle name', required: false },
  { key: 'last_name', label: 'Last name', required: true },
  { key: 'suffix', label: 'Suffix', required: false },
]

const toForm = (p: NameParts): PartsForm => ({
  first_name: p.first_name ?? '',
  middle_name: p.middle_name ?? '',
  last_name: p.last_name ?? '',
  suffix: p.suffix ?? '',
})

const fromForm = (f: PartsForm): NameParts => ({
  first_name: cleanPart(f.first_name),
  middle_name: cleanPart(f.middle_name),
  last_name: cleanPart(f.last_name),
  suffix: cleanPart(f.suffix),
})

function NameReviewPage() {
  const { session } = useAuth()
  const accessToken = session?.access_token
  // Read through a ref: Supabase rotates the token about hourly, and a new
  // token must not restart the walk or wipe edits in the boxes.
  const tokenRef = useRef(accessToken)
  useEffect(() => {
    tokenRef.current = accessToken
  }, [accessToken])
  const hasToken = Boolean(accessToken)
  // Only the latest request may update the page. A list switch during a load
  // makes the older response stale.
  const requestId = useRef(0)

  const [status, setStatus] = useState<NamePartsStatus>('pending')
  const [items, setItems] = useState<NameReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [exhausted, setExhausted] = useState(false)
  const [counts, setCounts] = useState<NameReviewCounts | null>(null)
  const [form, setForm] = useState<PartsForm>(toForm({ first_name: null, middle_name: null, last_name: null, suffix: null }))
  const [words, setWords] = useState<NameWord[]>([])
  const [source, setSource] = useState<'confirmed' | 'auto' | 'guess'>('guess')
  const [guess, setGuess] = useState<GuessInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')

  const current = items[index] as NameReviewItem | undefined

  // First page of a status. Resets the walk.
  const loadFirst = useCallback(async () => {
    const token = tokenRef.current
    if (!token) return
    const id = ++requestId.current
    setLoading(true)
    setError('')
    setItems([])
    setIndex(0)
    setSkipped(0)
    setExhausted(false)
    try {
      const res = await getNameReviewQueue({ data: { accessToken: token, status, offset: 0, limit: PAGE_SIZE } })
      if (id !== requestId.current) return
      setItems(res.items)
      setCounts(res.counts)
      setExhausted(res.items.length < PAGE_SIZE)
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err.message : 'Queue failed to load. Retry.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [status])

  useEffect(() => {
    if (hasToken) loadFirst()
  }, [hasToken, loadFirst])

  // Next page. Rows confirmed this session left the pending/auto set on the
  // server, so the offset is the number of loaded rows still in this status.
  const loadMore = useCallback(async () => {
    const token = tokenRef.current
    if (!token || exhausted) return
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const offset = items.filter((i) => i.name_parts_status === status).length
      const res = await getNameReviewQueue({ data: { accessToken: token, status, offset, limit: PAGE_SIZE } })
      if (id !== requestId.current) return
      setItems((prev) => {
        const known = new Set(prev.map((i) => i.id))
        return [...prev, ...res.items.filter((i) => !known.has(i.id))]
      })
      setCounts(res.counts)
      // A full page of already-loaded rows (another admin confirmed rows in
      // the meantime) also ends the walk; Start over reloads from the top.
      const known = new Set(items.map((i) => i.id))
      setExhausted(res.items.length < PAGE_SIZE || res.items.every((i) => known.has(i.id)))
    } catch (err) {
      if (id !== requestId.current) return
      setError(err instanceof Error ? err.message : 'Queue failed to load. Retry.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [exhausted, items, status])

  // Walked past the loaded rows: fetch the next page. Not after a failed
  // load, so an outage does not retry in a loop; Retry is shown instead.
  useEffect(() => {
    if (!loading && !error && index >= items.length && !exhausted && items.length > 0) loadMore()
  }, [index, items.length, exhausted, loading, error, loadMore])

  // Prefill the word menus and the four boxes whenever a different member
  // comes up.
  const currentId = current?.id
  useEffect(() => {
    if (!current) return
    const init = initialWordRoles(current)
    setWords(init.words)
    setForm(toForm(init.parts))
    setSource(init.source)
    setGuess(init.guess)
    setFormError('')
    // Only a new member resets the boxes; a confirm on the same row does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  const setPart = (key: PartKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFormError('')
  }

  // A word menu or quick fix changed the roles: the boxes refill from them.
  const applyWords = (next: NameWord[]) => {
    setWords(next)
    setForm(toForm(partsFromWords(next)))
    setFormError('')
  }

  const regroup = (order: 'first-last' | 'last-first') => {
    if (!current) return
    const g = guessWordRoles(current.name, order)
    setGuess({ flags: g.flags, confidence: g.confidence })
    setSource('guess')
    applyWords(g.words)
  }

  const hasMiddleWord = words.some((w) => w.role === 'middle')

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = tokenRef.current
    if (!current || !token || busy) return
    const parts = fromForm(form)
    if (!hasNameParts(parts)) {
      setFormError('First name and last name required.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await confirmNameParts({
        data: {
          accessToken: token,
          id: current.id,
          name: current.name,
          first_name: parts.first_name ?? '',
          middle_name: parts.middle_name,
          last_name: parts.last_name ?? '',
          suffix: parts.suffix,
        },
      })
      const before = current.name_parts_status
      setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)))
      if (before !== 'confirmed') {
        setCounts((c) => (c ? { ...c, [before]: Math.max(0, c[before] - 1), confirmed: c.confirmed + 1 } : c))
      }
      setIndex((i) => i + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed. Retry.')
    } finally {
      setBusy(false)
    }
  }

  const handleSkip = () => {
    setError('')
    setSkipped((n) => n + 1)
    setIndex((i) => i + 1)
  }

  const handleBack = () => {
    setError('')
    setIndex((i) => Math.max(0, i - 1))
  }

  const composed = composeName(fromForm(form))
  const original = current ? tokenizeName(current.name).join(' ') : ''
  const differs = Boolean(current) && composed !== original
  const atEnd = !current && !loading && !error && (exhausted || items.length === 0)
  const stalled = !current && !loading && Boolean(error)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Name Review</h1>
            <p className="text-sm text-gray-500">First, middle, last name and suffix per member</p>
          </div>
          <Link to="/admin" className="text-sm text-[#8B1538] font-semibold hover:underline">
            Back to admin
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              disabled={busy}
              className={`min-h-11 px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                s === status
                  ? 'bg-[#8B1538] text-white border-[#8B1538]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            >
              {STATUS_LABELS[s]}
              {counts && <span className="ml-1.5 opacity-80">{counts[s]}</span>}
            </button>
          ))}
        </div>

        {counts && (
          <p className="text-sm text-gray-600">
            Confirmed {counts.confirmed} of {counts.total}.
            {skipped > 0 && <span className="ml-2 text-gray-500">Skipped this session: {skipped}.</span>}
          </p>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {loading && !current ? (
          <p className="p-8 text-center text-gray-500">Loading…</p>
        ) : stalled ? (
          <div className="p-8 bg-white rounded-xl border border-gray-200 text-center">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => (items.length > 0 ? loadMore() : loadFirst())}
            >
              Retry
            </Button>
          </div>
        ) : atEnd ? (
          <div className="p-8 bg-white rounded-xl border border-gray-200 text-center space-y-3">
            <p className="text-gray-700">{items.length === 0 ? EMPTY_MESSAGES[status] : 'End of list.'}</p>
            {items.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" className="min-h-11" onClick={() => setIndex(items.length - 1)}>
                  Back
                </Button>
                <Button type="button" variant="outline" className="min-h-11" onClick={loadFirst}>
                  Start over
                </Button>
              </div>
            )}
          </div>
        ) : current ? (
          <form onSubmit={handleConfirm} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Display name</p>
                  <p className="text-2xl font-semibold text-gray-900 break-words">{current.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {current.is_archived && (
                      <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">Archived</span>
                    )}
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                      {current.membership_status}
                    </span>
                    <Link
                      to="/directory/members/$memberId"
                      params={{ memberId: current.id }}
                      target="_blank"
                      className="text-[#8B1538] hover:underline"
                    >
                      Open profile
                    </Link>
                  </div>
                </div>
                <SourceBadge source={source} guess={guess} />
              </div>
              {guess && guess.flags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {guess.flags.map((f) => (
                    <span key={f} className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {FLAG_LABELS[f]}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">
              {words.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Each word</p>
                  <div className="flex flex-wrap gap-2">
                    {words.map((w, i) => (
                      <label key={`${i}-${w.text}`} className={`flex flex-col gap-1 rounded-lg border p-2 min-w-[9rem] ${ROLE_TONE[w.role]}`}>
                        <span className="text-base font-semibold text-gray-900 break-all">{w.text}</span>
                        <select
                          value={w.role}
                          onChange={(e) => applyWords(setWordRole(words, i, e.target.value as WordRole))}
                          disabled={busy}
                          aria-label={`Part for ${w.text}`}
                          className={SELECT_CLASS.replace('mt-1 ', '')}
                        >
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">A menu change refills the boxes below.</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {PART_FIELDS.map((f) => (
                  <div key={f.key}>
                    <Label htmlFor={`part-${f.key}`} className="mb-1">
                      {f.label}
                      {f.required && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id={`part-${f.key}`}
                      value={form[f.key]}
                      onChange={(e) => setPart(f.key, e.target.value)}
                      className="min-h-11"
                      autoComplete="off"
                      disabled={busy}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => regroup('last-first')}>
                  Last name first
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || !hasMiddleWord}
                  onClick={() => applyWords(moveRole(words, 'middle', 'first'))}
                >
                  Middle joins first
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy || !hasMiddleWord}
                  onClick={() => applyWords(moveRole(words, 'middle', 'last'))}
                >
                  Middle joins last
                </Button>
                <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => regroup('first-last')}>
                  Reset guess
                </Button>
              </div>

              <div className="text-sm">
                <p className="text-gray-600">
                  Parts joined: <span className="font-medium text-gray-900">{composed || '–'}</span>
                </p>
                {differs && <p className="text-amber-700">Differs from display name.</p>}
                <p className="text-xs text-gray-500">Display name not changed.</p>
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-gray-100">
                <Button type="button" variant="outline" className="min-h-11" disabled={busy || index === 0} onClick={handleBack}>
                  Back
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={handleSkip}>
                    Skip
                  </Button>
                  <Button type="submit" className="min-h-11 bg-[#8B1538] hover:bg-[#6B0F2B]" disabled={busy}>
                    {busy ? 'Saving…' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        ) : null}
      </main>
    </div>
  )
}

function SourceBadge({ source, guess }: { source: 'confirmed' | 'auto' | 'guess'; guess: GuessInfo | null }) {
  if (source === 'confirmed') {
    return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">Confirmed</span>
  }
  if (source === 'auto') {
    return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Auto split</span>
  }
  const level = guess?.confidence ?? 'low'
  const tone =
    level === 'high' ? 'bg-green-50 text-green-800' : level === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
  const label = level === 'high' ? 'Guess: likely' : level === 'medium' ? 'Guess: check' : 'Guess: unsure'
  return <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${tone}`}>{label}</span>
}
