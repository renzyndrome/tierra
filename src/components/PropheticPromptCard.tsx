// Session Manage page: the prophetic word after a QR check-in. The session's
// word list comes from a saved set (Admin → Attendance → Prophetic words) or
// is imported straight onto this session (PDF, Word, spreadsheet or paste).
// Older sessions may still carry a prompt (sermon topic) that picks a built-in
// list from src/content/propheticWords.json; that field shows only for them.

import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { FileUp } from 'lucide-react'
import { setSessionPropheticPrompt, setSessionPropheticWords } from '../server/functions/attendance'
import { applyPropheticSetToSession, getPropheticSets } from '../server/functions/propheticSets'
import type { PropheticWordList } from '../lib/propheticWord'
import type { PropheticWordSetSummary } from '../lib/types'
import { PropheticImportDialog } from './PropheticImportDialog'
import { formatSetOption } from './PropheticSetSelect'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

type PropheticSetSummary = { topic: string; verse_count: number } | null

interface PropheticPromptCardProps {
  accessToken: string | undefined
  sessionId: string
  prompt: string | null
  matchedSet: PropheticSetSummary
  // The session's word list, if any.
  words: PropheticWordList | null
  // The saved set that list came from, if any.
  wordSet: { id: string; title: string } | null
  canWrite: boolean
  // Called after a save so the page can reload the session.
  onSaved: () => Promise<void>
}

function matchHint(prompt: string, set: PropheticSetSummary): string {
  if (!prompt.trim()) return 'None. No prophetic word after QR check-in.'
  if (!set) return 'No word list for this prompt. No prophetic word after QR check-in.'
  return `Word list: ${set.topic}, ${set.verse_count} words. One random word per QR check-in.`
}

function listHint(words: PropheticWordList, wordSet: { title: string } | null): string {
  const count = `${words.words.length} words. One random word per QR check-in.`
  if (wordSet) return `Set: ${wordSet.title}, ${count}`
  return `Imported: ${words.reference ? `${words.reference}, ` : ''}${count}`
}

export function PropheticPromptCard({
  accessToken,
  sessionId,
  prompt,
  matchedSet,
  words,
  wordSet,
  canWrite,
  onSaved,
}: PropheticPromptCardProps) {
  const [importing, setImporting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const hasList = Boolean(words && words.words.length > 0)
  const [value, setValue] = useState(prompt ?? '')
  const [saved, setSaved] = useState({ prompt: prompt ?? '', set: matchedSet })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sets, setSets] = useState<PropheticWordSetSummary[]>([])
  const [chosenSet, setChosenSet] = useState('')
  const [applying, setApplying] = useState(false)

  // Follow a reload of the session (e.g. another admin saved a prompt).
  // Primitive deps: a reload with the same prompt keeps unsaved typing.
  const topic = matchedSet?.topic ?? null
  const verseCount = matchedSet?.verse_count ?? 0
  useEffect(() => {
    setValue(prompt ?? '')
    setSaved({ prompt: prompt ?? '', set: topic ? { topic, verse_count: verseCount } : null })
  }, [prompt, topic, verseCount])

  useEffect(() => {
    if (!accessToken || !canWrite) return
    let active = true
    getPropheticSets({ data: { accessToken } })
      .then((list) => active && setSets(list))
      .catch(() => active && setSets([]))
    return () => {
      active = false
    }
  }, [accessToken, canWrite])

  const dirty = value.trim() !== saved.prompt.trim()
  // The prompt field is legacy: shown only for sessions that already have one.
  const showPrompt = Boolean(prompt?.trim())

  const save = async () => {
    if (!accessToken) return
    setBusy(true)
    setError('')
    try {
      const next = value.trim()
      const set = await setSessionPropheticPrompt({
        data: { accessToken, sessionId, propheticPrompt: next || null },
      })
      setSaved({ prompt: next, set })
      setValue(next)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prophetic prompt not saved. Retry.')
    } finally {
      setBusy(false)
    }
  }

  const removeList = async () => {
    if (!accessToken) return
    setRemoving(true)
    setError('')
    try {
      await setSessionPropheticWords({ data: { accessToken, sessionId, list: null } })
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word list not removed. Retry.')
    } finally {
      setRemoving(false)
    }
  }

  const applySet = async () => {
    if (!accessToken || !chosenSet) return
    // A hand-imported or edited list exists nowhere else.
    if (hasList && !wordSet && !window.confirm('Replace the imported word list with this set. The imported list is not kept.')) return
    setApplying(true)
    setError('')
    try {
      await applyPropheticSetToSession({ data: { accessToken, sessionId, setId: chosenSet } })
      setChosenSet('')
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word set not applied. Retry.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <p className="text-sm font-medium text-gray-900">Prophetic words</p>
        <p className="mt-1 text-xs text-gray-500">
          {hasList && words
            ? listHint(words, wordSet)
            : showPrompt
              ? 'No word list. The prompt below applies.'
              : 'None. No prophetic word after QR check-in.'}
        </p>
        {canWrite && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="session-word-set"
                aria-label="Word set"
                value={chosenSet}
                onChange={(e) => setChosenSet(e.target.value)}
                className="h-11 sm:h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none"
              >
                <option value="">{sets.length ? 'Choose a word set' : 'No saved word sets'}</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {formatSetOption(s)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={!chosenSet || applying}
                onClick={applySet}
                className="h-11 sm:h-9 shrink-0 bg-[#8B1538] hover:bg-[#6B0F2B]"
              >
                {applying ? 'Applying…' : hasList ? 'Replace with set' : 'Use set'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setImporting(true)} className="h-11 sm:h-9">
                <FileUp className="h-4 w-4" aria-hidden /> {hasList ? 'Edit words' : 'Import words'}
              </Button>
              {hasList && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removing}
                  onClick={removeList}
                  className="h-11 sm:h-9 text-red-600 hover:text-red-700"
                >
                  {removing ? 'Removing…' : 'Remove list'}
                </Button>
              )}
              <Link to="/admin/attendance/words" className="text-xs font-medium text-[#8B1538] underline">
                Manage word sets
              </Link>
            </div>
          </div>
        )}
        {showPrompt && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <Label htmlFor="session-prophetic">Prophetic prompt</Label>
            {canWrite ? (
              <div className="mt-1 flex flex-col sm:flex-row gap-2">
                <Input
                  id="session-prophetic"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={200}
                  className="h-11 sm:h-9"
                />
                <Button
                  size="sm"
                  disabled={busy || !dirty}
                  onClick={save}
                  className="h-11 sm:h-9 bg-[#8B1538] hover:bg-[#6B0F2B]"
                >
                  {busy ? 'Saving…' : 'Save prompt'}
                </Button>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-900">{saved.prompt || 'None'}</p>
            )}
            {dirty ? (
              <p className="mt-1 text-xs text-amber-700">Unsaved change.</p>
            ) : hasList ? (
              <p className="mt-1 text-xs text-gray-500">Not used while a word list is set.</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">{matchHint(saved.prompt, saved.set)}</p>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {importing && (
          <PropheticImportDialog
            title={hasList ? 'Edit word list' : 'Import prophetic words'}
            current={hasList ? words : null}
            onClose={() => setImporting(false)}
            onSave={async (list) => {
              if (!accessToken) throw new Error('Signed out. Sign in again.')
              await setSessionPropheticWords({ data: { accessToken, sessionId, list } })
              await onSaved()
            }}
          />
        )}
      </CardContent>
    </Card>
  )
}
