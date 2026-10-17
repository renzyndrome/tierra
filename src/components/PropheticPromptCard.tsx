// Session Manage page: the prophetic word after a QR check-in. A word list
// imported for this service (PDF, spreadsheet or paste) comes first; without
// one, the prompt (sermon topic) picks a built-in list from
// src/content/propheticWords.json. The hints say which applies.

import { useState, useEffect } from 'react'
import { FileUp } from 'lucide-react'
import { setSessionPropheticPrompt, setSessionPropheticWords } from '../server/functions/attendance'
import type { PropheticWordList } from '../lib/propheticWord'
import { PropheticImportDialog } from './PropheticImportDialog'
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
  // Word list imported for this service, if any.
  words: PropheticWordList | null
  canWrite: boolean
  // Called after a save so the page can reload the session.
  onSaved: () => Promise<void>
}

function matchHint(prompt: string, set: PropheticSetSummary): string {
  if (!prompt.trim()) return 'None. No prophetic word after QR check-in.'
  if (!set) return 'No word list for this prompt. No prophetic word after QR check-in.'
  return `Word list: ${set.topic}, ${set.verse_count} words. One random word per QR check-in.`
}

export function PropheticPromptCard({
  accessToken,
  sessionId,
  prompt,
  matchedSet,
  words,
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

  // Follow a reload of the session (e.g. another admin saved a prompt).
  // Primitive deps: a reload with the same prompt keeps unsaved typing.
  const topic = matchedSet?.topic ?? null
  const verseCount = matchedSet?.verse_count ?? 0
  useEffect(() => {
    setValue(prompt ?? '')
    setSaved({ prompt: prompt ?? '', set: topic ? { topic, verse_count: verseCount } : null })
  }, [prompt, topic, verseCount])

  const dirty = value.trim() !== saved.prompt.trim()

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

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="mb-4 border-b border-gray-100 pb-4">
          <p className="text-sm font-medium text-gray-900">Word list</p>
          {hasList && words ? (
            <p className="mt-1 text-xs text-gray-500">
              Imported: {words.reference ? `${words.reference}, ` : ''}
              {words.words.length} words. One random word per QR check-in.
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">None imported. PDF, Excel, CSV or text, or paste.</p>
          )}
          {canWrite && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={hasList ? 'outline' : 'default'}
                onClick={() => setImporting(true)}
                className={hasList ? 'h-11 sm:h-9' : 'h-11 sm:h-9 bg-[#8B1538] hover:bg-[#6B0F2B]'}
              >
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
            </div>
          )}
        </div>
        <Label htmlFor="session-prophetic">Prophetic prompt</Label>
        {canWrite ? (
          <div className="mt-1 flex flex-col sm:flex-row gap-2">
            <Input
              id="session-prophetic"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. The Love of an Extravagant Father"
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
          <p className="mt-1 text-xs text-gray-500">Not used while an imported word list is set.</p>
        ) : (
          <p className="mt-1 text-xs text-gray-500">{matchHint(saved.prompt, saved.set)}</p>
        )}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        {importing && (
          <PropheticImportDialog
            accessToken={accessToken}
            sessionId={sessionId}
            current={hasList ? words : null}
            onClose={() => setImporting(false)}
            onSaved={onSaved}
          />
        )}
      </CardContent>
    </Card>
  )
}
