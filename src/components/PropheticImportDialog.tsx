// Import a prophetic word list for one service: choose a PDF, Excel, CSV or
// text file, or paste the text. The file is read in the browser and parsed
// (src/lib/propheticImport.ts); staff review and edit every word before saving.

import { useRef, useState } from 'react'
import { FileUp, Plus, X } from 'lucide-react'
import { setSessionPropheticWords } from '../server/functions/attendance'
import { ACCEPTED_FILES, readPropheticFile } from '../lib/propheticFileReader'
import { MAX_WORDS, MAX_WORD_LENGTH, parsePropheticText } from '../lib/propheticImport'
import type { PropheticWordList } from '../lib/propheticWord'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { SCROLLING_DIALOG_CLASS } from './formClasses'

interface PropheticImportDialogProps {
  accessToken: string | undefined
  sessionId: string
  // The service's current list, edited in place when given.
  current: PropheticWordList | null
  onClose: () => void
  onSaved: () => Promise<void>
}

export function PropheticImportDialog({ accessToken, sessionId, current, onClose, onSaved }: PropheticImportDialogProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'source' | 'preview'>(current ? 'preview' : 'source')
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [reading, setReading] = useState(false)
  const [reference, setReference] = useState(current?.reference ?? '')
  const [words, setWords] = useState<string[]>(current?.words ?? [])
  const [warnings, setWarnings] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const read = async () => {
    setReading(true)
    setError('')
    try {
      const parsed = file ? await readPropheticFile(file) : parsePropheticText(pasted)
      setReference(parsed.reference)
      setWords(parsed.words)
      setWarnings(parsed.warnings)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File not read. Paste the text instead.')
    } finally {
      setReading(false)
    }
  }

  const cleanWords = words.map((w) => w.trim()).filter(Boolean)
  const tooLong = cleanWords.some((w) => w.length > MAX_WORD_LENGTH)
  const canSave = reference.trim().length > 0 && cleanWords.length > 0 && cleanWords.length <= MAX_WORDS && !tooLong

  const save = async () => {
    if (!accessToken || !canSave) return
    setSaving(true)
    setError('')
    try {
      await setSessionPropheticWords({
        data: { accessToken, sessionId, list: { reference: reference.trim(), translation: current?.translation ?? null, words: cleanWords } },
      })
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word list not saved. Retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className={`${SCROLLING_DIALOG_CLASS} sm:max-w-2xl`}>
        <DialogHeader>
          <DialogTitle>{current ? 'Edit word list' : 'Import prophetic words'}</DialogTitle>
        </DialogHeader>

        {step === 'source' ? (
          <div className="space-y-4">
            <div>
              <Label>File</Label>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPTED_FILES}
                className="sr-only"
                data-testid="prophetic-file"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setError('')
                }}
              />
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => fileInput.current?.click()}>
                  <FileUp className="h-4 w-4" aria-hidden /> Choose file
                </Button>
                <span className="text-sm text-gray-500">{file ? file.name : 'PDF, Excel, CSV or text'}</span>
                {file && (
                  <button
                    type="button"
                    className="text-sm text-gray-500 underline"
                    onClick={() => {
                      setFile(null)
                      if (fileInput.current) fileInput.current.value = ''
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="prophetic-paste">Or paste the words</Label>
              <textarea
                id="prophetic-paste"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                disabled={file !== null}
                rows={8}
                placeholder={'LUKE 10:38-42\n1. First word…\n2. Second word…'}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="mt-1 text-xs text-gray-500">Numbered lines, bullets, or one word per line.</p>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="prophetic-reference">Passage reference</Label>
              <Input
                id="prophetic-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Luke 10:38-42"
                maxLength={80}
                className="mt-1 h-11 sm:h-9"
              />
            </div>
            {warnings.length > 0 && (
              <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {cleanWords.length} {cleanWords.length === 1 ? 'word' : 'words'}
              </p>
              <ol className="mt-2 space-y-2">
                {words.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-6 pt-2 text-right text-xs text-gray-400">{i + 1}</span>
                    <textarea
                      value={w}
                      aria-label={`Word ${i + 1}`}
                      onChange={(e) => setWords((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                      rows={2}
                      className={`flex-1 rounded-md border px-3 py-2 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none ${
                        w.trim().length > MAX_WORD_LENGTH ? 'border-red-400' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      aria-label={`Remove word ${i + 1}`}
                      onClick={() => setWords((prev) => prev.filter((_, j) => j !== i))}
                      className="mt-1 flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={words.length >= MAX_WORDS}
                onClick={() => setWords((prev) => [...prev, ''])}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add word
              </Button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {step === 'source' ? (
            <>
              <Button variant="outline" onClick={onClose} disabled={reading}>Cancel</Button>
              <Button
                onClick={read}
                disabled={reading || (!file && !pasted.trim())}
                className="bg-[#8B1538] hover:bg-[#6B0F2B]"
              >
                {reading ? 'Reading…' : 'Read words'}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => (current ? onClose() : setStep('source'))}
                disabled={saving}
              >
                {current ? 'Cancel' : 'Back'}
              </Button>
              <Button onClick={save} disabled={saving || !canSave} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                {saving ? 'Saving…' : 'Save list'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
