// Quest Laguna Directory - Member self-service "My Giving" / Statement of Account.
//
// A logged-in member views their own contribution history (tithes / offerings /
// missions recorded against their linked member record), filters by date range,
// and downloads a printable statement. All data is resolved server-side from the
// caller's own access token, so a member can only ever see their own giving.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { MemberGivingStatement } from '../../lib/types'
import { INCOME_CATEGORIES } from '../../lib/constants'
import { GivingStatement } from '../../components/GivingStatement'
import { getMyGivingStatement } from '../../server/functions/finances'
import { downloadPDF, downloadExcel } from '../../lib/export'

export const Route = createFileRoute('/profile/giving')({
  component: GivingPage,
})

type RangePreset = 'all' | 'this_year' | 'last_12'

// Compute the [start, end] date strings (YYYY-MM-DD) for a preset. Undefined =
// unbounded on that side.
function rangeForPreset(preset: RangePreset): { startDate?: string; endDate?: string } {
  if (preset === 'all') return {}
  const now = new Date()
  if (preset === 'this_year') {
    return { startDate: `${now.getFullYear()}-01-01` }
  }
  // last_12: from the first day of the month 11 months ago
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const y = start.getFullYear()
  const m = String(start.getMonth() + 1).padStart(2, '0')
  return { startDate: `${y}-${m}-01` }
}

const PRESET_LABELS: Record<RangePreset, string> = {
  all: 'All time',
  this_year: 'This year',
  last_12: 'Last 12 months',
}

function categoryLabel(category: string): string {
  return INCOME_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

function formatDateLong(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function GivingPage() {
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [statement, setStatement] = useState<MemberGivingStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preset, setPreset] = useState<RangePreset>('all')
  const [exporting, setExporting] = useState(false)
  // Monotonic request id: guards against out-of-order responses when the period
  // is changed rapidly, so only the latest request may update state.
  const reqIdRef = useRef(0)

  // 1) Verify auth once; capture the access token used for server calls.
  useEffect(() => {
    let active = true
    const check = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!active) return
      if (!session?.access_token) {
        navigate({ to: '/auth/login' })
        return
      }
      setAccessToken(session.access_token)
      setAuthChecked(true)
    }
    check()
    return () => {
      active = false
    }
  }, [navigate])

  // 2) Load / reload the statement whenever the token or the range changes.
  const loadStatement = useCallback(async () => {
    if (!accessToken) return
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = rangeForPreset(preset)
      const result = await getMyGivingStatement({
        data: { accessToken, startDate, endDate },
      })
      if (reqId !== reqIdRef.current) return // a newer request superseded this one
      setStatement(result)
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      console.error('Failed to load giving statement:', err)
      // Clear any previously-loaded statement so stale (wrong-period) data can't
      // be shown or exported alongside the error.
      setStatement(null)
      setError('We could not load your giving statement. Please try again.')
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [accessToken, preset])

  useEffect(() => {
    if (authChecked) loadStatement()
  }, [authChecked, loadStatement])

  const rangeLabel = (() => {
    if (!statement) return PRESET_LABELS[preset]
    const { startDate, endDate } = statement.range
    if (!startDate && !endDate) return 'All time'
    const from = startDate ? formatDateLong(startDate) : 'Beginning'
    const to = endDate ? formatDateLong(endDate) : 'Present'
    return `${from} – ${to}`
  })()

  const buildExportRows = (s: MemberGivingStatement): { headers: string[]; rows: string[][] } => {
    const headers = ['Date', 'Category', 'Reference', 'Description', 'Amount (PHP)']
    const rows = s.entries.map((e) => [
      e.transaction_date,
      categoryLabel(e.category),
      e.reference_number ?? '',
      e.description ?? '',
      Number(e.amount).toFixed(2),
    ])
    rows.push(['', '', '', 'TOTAL', Number(s.totalGiven).toFixed(2)])
    return { headers, rows }
  }

  const handleDownloadPDF = async () => {
    if (!statement || statement.giftCount === 0) return
    setExporting(true)
    try {
      const { headers, rows } = buildExportRows(statement)
      await downloadPDF(
        `giving-statement-${statement.member.name.replace(/\s+/g, '-').toLowerCase()}`,
        headers,
        rows,
        `Statement of Account — ${statement.member.name}`
      )
    } catch (err) {
      console.error('PDF export failed:', err)
      setError('Could not generate the PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadExcel = async () => {
    if (!statement || statement.giftCount === 0) return
    setExporting(true)
    try {
      const { headers, rows } = buildExportRows(statement)
      await downloadExcel(
        `giving-statement-${statement.member.name.replace(/\s+/g, '-').toLowerCase()}`,
        headers,
        rows,
        'Giving'
      )
    } catch (err) {
      console.error('Excel export failed:', err)
      setError('Could not generate the Excel file. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const hasData = !!statement && statement.giftCount > 0
  // statement === null (after a load) means the account isn't linked to a member.
  const notLinked = authChecked && !loading && statement === null && !error

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white">
        <div className="max-w-4xl mx-auto px-4 py-5 sm:py-8">
          <div className="flex items-center justify-between mb-5">
            <Link
              to="/profile"
              className="text-white/70 hover:text-white flex items-center gap-1.5 text-sm sm:text-base"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back to Profile</span>
              <span className="sm:hidden">Back</span>
            </Link>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">My Giving</h1>
          <p className="text-white/80 mt-1 text-sm sm:text-base">
            Your personal Statement of Account — tithes, offerings, and missions
          </p>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        {/* Controls */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="range" className="text-sm text-gray-500 shrink-0">
              Period
            </label>
            <select
              id="range"
              value={preset}
              onChange={(e) => setPreset(e.target.value as RangePreset)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30"
            >
              {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
            <span className="hidden sm:inline text-xs text-gray-400">{rangeLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={!hasData || exporting}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? 'Preparing…' : 'Download PDF'}
            </button>
            <button
              onClick={handleDownloadExcel}
              disabled={!hasData || exporting}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Download Excel
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        {error ? null : notLinked ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
            <svg className="w-14 h-14 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-6 4h6m-6 4h4M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
            </svg>
            <h2 className="text-lg font-bold text-gray-900 mb-2">No giving record yet</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Your account isn't linked to a member profile yet, so there's no giving
              record to show. Contact an admin to link your account.
            </p>
            <Link
              to="/profile"
              className="inline-block px-6 py-3 bg-[#8B1538] text-white rounded-lg hover:bg-[#6D1029] transition-colors"
            >
              Back to Profile
            </Link>
          </div>
        ) : (
          <GivingStatement statement={statement} loading={loading} title="My Giving" />
        )}

        <p className="text-xs text-gray-400 text-center px-4">
          This statement reflects contributions recorded by the church finance team.
          If something looks incorrect, please contact the finance office.
        </p>
      </div>
    </div>
  )
}
