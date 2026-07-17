// Self-contained, permission-gated attendance panel for staff-facing member
// detail pages. Renders nothing unless the viewer holds registration.read.
// Keeps host pages simple: import and drop in <MemberAttendanceSection memberId=.../>.

import { useState, useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { hasPermission } from '../lib/auth'
import { getMemberAttendance } from '../server/functions/attendance'
import type { MemberAttendanceSummary } from '../lib/types'
import { AttendanceHistory } from './AttendanceHistory'

export function MemberAttendanceSection({ memberId }: { memberId: string }) {
  const { profile, session } = useAuth()
  const accessToken = session?.access_token
  const canView = profile ? hasPermission(profile.role, 'registration.read') : false

  const [summary, setSummary] = useState<MemberAttendanceSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accessToken || !canView) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    getMemberAttendance({ data: { accessToken, memberId } })
      .then((s) => {
        if (active) setSummary(s)
      })
      .catch(() => {
        if (active) setSummary(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [accessToken, canView, memberId])

  if (!canView) return null

  return (
    <AttendanceHistory
      summary={summary}
      loading={loading}
      title="Service Attendance"
      emptyMessage="No service check-ins recorded for this member."
    />
  )
}
