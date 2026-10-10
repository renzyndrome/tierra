// Admin — Service Attendance: single session detail.
// Tabs: live check-ins (link or correct each one), manual check-in (member
// search), and the match queue (resolve pending guest check-ins: link /
// create member / ignore).

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { RegisterWalkInDialog } from '../../../components/RegisterWalkInDialog'
import { ResolveCheckinDialog } from '../../../components/ResolveCheckinDialog'
import { CreateMemberFromCheckinDialog } from '../../../components/CreateMemberFromCheckinDialog'
import { MemberSuggestionTags } from '../../../components/MemberSuggestionTags'
import { useMemberSuggestions } from '../../../lib/useMemberSuggestions'
import {
  getSessionDetail,
  getSessionCheckins,
  getPendingMatches,
  searchMembersForCheckin,
  manualCheckIn,
  confirmMatch,
  ignoreCheckin,
  deleteCheckin,
  setSessionOpen,
  deleteSession,
} from '../../../server/functions/attendance'
import { hasPermission } from '../../../lib/auth'
import {
  CHECKIN_METHOD_LABELS,
  MATCH_STATUS_LABELS,
  JEV_LIKELY_PROBABILITY,
  SUGGEST_BELOW_SEARCH_HITS,
} from '../../../lib/constants'
import type {
  ServiceSessionWithRelations,
  AttendanceRecordWithMember,
  PendingMatch,
  CheckinMemberOption,
  MatchCandidate,
  MemberSuggestion,
} from '../../../lib/types'
import { Card, CardContent } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../components/ui/dialog'

export const Route = createFileRoute('/admin/attendance/$sessionId')({
  component: () => (
    <AdminRoute requiredPermissions={['registration.read']}>
      <SessionDetail />
    </AdminRoute>
  ),
})

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    auto_matched: 'bg-green-100 text-green-700',
    confirmed: 'bg-green-100 text-green-700',
    new_member: 'bg-blue-100 text-blue-700',
    pending: 'bg-amber-100 text-amber-700',
    ignored: 'bg-gray-200 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {MATCH_STATUS_LABELS[status] ?? status}
    </span>
  )
}

