// Projectable full-page QR display for a service session. Rendered on the public
// /display/<token> route so it can be opened in a separate window and shown on a
// screen by anyone with the link (e.g. a tech booth) — no admin login required.

import { QRCodeSVG } from 'qrcode.react'

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

interface AttendanceQRDisplayProps {
  serviceName: string
  sessionDate: string
  satelliteName?: string | null
  title?: string | null
  // The URL the QR encodes (the public /checkin/<token> page attendees scan).
  checkinUrl: string
  checkinCount: number
  isOpen: boolean
}

export function AttendanceQRDisplay({
  serviceName,
  sessionDate,
  satelliteName,
  title,
  checkinUrl,
  checkinCount,
  isOpen,
}: AttendanceQRDisplayProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#6B0F2B] flex flex-col items-center justify-center p-6">
      <h1 className="text-white text-4xl md:text-6xl font-bold text-center mb-2">{serviceName}</h1>
      <p className="text-[#F8B4B4] text-lg md:text-2xl mb-8 text-center">
        {formatDate(sessionDate)}
        {satelliteName ? ` · ${satelliteName}` : ''}
        {title ? ` · ${title}` : ''}
      </p>

      <div className="bg-white p-6 md:p-10 rounded-3xl shadow-2xl">
        <QRCodeSVG value={checkinUrl} size={360} level="M" includeMargin={false} />
      </div>

      <p className="text-white/90 mt-8 text-xl md:text-2xl">Scan to check in</p>

      <div className="mt-6 text-center">
        <p className="text-6xl md:text-8xl font-bold text-white leading-none">{checkinCount}</p>
        <p className="text-[#F8B4B4] mt-1 text-lg">checked in</p>
      </div>

      {!isOpen && (
        <p className="mt-8 px-5 py-2 bg-white/10 text-white rounded-lg text-lg">
          This session is closed — check-ins are not being accepted.
        </p>
      )}
    </div>
  )
}
