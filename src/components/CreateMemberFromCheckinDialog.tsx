// Create a visitor member from an unmatched check-in and link the two. When
// similar names (or the typed email) already exist in the directory, it lists
// those members first so staff can link the right one instead of adding a
// duplicate record.

import { useState, useEffect, useRef } from 'react'
import { createMemberFromCheckin, confirmMatch } from '../server/functions/attendance'
import { getSatellites } from '../server/functions/satellites'
import { MAIN_SATELLITE_NAME } from '../lib/constants'
import { normalizeEmail } from '../lib/nameMatch'
import type { AttendanceRecordWithMember, CheckinMemberOption, SatelliteRow } from '../lib/types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog'

interface CreateMemberFromCheckinDialogProps {
  accessToken: string | undefined
  record: AttendanceRecordWithMember
  // The session's satellite; the main satellite is used when it has none.
  defaultSatelliteId: string | null
  onClose: () => void
  // Called after the check-in was linked, with a notice for the staff.
  onDone: (notice: string) => void
}

export function CreateMemberFromCheckinDialog({
  accessToken,
  record,
  defaultSatelliteId,
  onClose,
  onDone,
}: CreateMemberFromCheckinDialogProps) {
  const [name, setName] = useState(record.raw_name ?? '')
  const [phone, setPhone] = useState(record.raw_phone ?? '')
  const [email, setEmail] = useState(record.raw_email ?? '')
  const [satelliteId, setSatelliteId] = useState(defaultSatelliteId ?? '')
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

  const create = async (force: boolean) => {
    if (!accessToken) return
    if (name.trim().length < 2) {
      setError('Name required. At least 2 characters.')
      return
    }
    if (email.trim() && normalizeEmail(email) === null) {
      setError('Email address invalid.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await createMemberFromCheckin({
        data: {
          accessToken,
          recordId: record.id,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          satelliteId: satelliteId || null,
          force,
        },
      })
      if (res.status === 'possible_duplicate') {
        setMatches(res.matches)
      } else {
        onDone(`${name.trim()} created and linked ✓`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setBusy(false)
    }
  }

  const linkExisting = async (member: CheckinMemberOption) => {
    if (!accessToken) return
    setBusy(true)
    setError('')
    try {
      const res = await confirmMatch({ data: { accessToken, recordId: record.id, memberId: member.id } })
      onDone(
        res.alreadyCheckedIn
          ? `${member.name} already checked in. This check-in marked ignored.`
          : `Linked to ${member.name} ✓`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link failed. Retry.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create member from check-in</DialogTitle>
        </DialogHeader>

        {matches ? (
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Similar names in the directory. Link the right member, or create a new record.
            </p>
            {matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                <div className="min-w-0">
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
                  onClick={() => linkExisting(m)}
                  className="bg-[#8B1538] hover:bg-[#6B0F2B]"
                >
                  Link check-in
                </Button>
              </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="cm-name">Name</Label>
              <Input id="cm-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cm-phone">
                  Mobile <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="cm-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1"
                  inputMode="tel"
                />
              </div>
              <div>
                <Label htmlFor="cm-email">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="cm-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1"
                  maxLength={254}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cm-sat">Satellite</Label>
              <select
                id="cm-sat"
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
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400">Creates a visitor record linked to this check-in.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {matches ? (
            <Button variant="outline" onClick={() => create(true)} disabled={busy}>
              {busy ? 'Creating…' : 'Create anyway'}
            </Button>
          ) : (
            <Button onClick={() => create(false)} disabled={busy} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
              {busy ? 'Creating…' : 'Create & link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
