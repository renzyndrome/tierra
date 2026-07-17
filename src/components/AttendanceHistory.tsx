// Reusable attendance-history panel. Used on the member's own profile
// ("My Attendance") and on member detail pages (staff view). Purely
// presentational — the caller fetches the summary.

import type { MemberAttendanceSummary } from '../lib/types'
import { CHECKIN_METHOD_LABELS } from '../lib/constants'

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

interface AttendanceHistoryProps {
  summary: MemberAttendanceSummary | null
  loading?: boolean
  title?: string
  emptyMessage?: string
}

export function AttendanceHistory({
  summary,
  loading = false,
  title = 'Attendance',
  emptyMessage = 'No attendance recorded yet.',
}: AttendanceHistoryProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (!summary || summary.totalCheckins === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">{summary.totalCheckins} total check-ins</span>
      </div>

      {summary.byService.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {summary.byService.map((s) => (
            <span
              key={s.service_slug}
              className="px-3 py-1 rounded-full bg-[#F8B4B4]/25 text-[#8B1538] text-xs font-medium"
            >
              {s.service_name}: {s.count}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-1.5">
        {summary.recent.map((r) => (
          <div
            key={r.record_id}
            className="flex items-center justify-between py-1.5 border-b last:border-0 border-gray-100"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{r.service_name}</p>
              <p className="text-xs text-gray-400">
                {formatDate(r.session_date)}
                {r.satellite_name ? ` · ${r.satellite_name}` : ''}
              </p>
            </div>
            <span className="text-xs text-gray-400">
              {CHECKIN_METHOD_LABELS[r.checkin_method] ?? r.checkin_method}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