function SessionDetail() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const accessToken = session?.access_token
  const canWrite = profile ? hasPermission(profile.role, 'registration.write') : false
  const canEditMembers = profile ? hasPermission(profile.role, 'members.write') : false

  const [info, setInfo] = useState<ServiceSessionWithRelations | null>(null)
  const [checkins, setCheckins] = useState<AttendanceRecordWithMember[]>([])
  const [pending, setPending] = useState<PendingMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('checkins')
  const [copied, setCopied] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [toggleBusy, setToggleBusy] = useState(false)

  const loadAll = useCallback(async () => {
    if (!accessToken) return
    try {
      const [d, c, p] = await Promise.all([
        getSessionDetail({ data: { accessToken, sessionId } }),
        getSessionCheckins({ data: { accessToken, sessionId } }),
        canWrite ? getPendingMatches({ data: { accessToken, sessionId } }) : Promise.resolve([]),
      ])
      setInfo(d)
      setCheckins(c)
      setPending(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session')
    } finally {
      setLoading(false)
    }
  }, [accessToken, sessionId, canWrite])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Live refresh of the check-ins list while viewing that tab.
  useEffect(() => {
    if (tab !== 'checkins' || !accessToken) return
    const interval = setInterval(async () => {
      try {
        const c = await getSessionCheckins({ data: { accessToken, sessionId } })
        setCheckins(c)
      } catch {
        /* ignore transient poll errors */
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [tab, accessToken, sessionId])

  const countable = checkins.filter((c) => c.match_status !== 'ignored')
  const checkedInIds = new Set(countable.flatMap((c) => (c.member_id ? [c.member_id] : [])))
  const candidatesByRecord = new Map(pending.map((p) => [p.record.id, p.candidates]))

  const toggleOpen = async () => {
    if (!accessToken || !info) return
    setToggleBusy(true)
    setError('')
    try {
      await setSessionOpen({ data: { accessToken, sessionId, isOpen: !info.is_open } })
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session')
    } finally {
      setToggleBusy(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>
  }
  if (!info) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-600">Session not found.</p>
        <Link to="/admin/attendance"><Button variant="outline">Back to sessions</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/admin/attendance" className="hover:text-[#8B1538]">Attendance</Link>
          <span>/</span>
          <span>{info.service_type?.name}</span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {info.service_type?.name}
              {info.is_overdue ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Overdue</span>
              ) : info.is_open ? (
                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Open</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">Closed</span>
              )}
            </h1>
            <p className="text-gray-500 mt-1">
              {formatDate(info.session_date)}
              {info.satellite?.name ? ` · ${info.satellite.name}` : ''}
              {info.title ? ` · ${info.title}` : ''}
            </p>
          </div>
          <div className="text-center px-4">
            <p className="text-3xl font-bold text-[#8B1538] leading-none">{countable.length}</p>
            <p className="text-xs text-gray-400">checked in</p>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        {info.is_overdue && (
          <div className="mb-4 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
            Service date passed. QR check-in stopped, manual check-in only.
          </div>
        )}

        <div className="mb-4 flex gap-2 flex-wrap items-center">
          {/* Opens the projectable QR in a separate window so you can show it on a
              screen while you keep managing check-ins here. The URL is public
              (keyed by the QR token) — share it with a tech booth that isn't
              logged in via "Copy shareable link". */}
          <Button
            size="sm"
            className="bg-[#8B1538] hover:bg-[#6B0F2B]"
            onClick={() =>
              window.open(
                `/display/${info.qr_token}`,
                '_blank',
                'popup,noopener,noreferrer,width=1024,height=1200',
              )
            }
          >
            Show QR (new window)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const url = `${window.location.origin}/display/${info.qr_token}`
              try {
                await navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              } catch {
                window.prompt('Copy this shareable QR display link:', url)
              }
            }}
          >
            {copied ? 'Link copied ✓' : 'Copy shareable link'}
          </Button>
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              disabled={toggleBusy}
              onClick={toggleOpen}
            >
              {info.is_open ? 'Close session' : 'Reopen session'}
            </Button>
          )}
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => setShowDelete(true)}
            >
              Delete session
            </Button>
          )}
        </div>

        {/* Delete confirmation */}
        <Dialog open={showDelete} onOpenChange={setShowDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this session?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              This permanently removes the session and all {countable.length} of its
              check-ins. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteBusy}
                onClick={async () => {
                  if (!accessToken) return
                  setDeleteBusy(true)
                  try {
                    await deleteSession({ data: { accessToken, sessionId } })
                    navigate({ to: '/admin/attendance' })
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to delete session')
                    setShowDelete(false)
                  } finally {
                    setDeleteBusy(false)
                  }
                }}
              >
                {deleteBusy ? 'Deleting…' : 'Yes, delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="checkins">Check-ins ({countable.length})</TabsTrigger>
            {canWrite && info.is_open && <TabsTrigger value="manual">Manual check-in</TabsTrigger>}
            {canWrite && (
              <TabsTrigger value="queue">
                Review queue{pending.length > 0 ? ` (${pending.length})` : ''}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="checkins">
            <CheckinsTab
              checkins={checkins}
              canWrite={canWrite}
              accessToken={accessToken}
              sessionSatelliteId={info.satellite_id}
              candidatesByRecord={candidatesByRecord}
              checkedInIds={checkedInIds}
              canEditMembers={canEditMembers}
              onResolved={loadAll}
              onDelete={async (recordId) => {
                if (!accessToken) return
                setError('')
                try {
                  await deleteCheckin({ data: { accessToken, recordId } })
                  await loadAll()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to remove check-in')
                }
              }}
            />
          </TabsContent>

          {canWrite && info.is_open && (
            <TabsContent value="manual">
              <ManualCheckinTab
                accessToken={accessToken}
                sessionId={sessionId}
                sessionSatelliteId={info.satellite_id}
                checkedInIds={checkedInIds}
                onCheckedIn={loadAll}
              />
            </TabsContent>
          )}

          {canWrite && (
            <TabsContent value="queue">
              <QueueTab
                pending={pending}
                accessToken={accessToken}
                sessionSatelliteId={info.satellite_id}
                checkedInIds={checkedInIds}
                canEditMembers={canEditMembers}
                onResolved={loadAll}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Check-ins tab
// ----------------------------------------------------------------------------
function CheckinsTab({
  checkins,
  canWrite,
  accessToken,
  sessionSatelliteId,
  candidatesByRecord,
  checkedInIds,
  canEditMembers,
  onResolved,
  onDelete,
}: {
  checkins: AttendanceRecordWithMember[]
  canWrite: boolean
  accessToken: string | undefined
  sessionSatelliteId: string | null
  // Review-queue suggestions for pending check-ins, by record id.
  candidatesByRecord: ReadonlyMap<string, MatchCandidate[]>
  checkedInIds: ReadonlySet<string>
  canEditMembers: boolean
  onResolved: () => Promise<void>
  onDelete: (recordId: string) => Promise<void>
}) {
  const [resolveFor, setResolveFor] = useState<AttendanceRecordWithMember | null>(null)
  const [createFor, setCreateFor] = useState<AttendanceRecordWithMember | null>(null)
  const [notice, setNotice] = useState('')

  const finish = async (message: string) => {
    setResolveFor(null)
    setCreateFor(null)
    setNotice(message)
    await onResolved()
  }

  if (checkins.length === 0) {
    return <p className="py-12 text-center text-gray-500">No check-ins yet.</p>
  }
  return (
    <div className="mt-4 grid gap-2">
      {notice && <p className="text-sm text-[#8B1538]">{notice}</p>}
      {checkins.map((c) => {
        // A check-in is "linked" when it counts toward a known member.
        const linked = Boolean(c.member) && c.match_status !== 'pending' && c.match_status !== 'ignored'
        return (
          <Card key={c.id}>
            <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {c.member?.name ?? c.raw_name ?? 'Unknown'}
                  {!c.member && c.raw_name && <span className="text-gray-400 font-normal"> (unmatched)</span>}
                </p>
                {c.member && c.raw_name && c.raw_name !== c.member.name && (
                  <p className="text-xs text-gray-400 truncate">Typed: {c.raw_name}</p>
                )}
                <p className="text-xs text-gray-400">
                  {formatTime(c.checked_in_at)} · {CHECKIN_METHOD_LABELS[c.checkin_method] ?? c.checkin_method}
                </p>
                {c.invited_by && <p className="text-xs text-gray-400">Invited by {c.invited_by}</p>}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusBadge status={c.match_status} />
                {canWrite && (
                  <Button
                    variant={linked ? 'ghost' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setNotice('')
                      setResolveFor(c)
                    }}
                  >
                    {linked ? 'Change' : 'Link member'}
                  </Button>
                )}
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => onDelete(c.id)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {resolveFor && (
        <ResolveCheckinDialog
          accessToken={accessToken}
          record={resolveFor}
          candidates={candidatesByRecord.get(resolveFor.id)}
          checkedInIds={checkedInIds}
          canEditMembers={canEditMembers}
          onClose={() => setResolveFor(null)}
          onResolved={finish}
          onCreateNew={
            resolveFor.member_id
              ? undefined
              : () => {
                  setCreateFor(resolveFor)
                  setResolveFor(null)
                }
          }
        />
      )}
      {createFor && (
        <CreateMemberFromCheckinDialog
          accessToken={accessToken}
          record={createFor}
          defaultSatelliteId={sessionSatelliteId}
          onClose={() => setCreateFor(null)}
          onDone={finish}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Manual check-in tab
// ----------------------------------------------------------------------------
function MemberCheckinRow({
  member,
  suggestion,
  already,
  busy,
  onCheckIn,
}: {
  member: CheckinMemberOption
  // Present for a suggested member: shows why it is suggested.
  suggestion?: MemberSuggestion
  already: boolean
  busy: boolean
  onCheckIn: () => void
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{member.name}</p>
          {suggestion && (
            <div className="-ml-1">
              <MemberSuggestionTags suggestion={suggestion} />
            </div>
          )}
          {(member.satellite_name || member.phone) && (
            <p className="text-xs text-gray-400">
              {[member.satellite_name, member.phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {already ? (
          <Button size="sm" variant="outline" disabled>
            Checked in
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={onCheckIn} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
            {busy ? '…' : 'Check in'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function ManualCheckinTab({
  accessToken,
  sessionId,
  sessionSatelliteId,
  checkedInIds,
  onCheckedIn,
}: {
  accessToken: string | undefined
  sessionId: string
  sessionSatelliteId: string | null
  // Members already counted in this session (disables their button).
  checkedInIds: ReadonlySet<string>
  onCheckedIn: () => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [results, setResults] = useState<CheckinMemberOption[]>([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const { suggestions, suggesting } = useMemberSuggestions(accessToken, query)

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

  const checkIn = async (member: CheckinMemberOption) => {
    if (!accessToken) return
    setBusyId(member.id)
    setNotice('')
    try {
      const res = await manualCheckIn({ data: { accessToken, sessionId, memberId: member.id } })
      setNotice(
        res.status === 'already_checked_in'
          ? `${member.name} is already checked in.`
          : `${member.name} checked in ✓`,
      )
      await onCheckedIn()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Failed to check in')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search members by name…"
        autoFocus
        className="h-11 sm:h-9"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {notice && <p className="mt-2 text-sm text-[#8B1538]">{notice}</p>}
      {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}
      <div className="mt-3 grid gap-2">
        {searching && <p className="text-sm text-gray-400">Searching…</p>}
        {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-gray-400">
            {suggestions.length > 0 ? 'No exact name match.' : 'No members found.'}
          </p>
        )}
        {results.map((m) => (
          <MemberCheckinRow
            key={m.id}
            member={m}
            already={checkedInIds.has(m.id)}
            busy={busyId === m.id}
            onCheckIn={() => checkIn(m)}
          />
        ))}
      </div>
      {suggestions.length > 0 && (
        <div className="mt-4 grid gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Suggested members</p>
          {suggestions.map((m) => (
            <MemberCheckinRow
              key={m.id}
              member={m}
              suggestion={m}
              already={checkedInIds.has(m.id)}
              busy={busyId === m.id}
              onCheckIn={() => checkIn(m)}
            />
          ))}
        </div>
      )}
      {suggesting && !searching && query.trim().length >= 2 && results.length < SUGGEST_BELOW_SEARCH_HITS && (
        <p className="mt-2 text-xs text-gray-400">Looking for similar names…</p>
      )}
      {!searching && query.trim().length >= 2 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-3 py-2">
          <p className="text-sm text-gray-500">Not listed.</p>
          <Button size="sm" variant="outline" onClick={() => setShowRegister(true)}>
            Register new member
          </Button>
        </div>
      )}
      {showRegister && (
        <RegisterWalkInDialog
          accessToken={accessToken}
          sessionId={sessionId}
          initialName={query.trim()}
          sessionSatelliteId={sessionSatelliteId}
          onClose={() => setShowRegister(false)}
          onDone={async (message) => {
            setShowRegister(false)
            setNotice(message)
            setQuery('')
            await onCheckedIn()
          }}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Match queue tab
// ----------------------------------------------------------------------------
function QueueTab({
  pending,
  accessToken,
  sessionSatelliteId,
  checkedInIds,
  canEditMembers,
  onResolved,
}: {
  pending: PendingMatch[]
  accessToken: string | undefined
  sessionSatelliteId: string | null
  checkedInIds: ReadonlySet<string>
  canEditMembers: boolean
  onResolved: () => Promise<void>
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [resolveFor, setResolveFor] = useState<PendingMatch | null>(null)
  const [createFor, setCreateFor] = useState<AttendanceRecordWithMember | null>(null)
  const [queueError, setQueueError] = useState('')
  const [notice, setNotice] = useState('')

  const finish = async (message: string) => {
    setResolveFor(null)
    setCreateFor(null)
    setNotice(message)
    await onResolved()
  }

  const confirm = async (recordId: string, candidate: MatchCandidate) => {
    if (!accessToken) return
    setBusyId(recordId)
    setQueueError('')
    setNotice('')
    try {
      const res = await confirmMatch({ data: { accessToken, recordId, memberId: candidate.id } })
      setNotice(
        res.alreadyCheckedIn
          ? `${candidate.name} already checked in. This check-in marked ignored.`
          : `Linked to ${candidate.name} ✓`,
      )
      await onResolved()
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to confirm match')
    } finally {
      setBusyId(null)
    }
  }

  const ignore = async (recordId: string) => {
    if (!accessToken) return
    setBusyId(recordId)
    setQueueError('')
    setNotice('')
    try {
      await ignoreCheckin({ data: { accessToken, recordId, note: null } })
      await onResolved()
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : 'Failed to update check-in')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      {notice && <p className="text-sm text-[#8B1538]">{notice}</p>}
      {queueError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{queueError}</div>}
      {pending.length === 0 && (
        <p className="py-12 text-center text-gray-500">Nothing to review. All check-ins are matched. 🎉</p>
      )}
      {pending.map(({ record, candidates }) => (
        <Card key={record.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{record.raw_name ?? 'Unnamed'}</p>
                {(record.raw_phone || record.raw_email) && (
                  <p className="text-xs text-gray-400">
                    {[record.raw_phone, record.raw_email].filter(Boolean).join(' · ')}
                  </p>
                )}
                {record.invited_by && <p className="text-xs text-gray-400">Invited by {record.invited_by}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{formatTime(record.checked_in_at)}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Needs review</span>
            </div>

            {candidates.length > 0 ? (
              <div className="space-y-2 mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Suggested matches</p>
                {candidates.map((cand, idx) => {
                  const likely = (cand.jev_probability ?? 0) >= JEV_LIKELY_PROBABILITY
                  return (
                    <div
                      key={cand.id}
                      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                        idx === 0
                          ? 'bg-[#8B1538]/5 ring-1 ring-[#8B1538]/25'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-gray-800">{cand.name}</span>
                        <span className="ml-2 text-xs text-gray-400">{Math.round(cand.sim * 100)}% match</span>
                        {idx === 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-[#8B1538]/10 text-[#8B1538] text-[10px] font-semibold uppercase tracking-wide">
                            Best match
                          </span>
                        )}
                        {cand.email_match && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-semibold uppercase tracking-wide">
                            Email match
                          </span>
                        )}
                        {likely && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold uppercase tracking-wide">
                            Likely match
                          </span>
                        )}
                        {(cand.satellite_name || cand.phone) && (
                          <p className="text-xs text-gray-400">
                            {[cand.satellite_name, cand.phone].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {checkedInIds.has(cand.id) && (
                          <p className="text-xs text-amber-700">Already checked in to this session</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant={idx === 0 ? 'default' : 'outline'}
                        disabled={busyId === record.id}
                        onClick={() => confirm(record.id, cand)}
                        className={idx === 0 ? 'bg-[#8B1538] hover:bg-[#6B0F2B]' : ''}
                      >
                        This is them
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-3">No similar members found.</p>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === record.id}
                onClick={() => {
                  setNotice('')
                  setResolveFor({ record, candidates })
                }}
              >
                Find member
              </Button>
              <Button
                size="sm"
                disabled={busyId === record.id}
                onClick={() => {
                  setNotice('')
                  setCreateFor(record)
                }}
                className="bg-[#8B1538] hover:bg-[#6B0F2B]"
              >
                Create new member
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-500"
                disabled={busyId === record.id}
                onClick={() => ignore(record.id)}
              >
                Ignore
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {resolveFor && (
        <ResolveCheckinDialog
          accessToken={accessToken}
          record={resolveFor.record}
          candidates={resolveFor.candidates}
          checkedInIds={checkedInIds}
          canEditMembers={canEditMembers}
          onClose={() => setResolveFor(null)}
          onResolved={finish}
          onCreateNew={() => {
            setCreateFor(resolveFor.record)
            setResolveFor(null)
          }}
        />
      )}
      {createFor && (
        <CreateMemberFromCheckinDialog
          accessToken={accessToken}
          record={createFor}
          defaultSatelliteId={sessionSatelliteId}
          onClose={() => setCreateFor(null)}
          onDone={finish}
        />
      )}
    </div>
  )
}
