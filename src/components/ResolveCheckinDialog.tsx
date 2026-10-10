// Link one service check-in to the right directory member: suggested matches
// (review queue) plus a free-text directory search. Used for unmatched QR
// check-ins ("JC Eugenio" -> "Justin Eugenio") and to correct an existing link,
// including a walk-in registered as new although a record already existed.

import { useState, useEffect } from 'react'
import { confirmMatch, searchMembersForCheckin } from '../server/functions/attendance'
import { JEV_LIKELY_PROBABILITY } from '../lib/constants'
import { useMemberSuggestions } from '../lib/useMemberSuggestions'
import type { AttendanceRecordWithMember, CheckinMemberOption, MatchCandidate } from '../lib/types'
import { MemberSuggestionTags } from './MemberSuggestionTags'
import { SCROLLING_DIALOG_CLASS } from './formClasses'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'

interface ResolveCheckinDialogProps {
  accessToken: string | undefined
  record: AttendanceRecordWithMember
  // Ranked suggestions for a pending check-in (from the review queue).
  candidates?: readonly MatchCandidate[]
  // Members already counted in this session.
  checkedInIds: ReadonlySet<string>
  // Staff may edit member records (members.write): offers saving the email.
  canEditMembers: boolean
  onClose: () => void
  // Called after a link, with a notice for the staff.
  onResolved: (notice: string) => void
  // Offered for unlinked check-ins: switch to creating a new member.
  onCreateNew?: () => void
}

interface MemberRowProps {
  name: string
  detail: string
  tags: string[]
  // Why a searched member is suggested (search suggestions only).
  extra?: React.ReactNode
  hint: string | null
  isCurrent: boolean
  busy: boolean
  onLink: () => void
}

function MemberRow({ name, detail, tags, extra, hint, isCurrent, busy, onLink }: MemberRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
      <div className="min-w-0">
        <p className="font-medium text-gray-900">
          {name}
          {tags.map((t) => (
            <span
              key={t}
              className="ml-2 px-1.5 py-0.5 rounded bg-[#8B1538]/10 text-[#8B1538] text-[10px] font-semibold uppercase tracking-wide"
            >
              {t}
            </span>
          ))}
        </p>
        {extra && <div className="-ml-1">{extra}</div>}
        {detail && <p className="text-xs text-gray-400">{detail}</p>}
        {hint && <p className="text-xs text-amber-700">{hint}</p>}
      </div>
      <Button
        size="sm"
        variant={isCurrent ? 'outline' : 'default'}
        disabled={busy || isCurrent}
        onClick={onLink}
        className={isCurrent ? '' : 'bg-[#8B1538] hover:bg-[#6B0F2B]'}
      >
        {isCurrent ? 'Current' : 'Link'}
      </Button>
    </div>
  )
}

