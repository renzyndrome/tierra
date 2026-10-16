// Session Manage page: the optional prophetic prompt (sermon topic). After a QR
// check-in, attendees see one entry from the word list the prompt matches
// (src/content/propheticWords.json). The hint shows which list matched, if any.

import { useState, useEffect } from 'react'
import { setSessionPropheticPrompt } from '../server/functions/attendance'
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
  canWrite,
  onSaved,
}: PropheticPromptCardProps) {
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

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
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
        ) : (
          <p className="mt-1 text-xs text-gray-500">{matchHint(saved.prompt, saved.set)}</p>
        )}
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
