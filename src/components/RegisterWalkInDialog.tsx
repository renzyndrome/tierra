// Booth registration for a walk-in who is not in the directory (e.g. a guest
// without a phone). Creates a visitor member and checks them in to the session.
// When similar names already exist, it lists them first so staff can check the
// right member in instead of creating a duplicate.

import { useState, useEffect, useRef } from 'react'
import { registerWalkIn, manualCheckIn } from '../server/functions/attendance'
import { getSatellites } from '../server/functions/satellites'
import { MAIN_SATELLITE_NAME } from '../lib/constants'
import type { CheckinMemberOption, SatelliteRow } from '../lib/types'
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

interface RegisterWalkInDialogProps {
  accessToken: string | undefined
  sessionId: string
  // Prefills the name (usually the text typed into the member search).
  initialName: string
  // The session's satellite; the main satellite is used when it has none.
  sessionSatelliteId: string | null
  onClose: () => void
  // Called after a check-in was recorded, with a notice for the staff.
  onDone: (notice: string) => void
}

export function RegisterWalkInDialog({
  accessToken,
  sessionId,
  initialName,
  sessionSatelliteId,
  onClose,
  onDone,
}: RegisterWalkInDialogProps) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [invitedBy, setInvitedBy] = useState('')
  const [satelliteId, setSatelliteId] = useState(sessionSatelliteId ?? '')
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [satellitesLoaded, setSatellitesLoaded] = useState(false)
  // Once staff pick a satellite (including "Unassigned"), the default no
  // longer applies, even if the list finishes loading afterwards.
  const satelliteTouched = useRef(false)
  const [matches, setMatches] = useState<CheckinMemberOption[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSatellites({ data: false })
      .then((sats) => {
        setSatellites(sats)
        const mainId = sats.find((s) => s.name === MAIN_SATELLITE_NAME)?.id ?? ''
        setSatelliteId((prev) => (satelliteTouched.current ? prev : prev || mainId))
      })
      .catch(() => setSatellites([]))
      .finally(() => setSatellitesLoaded(true))
  }, [])

  const register = async (force: boolean) => {
    if (!accessToken) return
    if (name.trim().length < 2) {
      setError('Name required. At least 2 characters.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await registerWalkIn({
        data: {
          accessToken,
          sessionId,
          name: name.trim(),
          phone: phone.trim() || null,
          satelliteId: satelliteId || null,
          invitedBy: invitedBy.trim() || null,
          force,
        },
      })
      if (res.status === 'possible_duplicate') {
        setMatches(res.matches)
      } else {
        onDone(`${res.displayName} registered and checked in ✓`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Retry.')
    } finally {
      setBusy(false)
    }
  }

  const checkInExisting = async (member: CheckinMemberOption) => {
    if (!accessToken) return
    setBusy(true)
    setError('')
    try {
      const res = await manualCheckIn({ data: { accessToken, sessionId, memberId: member.id } })
      onDone(
        res.status === 'already_checked_in'
          ? `${member.name} is already checked in.`
          : `${member.name} checked in ✓`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed. Retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register new person</DialogTitle>
        </DialogHeader>

        {matches ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Similar names in the directory. Check in the right member, or register a new record.
            </p>
            {matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <div>
                  <p className="font-medium text-gray-900">{m.name}</p>
                  {(m.satellite_name || m.phone) && (
                    <p className="text-xs text-gray-400">
                      {[m.satellite_name, m.phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => checkInExisting(m)}
                  className="bg-[#8B1538] hover:bg-[#6B0F2B]"
                >
                  Check in
                </Button>
              </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="wi-name">Name</Label>
              <Input id="wi-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="wi-phone">Mobile <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="wi-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="wi-sat">Satellite</Label>
              <select
                id="wi-sat"
                value={satelliteId}
                disabled={!satellitesLoaded}
                onChange={(e) => {
                  satelliteTouched.current = true
                  setSatelliteId(e.target.value)
                }}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#8B1538] outline-none"
              >
                <option value="">Unassigned</option>
                {satellites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="wi-invited">Invited by <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Input id="wi-invited" value={invitedBy} onChange={(e) => setInvitedBy(e.target.value)} className="mt-1" />
            </div>
            <p className="text-xs text-gray-400">Creates a visitor record and a check-in.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          {matches ? (
            <Button variant="outline" onClick={() => register(true)} disabled={busy}>
              {busy ? 'Registering…' : 'Register anyway'}
            </Button>
          ) : (
            <Button onClick={() => register(false)} disabled={busy} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
              {busy ? 'Registering…' : 'Register & check in'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
