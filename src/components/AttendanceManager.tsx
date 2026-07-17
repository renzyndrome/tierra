// Service Attendance management surface: session list, create session, and the
// live projectable QR display. Shared by the standalone /admin/attendance route
// (full page) and the admin dashboard "Attendance" tab (embedded).

import { Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from './AuthProvider'
import {
  getSessions,
  getServiceTypes,
  createSession,
  setSessionOpen,
} from '../server/functions/attendance'
import { getSatellites } from '../server/functions/satellites'
import { hasPermission } from '../lib/auth'
import { buildCheckinUrl } from '../lib/constants'
import type { ServiceSessionWithRelations, ServiceType, SatelliteRow } from '../lib/types'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'

function todayLocal(): string {
  // en-CA renders as YYYY-MM-DD in the local timezone.
  return new Date().toLocaleDateString('en-CA')
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

interface AttendanceManagerProps {
  // Embedded in the dashboard tab: drop the full-page chrome (min-h-screen
  // background, breadcrumb, and the large page heading).
  embedded?: boolean
}

export function AttendanceManager({ embedded = false }: AttendanceManagerProps) {
  const navigate = useNavigate()
  const { profile, session } = useAuth()
  const accessToken = session?.access_token
  const canWrite = profile ? hasPermission(profile.role, 'registration.write') : false

  const [sessions, setSessions] = useState<ServiceSessionWithRelations[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [newTypeId, setNewTypeId] = useState('')
  const [newDate, setNewDate] = useState(todayLocal())
  const [newSatelliteId, setNewSatelliteId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState('')

  // QR display overlay
  const [qrSession, setQrSession] = useState<ServiceSessionWithRelations | null>(null)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [s, types, sats] = await Promise.all([
        getSessions({ data: { accessToken } }),
        getServiceTypes({ data: { accessToken } }),
        getSatellites({ data: true }),
      ])
      setSessions(s)
      setServiceTypes(types)
      setSatellites(sats)
      if (types.length > 0 && !newTypeId) setNewTypeId(types[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [accessToken, newTypeId])

  useEffect(() => {
    load()
  }, [load])

  // Poll while the QR overlay is open so the live counter updates.
  useEffect(() => {
    if (!qrSession || !accessToken) return
    const interval = setInterval(async () => {
      try {
        const s = await getSessions({ data: { accessToken } })
        setSessions(s)
        const updated = s.find((x) => x.id === qrSession.id)
        if (updated) setQrSession(updated)
      } catch {
        /* ignore transient poll errors */
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [qrSession, accessToken])

  const handleCreate = async () => {
    if (!accessToken || !newTypeId) return
    setCreateBusy(true)
    setCreateError('')
    try {
      const created = await createSession({
        data: {
          accessToken,
          serviceTypeId: newTypeId,
          sessionDate: newDate,
          satelliteId: newSatelliteId || null,
          title: newTitle.trim() || null,
        },
      })
      setShowCreate(false)
      setNewTitle('')
      await load()
      navigate({ to: '/admin/attendance/$sessionId', params: { sessionId: created.id } })
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create session')
    } finally {
      setCreateBusy(false)
    }
  }

  const toggleOpen = async (s: ServiceSessionWithRelations) => {
    if (!accessToken) return
    setRowBusyId(s.id)
    try {
      await setSessionOpen({ data: { accessToken, sessionId: s.id, isOpen: !s.is_open } })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update session')
    } finally {
      setRowBusyId(null)
    }
  }

  const body = (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          {!embedded && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link to="/admin" className="hover:text-[#8B1538]">Dashboard</Link>
              <span>/</span>
              <span>Attendance</span>
            </div>
          )}
          <h1 className={embedded ? 'text-lg font-bold text-gray-900' : 'text-2xl font-bold text-gray-900'}>
            Service Attendance
          </h1>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/attendance/analytics">
            <Button variant="outline">View analytics</Button>
          </Link>
          {canWrite && (
            <Button onClick={() => setShowCreate(true)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
              Start a session
            </Button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="py-20 text-center text-gray-500">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-gray-500 mb-4">No service sessions yet.</p>
            {canWrite && (
              <Button onClick={() => setShowCreate(true)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                Start your first session
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{s.service_type?.name ?? 'Service'}</h3>
                    {s.is_open ? (
                      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">Open</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">Closed</span>
                    )}
                    {(s.pending_count ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                        {s.pending_count} to review
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatDate(s.session_date)}
                    {s.satellite?.name ? ` · ${s.satellite.name}` : ''}
                    {s.title ? ` · ${s.title}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-[#8B1538] leading-none">{s.checkin_count ?? 0}</p>
                    <p className="text-xs text-gray-400">checked in</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setQrSession(s)}>
                      Show QR
                    </Button>
                    <Link to="/admin/attendance/$sessionId" params={{ sessionId: s.id }}>
                      <Button variant="outline" size="sm">Manage</Button>
                    </Link>
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowBusyId === s.id}
                        onClick={() => toggleOpen(s)}
                      >
                        {s.is_open ? 'Close' : 'Reopen'}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create session dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a service session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="svc-type">Service</Label>
              <select
                id="svc-type"
                value={newTypeId}
                onChange={(e) => setNewTypeId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#8B1538] outline-none"
              >
                {serviceTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="svc-date">Date</Label>
              <Input id="svc-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="svc-sat">Satellite <span className="text-gray-400 font-normal">(optional)</span></Label>
              <select
                id="svc-sat"
                value={newSatelliteId}
                onChange={(e) => setNewSatelliteId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#8B1538] outline-none"
              >
                <option value="">All / Main</option>
                {satellites.map((sat) => (
                  <option key={sat.id} value={sat.id}>{sat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="svc-title">Label <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="svc-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Anniversary Sunday" className="mt-1" />
            </div>
            {createError && <p className="text-sm text-red-600">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createBusy || !newTypeId} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
              {createBusy ? 'Creating…' : 'Create & open'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR display overlay (projectable) */}
      {qrSession && <QrOverlay session={qrSession} onClose={() => setQrSession(null)} />}
    </>
  )

  if (embedded) {
    return <div className="space-y-2">{body}</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">{body}</div>
    </div>
  )
}

function QrOverlay({
  session,
  onClose,
}: {
  session: ServiceSessionWithRelations
  onClose: () => void
}) {
  const url = buildCheckinUrl(session.qr_token)
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#6B0F2B] flex flex-col items-center justify-center p-6">
      <button
        onClick={onClose}
        aria-label="Close QR display"
        className="absolute top-5 right-5 text-white/70 hover:text-white text-sm border border-white/30 rounded-lg px-4 py-2"
      >
        Close
      </button>
      <h2 className="text-white text-3xl md:text-5xl font-bold text-center mb-2">
        {session.service_type?.name ?? 'Service'}
      </h2>
      <p className="text-[#F8B4B4] text-lg md:text-xl mb-8">
        {formatDate(session.session_date)}
        {session.satellite?.name ? ` · ${session.satellite.name}` : ''}
      </p>
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl">
        <QRCodeSVG value={url} size={320} level="M" includeMargin={false} />
      </div>
      <p className="text-white/80 mt-8 text-lg">Scan to check in</p>
      <div className="mt-6 text-center">
        <p className="text-6xl md:text-7xl font-bold text-white leading-none">{session.checkin_count ?? 0}</p>
        <p className="text-[#F8B4B4] mt-1">checked in</p>
      </div>
      {!session.is_open && (
        <p className="mt-6 px-4 py-2 bg-white/10 text-white rounded-lg">This session is closed — check-ins are not being accepted.</p>
      )}
    </div>
  )
}
