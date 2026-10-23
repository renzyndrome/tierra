// Import a prophetic word list: choose a PDF, Word, Excel, CSV or text file, or
// paste the text. The file is read in the browser and parsed
// (src/lib/propheticImport.ts); staff review and edit every word before saving.
// Used for one session's list and for saved word sets (which add their own
// fields, e.g. title and service, through `extra`).

import { useRef, useState, type ReactNode } from 'react'
import { FileUp, Plus, X } from 'lucide-react'
import { ACCEPTED_FILES, readPropheticFile } from '../lib/propheticFileReader'
import { MAX_WORDS, MAX_WORD_LENGTH, parsePropheticText, type ParsedWordList } from '../lib/propheticImport'
import type { PropheticListWord, PropheticWordList } from '../lib/propheticWord'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { SCROLLING_DIALOG_CLASS } from './formClasses'

// Blank import templates (public/templates): one fixed layout staff can fill in.
export const PROPHETIC_TEMPLATES = [
  { label: 'Excel', href: '/templates/prophetic-words-template.xlsx' },
  { label: 'Word', href: '/templates/prophetic-words-template.docx' },
]

interface PropheticImportDialogProps {
  title: string
  // The current list, edited in place when given.
  current: PropheticWordList | null
  onClose: () => void
  // Saves the reviewed list; a thrown Error's message shows in the dialog.
  onSave: (list: PropheticWordList) => Promise<void>
  // Extra fields above the list (e.g. a set's title and service).
  extra?: ReactNode
  // False while the extra fields are incomplete.
  extraValid?: boolean
  // Called after a file or paste is read (e.g. to suggest a title).
  onRead?: (parsed: ParsedWordList, fileName: string | null) => void
}

export function PropheticImportDialog({
  title,
  current,
  onClose,
  onSave,
  extra,
  extraValid = true,
  onRead,
}: PropheticImportDialogProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'source' | 'preview'>(current ? 'preview' : 'source')
  const [file, setFile] = useState<File | null>(null)
  const [pasted, setPasted] = useState('')
  const [reading, setReading] = useState(false)
  const [reference, setReference] = useState(current?.reference ?? '')
  const [translation, setTranslation] = useState<string | null>(current?.translation ?? null)
  const [words, setWords] = useState<PropheticListWord[]>(current?.words ?? [])
  const [warnings, setWarnings] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const read = async () => {
    setReading(true)
    setError('')
    try {
      const parsed = file ? await readPropheticFile(file) : parsePropheticText(pasted)
      setReference(parsed.reference)
      setTranslation(parsed.translation ?? null)
      setWords(parsed.words)
      setWarnings(parsed.warnings)
      onRead?.(parsed, file?.name ?? null)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'File not read. Paste the text instead.')
    } finally {
      setReading(false)
    }
  }

  // Verses that carry their own reference ("Psalm 73:26 - ...") get a
  // reference box each; the list reference is then optional.
  const perWord = words.some((w) => w.reference)
  const cleanWords = words
    .map((w) => ({ text: w.text.trim(), reference: w.reference?.trim() || null }))
    .filter((w) => w.text)
  const tooLong = cleanWords.some((w) => w.text.length > MAX_WORD_LENGTH)
  const canSave = extraValid && cleanWords.length > 0 && cleanWords.length <= MAX_WORDS && !tooLong
  const editWord = (index: number, change: Partial<PropheticListWord>) =>
    setWords((prev) => prev.map((w, j) => (j === index ? { ...w, ...change } : w)))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await onSave({ reference: reference.trim(), translation, words: cleanWords })
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
          <DialogTitle>{title}</DialogTitle>
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
                <span className="text-sm text-gray-500">{file ? file.name : 'PDF, Word, Excel, CSV or text'}</span>
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
                placeholder={'LUKE 10:38-42\n1. First word…\n2. Second word…\n\nor one verse per line:\nPsalm 46:1 - God is our refuge…'}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="mt-1 text-xs text-gray-500">Numbered lines, bullets, one word per line, or one verse per line.</p>
            </div>
            <p className="text-xs text-gray-500">
              Blank template:{' '}
              {PROPHETIC_TEMPLATES.map((t, i) => (
                <span key={t.href}>
                  {i > 0 && ' · '}
                  <a href={t.href} download className="font-medium text-[#8B1538] underline">
                    {t.label}
                  </a>
                </span>
              ))}
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {extra}
            <div>
              <Label htmlFor="prophetic-reference">
                Passage reference <span className="font-normal text-gray-400">(optional)</span>
              </Label>
              <Input
                id="prophetic-reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. Luke 10:38-42"
                maxLength={80}
                className="mt-1 h-11 sm:h-9"
              />
              {perWord && <p className="mt-1 text-xs text-gray-500">Each verse has its own reference.</p>}
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
                    <div className="flex-1 space-y-1">
                      {perWord && (
                        <Input
                          value={w.reference ?? ''}
                          aria-label={`Reference ${i + 1}`}
                          onChange={(e) => editWord(i, { reference: e.target.value })}
                          placeholder={reference.trim() || 'Reference'}
                          maxLength={80}
                          className="h-11 sm:h-9 font-medium"
                        />
                      )}
                      <textarea
                        value={w.text}
                        aria-label={`Word ${i + 1}`}
                        onChange={(e) => editWord(i, { text: e.target.value })}
                        rows={2}
                        className={`w-full rounded-md border px-3 py-2 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none ${
                          w.text.trim().length > MAX_WORD_LENGTH ? 'border-red-400' : 'border-gray-300'
                        }`}
                      />
                    </div>
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
                onClick={() => setWords((prev) => [...prev, { text: '', reference: perWord ? '' : null }])}
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