export function ResolveCheckinDialog({
  accessToken,
  record,
  candidates = [],
  checkedInIds,
  canEditMembers,
  onClose,
  onResolved,
  onCreateNew,
}: ResolveCheckinDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CheckinMemberOption[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [archiveDuplicate, setArchiveDuplicate] = useState(true)
  const [saveEmail, setSaveEmail] = useState(true)
  const { suggestions } = useMemberSuggestions(accessToken, query)
  // Suggested matches from the queue are already listed above the search.
  const listedIds = new Set(candidates.map((c) => c.id))
  const searchSuggestions = suggestions.filter((m) => !listedIds.has(m.id))

  const currentMemberId = record.member?.id ?? null
  const offerArchive = record.match_status === 'new_member' && Boolean(record.member_id)
  const offerSaveEmail = canEditMembers && Boolean(record.raw_email)
  const typedName = record.raw_name ?? record.member?.name ?? 'Unnamed'

  useEffect(() => {
    if (!accessToken) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let active = true
    setSearching(true)
    setSearchError('')
    const t = setTimeout(async () => {
      try {
        const res = await searchMembersForCheckin({ data: { accessToken, query: q } })
        if (active) setResults(res)
      } catch (err) {
        if (active) {
          setResults([])
          setSearchError(err instanceof Error ? err.message : 'Member search failed')
        }
      } finally {
        if (active) setSearching(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query, accessToken])

  const link = async (memberId: string, memberName: string) => {
    if (!accessToken) return
    setBusy(true)
    setError('')
    try {
      const res = await confirmMatch({
        data: {
          accessToken,
          recordId: record.id,
          memberId,
          archiveDuplicate: offerArchive ? archiveDuplicate : undefined,
          saveEmail: offerSaveEmail ? saveEmail : undefined,
        },
      })
      const parts = [
        res.alreadyCheckedIn
          ? `${memberName} already checked in. This check-in marked ignored.`
          : `Linked to ${memberName} ✓`,
      ]
      if (res.duplicateVisitorArchived) parts.push('Duplicate record archived.')
      else if (offerArchive && archiveDuplicate) parts.push('Duplicate record kept: other history found.')
      if (res.emailSaved) parts.push('Email saved to member.')
      onResolved(parts.join(' '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link failed. Retry.')
    } finally {
      setBusy(false)
    }
  }

  const alreadyHint = (id: string) =>
    checkedInIds.has(id) && id !== currentMemberId ? 'Already checked in to this session' : null

  const candidateTags = (c: MatchCandidate): string[] => {
    const tags: string[] = []
    if (c.email_match) tags.push('Email match')
    if ((c.jev_probability ?? 0) >= JEV_LIKELY_PROBABILITY) tags.push('Likely match')
    return tags
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className={SCROLLING_DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>Link check-in</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-gray-200 px-3 py-2">
          <p className="font-semibold text-gray-900">{typedName}</p>
          {(record.raw_phone || record.raw_email) && (
            <p className="text-xs text-gray-400">{[record.raw_phone, record.raw_email].filter(Boolean).join(' · ')}</p>
          )}
          {record.member && <p className="text-xs text-gray-500 mt-0.5">Linked: {record.member.name}</p>}
        </div>

        {candidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Suggested matches</p>
            {candidates.map((c) => (
              <MemberRow
                key={c.id}
                name={c.name}
                detail={[`${Math.round(c.sim * 100)}% name match`, c.satellite_name, c.phone].filter(Boolean).join(' · ')}
                tags={candidateTags(c)}
                hint={alreadyHint(c.id)}
                isCurrent={c.id === currentMemberId}
                busy={busy}
                onLink={() => link(c.id, c.name)}
              />
            ))}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Search directory</p>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name…"
            autoFocus={candidates.length === 0}
            className="h-11 sm:h-9"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {searchError && <p className="text-sm text-red-600">{searchError}</p>}
          {searching && <p className="text-sm text-gray-400">Searching…</p>}
          {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-gray-400">
              {searchSuggestions.length > 0 ? 'No exact name match.' : 'No members found.'}
            </p>
          )}
          {results.map((m) => (
            <MemberRow
              key={m.id}
              name={m.name}
              detail={[m.satellite_name, m.phone].filter(Boolean).join(' · ')}
              tags={[]}
              hint={alreadyHint(m.id)}
              isCurrent={m.id === currentMemberId}
              busy={busy}
              onLink={() => link(m.id, m.name)}
            />
          ))}
          {searchSuggestions.length > 0 && (
            <p className="pt-1 text-xs text-gray-500 uppercase tracking-wide">Suggested members</p>
          )}
          {searchSuggestions.map((m) => (
            <MemberRow
              key={m.id}
              name={m.name}
              detail={[m.satellite_name, m.phone].filter(Boolean).join(' · ')}
              tags={[]}
              extra={<MemberSuggestionTags suggestion={m} />}
              hint={alreadyHint(m.id)}
              isCurrent={m.id === currentMemberId}
              busy={busy}
              onLink={() => link(m.id, m.name)}
            />
          ))}
        </div>

        {(offerArchive || offerSaveEmail) && (
          <div className="space-y-2 border-t border-gray-100 pt-3">
            {offerArchive && (
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={archiveDuplicate}
                  onChange={(e) => setArchiveDuplicate(e.target.checked)}
                />
                <span>
                  Archive duplicate record
                  <span className="block text-xs text-gray-400">
                    The visitor record from this registration. Kept when it has other history.
                  </span>
                </span>
              </label>
            )}
            {offerSaveEmail && (
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={saveEmail}
                  onChange={(e) => setSaveEmail(e.target.checked)}
                />
                <span>
                  Save email to member
                  <span className="block text-xs text-gray-400">Only when the member has no email.</span>
                </span>
              </label>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {onCreateNew && (
            <Button variant="outline" onClick={onCreateNew} disabled={busy}>
              New member
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
