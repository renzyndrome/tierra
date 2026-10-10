// PUBLIC projectable QR display: /display/<qr_token>.
//
// Independent of any admin login — an admin creates a session, then shares this
// link (or opens it in a new window); a tech booth can display it on a screen
// without signing in. Keyed by the unguessable qr_token. Polls a live counter.

import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { AttendanceQRDisplay } from '../../components/AttendanceQRDisplay'
import { getPublicSessionDisplay } from '../../server/functions/attendance'
import { buildCheckinUrl } from '../../lib/constants'

export const Route = createFileRoute('/display/$token')({
  component: DisplayPage,
})

interface DisplayData {
  qrToken: string
  serviceName: string
  sessionDate: string
  satelliteName: string | null
  title: string | null
  isOpen: boolean
  checkinCount: number
}

function DisplayPage() {
  const { token } = Route.useParams()
  const [data, setData] = useState<DisplayData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      try {
        const d = await getPublicSessionDisplay({ data: { qrToken: token } })
        if (active) setData(d)
      } catch {
        /* keep last-known display; ignore transient errors */
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1A0A0E]">
        <div className="w-12 h-12 border-4 border-[#F8B4B4] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1A0A0E] text-white gap-2 p-6 text-center">
        <p className="text-xl font-semibold">Display not found</p>
        <p className="text-white/60">This QR display link is invalid or the session was removed.</p>
      </div>
    )
  }

  return (
    <AttendanceQRDisplay
      serviceName={data.serviceName}
      sessionDate={data.sessionDate}
      satelliteName={data.satelliteName}
      title={data.title}
      checkinUrl={buildCheckinUrl(token)}
      checkinCount={data.checkinCount}
      isOpen={data.isOpen}
    />
  )
}
