// Write a welcome message: one text shown in full to everyone after QR
// check-in, in place of a random prophetic word (e.g. for a retreat). Used for
// saved sets (title and service through `extra`) and for one session's message.

import { useState, type ReactNode } from 'react'
import { MAX_MESSAGE_LENGTH } from '../lib/propheticSchemas'
import type { PropheticWordList } from '../lib/propheticWord'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'
import { SCROLLING_DIALOG_CLASS } from './formClasses'

/** The stored list for a message: one text, line breaks kept. */
export function messageList(text: string): PropheticWordList {
  return { kind: 'message', reference: '', translation: null, words: [{ text: text.trim(), reference: null }] }
}

interface WelcomeMessageDialogProps {
  title: string
  // The current message text; '' for a new one.
  current: string
  onClose: () => void
  // Saves the list; a thrown Error's message shows in the dialog.
  onSave: (list: PropheticWordList) => Promise<void>
  // Extra fields above the message (e.g. a set's title and service).
  extra?: ReactNode
  // False while the extra fields are incomplete.
  extraValid?: boolean
}

export function WelcomeMessageDialog({
  title,
  current,
  onClose,
  onSave,
  extra,
  extraValid = true,
}: WelcomeMessageDialogProps) {
  const [text, setText] = useState(current)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const length = text.trim().length
  const tooLong = length > MAX_MESSAGE_LENGTH
  const canSave = extraValid && length > 0 && !tooLong

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await onSave(messageList(text))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Message not saved. Retry.')
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
        <div className="space-y-4">
          {extra}
          <div>
            <Label htmlFor="welcome-message">Message</Label>
            <textarea
              id="welcome-message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              placeholder={'e.g. WELCOME, DELEGATES!\n\nThe retreat starts now.'}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none ${
                tooLong ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            <p className={`mt-1 text-xs ${tooLong ? 'text-red-600' : 'text-gray-500'}`}>
              {length} / {MAX_MESSAGE_LENGTH} characters. Shown in full after QR check-in, line breaks kept.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !canSave} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
            {saving ? 'Saving…' : 'Save message'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
