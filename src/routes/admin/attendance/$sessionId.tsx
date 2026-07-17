// Admin — Service Attendance: single session detail.
// Tabs: live check-ins, manual check-in (member search), and the match queue
// (resolve pending guest check-ins: confirm / create member / ignore).

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import {
  getSessionDetail,
  getSessionCheckins,
  getPendingMatches,
  manualCheckIn,
  confirmMatch,
  createMemberFromCheckin,
  ignoreCheckin,
  deleteCheckin,
  setSessionOpen,
} from '../../../server/functions/attendance'
import { searchMembers } from '../../../server/functions/members'
import { getSatellites } from '../../../server/functions/satellites'
import { hasPermission } from '../../../lib/auth'
import {
  CHECKIN_METHOD_LABELS,
  MATCH_STATUS_LABELS,
} from '../../../lib/constants'
import type {
  ServiceSessionWithRelations,
  AttendanceRecordWithMember,
  PendingMatch,
  Member,
  SatelliteRow,
} from '../../../lib/types'
import { Card, CardContent } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
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
  const { profile, session } = useAuth()
  const accessToken = session?.access_token
  const canWrite = profile ? hasPermission(profile.role, 'registration.write') : false

  const [info, setInfo] = useState<ServiceSessionWithRelations | null>(null)
  const [checkins, setCheckins] = useState<AttendanceRecordWithMember[]>([])
  const [pending, setPending] = useState<PendingMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('checkins')

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
              {info.is_open ? (
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

        {canWrite && (
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!accessToken) return
                await setSessionOpen({ data: { accessToken, sessionId, isOpen: !info.is_open } })
                loadAll()
              }}
            >
              {info.is_open ? 'Close session' : 'Reopen session'}
            </Button>
          </div>
        )}

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
              onDelete={async (recordId) => {
                if (!accessToken) return
                await deleteCheckin({ data: { accessToken, recordId } })
                loadAll()
              }}
            />
          </TabsContent>

          {canWrite && info.is_open && (
            <TabsContent value="manual">
              <ManualCheckinTab
                accessToken={accessToken}
                sessionId={sessionId}
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
  onDelete,
}: {
  checkins: AttendanceRecordWithMember[]
  canWrite: boolean
  onDelete: (recordId: string) => Promise<void>
}) {
  if (checkins.length === 0) {
    return <p className="py-12 text-center text-gray-500">No check-ins yet.</p>
  }
  return (
    <div className="mt-4 grid gap-2">
      {checkins.map((c) => (
        <Card key={c.id}>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate">
                {c.member?.name ?? c.raw_name ?? 'Unknown'}
                {!c.member && c.raw_name && <span className="text-gray-400 font-normal"> (unmatched)</span>}
              </p>
              <p className="text-xs text-gray-400">
                {formatTime(c.checked_in_at)} · {CHECKIN_METHOD_LABELS[c.checkin_method] ?? c.checkin_method}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={c.match_status} />
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
      ))}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Manual check-in tab
// ----------------------------------------------------------------------------
function ManualCheckinTab({
  accessToken,
  sessionId,
  onCheckedIn,
}: {
  accessToken: string | undefined
  sessionId: string
  onCheckedIn: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!accessToken) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchMembers({ data: { query: q, limit: 15 } })
        if (active) setResults(res)
      } catch {
        if (active) setResults([])
      } finally {
        if (active) setSearching(false)
      }
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query, accessToken])

  const checkIn = async (member: Member) => {
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
      onCheckedIn()
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
      />
      {notice && <p className="mt-2 text-sm text-[#8B1538]">{notice}</p>}
      <div className="mt-3 grid gap-2">
        {searching && <p className="text-sm text-gray-400">Searching…</p>}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-gray-400">No members found.</p>
        )}
        {results.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{m.name}</p>
                {m.phone && <p className="text-xs text-gray-400">{m.phone}</p>}
              </div>
              <Button
                size="sm"
                disabled={busyId === m.id}
                onClick={() => checkIn(m)}
                className="bg-[#8B1538] hover:bg-[#6B0F2B]"
              >
                {busyId === m.id ? '…' : 'Check in'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
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
  onResolved,
}: {
  pending: PendingMatch[]
  accessToken: string | undefined
  sessionSatelliteId: string | null
  onResolved: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createFor, setCreateFor] = useState<PendingMatch | null>(null)

  if (pending.length === 0) {
    return <p className="py-12 text-center text-gray-500">Nothing to review. All check-ins are matched. 🎉</p>
  }

  const confirm = async (recordId: string, memberId: string) => {
    if (!accessToken) return
    setBusyId(recordId)
    try {
      await confirmMatch({ data: { accessToken, recordId, memberId } })
      onResolved()
    } finally {
      setBusyId(null)
    }
  }

  const ignore = async (recordId: string) => {
    if (!accessToken) return
    setBusyId(recordId)
    try {
      await ignoreCheckin({ data: { accessToken, recordId, note: null } })
      onResolved()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-4 grid gap-3">
      {pending.map(({ record, candidates }) => (
        <Card key={record.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-gray-900">{record.raw_name ?? 'Unnamed'}</p>
                {record.raw_phone && <p className="text-xs text-gray-400">{record.raw_phone}</p>}
                <p className="text-xs text-gray-400 mt-0.5">{formatTime(record.checked_in_at)}</p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Needs review</span>
            </div>

            {candidates.length > 0 ? (
              <div className="space-y-2 mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Suggested matches</p>
                {candidates.map((cand) => (
                  <div key={cand.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-medium text-gray-800">{cand.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{Math.round(cand.sim * 100)}% match</span>
                    </div>
                    <Button
                      size="sm"
                      disabled={busyId === record.id}
                      onClick={() => confirm(record.id, cand.id)}
                      className="bg-[#8B1538] hover:bg-[#6B0F2B]"
                    >
                      This is them
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-3">No similar members found.</p>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === record.id}
                onClick={() => setCreateFor({ record, candidates })}
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

      {createFor && (
        <CreateMemberDialog
          pending={createFor}
          accessToken={accessToken}
          defaultSatelliteId={sessionSatelliteId}
          onClose={() => setCreateFor(null)}
          onCreated={() => {
            setCreateFor(null)
            onResolved()
          }}
        />
      )}
    </div>
  )
}

function CreateMemberDialog({
  pending,
  accessToken,
  defaultSatelliteId,
  onClose,
  onCreated,
}: {
  pending: PendingMatch
  accessToken: string | undefined
  defaultSatelliteId: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState(pending.record.raw_name ?? '')
  const [phone, setPhone] = useState(pending.record.raw_phone ?? '')
  const [satelliteId, setSatelliteId] = useState(defaultSatelliteId ?? '')
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSatellites({ data: true }).then(setSatellites).catch(() => setSatellites([]))
  }, [])

  const submit = async () => {
    if (!accessToken) return
    if (name.trim().length < 2) {
      setError('Name must be at least 2 characters')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createMemberFromCheckin({
        data: {
          accessToken,
          recordId: pending.record.id,
          name: name.trim(),
          phone: phone.trim() || null,
          satelliteId: satelliteId || null,
        },
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create member from check-in</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="cm-name">Name</Label>
            <Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cm-phone">Mobile <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Input id="cm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cm-sat">Satellite <span className="text-gray-400 font-normal">(optional)</span></Label>
            <select
              id="cm-sat"
              value={satelliteId}
              onChange={(e) => setSatelliteId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#8B1538] outline-none"
            >
              <option value="">Unassigned</option>
              {satellites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-400">
            Creates a new visitor member and links this check-in to them.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
            {busy ? 'Creating…' : 'Create & link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
