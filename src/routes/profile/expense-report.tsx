// Quest Laguna Directory - Member self-service "Church Expense Report".
//
// A member requests a church expense report for a period; finance reviews and
// releases it. Once released, the member can view/download an AGGREGATE expense
// summary (totals by category) for that period. All data is resolved server-side
// from the caller's own token.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { ExpenseReportRequest, ExpenseReportSummary } from '../../lib/types'
import {
  formatCurrency,
  EXPENSE_REPORT_STATUS_LABELS,
  EXPENSE_REPORT_STATUS_BADGE,
  EXPENSE_CATEGORIES,
} from '../../lib/constants'
import {
  getMyExpenseReportRequests,
  createExpenseReportRequest,
  getMyExpenseReport,
} from '../../server/functions/expenseReports'
import { downloadPDF } from '../../lib/export'

export const Route = createFileRoute('/profile/expense-report')({
  component: ExpenseReportPage,
})

function currentYear(): number {
  return new Date().getFullYear()
}

function formatDate(dateStr: string): string {
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

function categoryLabel(category: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

function categoryColor(category: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.color ?? '#6B7280'
}

function ExpenseReportPage() {
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  // null = unknown/loading, false = account not linked to a member record
  const [isLinked, setIsLinked] = useState<boolean | null>(null)
  const [requests, setRequests] = useState<ExpenseReportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Request form
  const [startDate, setStartDate] = useState(`${currentYear()}-01-01`)
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Active released report being viewed
  const [activeReport, setActiveReport] = useState<ExpenseReportSummary | null>(null)
  const [reportLoadingId, setReportLoadingId] = useState<string | null>(null)

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
      // Determine whether this account is linked to a member record.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('member_id')
        .eq('id', session.user.id)
        .single()
      if (!active) return
      setIsLinked(Boolean((profile as { member_id: string | null } | null)?.member_id))
      setAuthChecked(true)
    }
    check()
    return () => {
      active = false
    }
  }, [navigate])

  const loadRequests = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError(null)
    try {
      const rows = await getMyExpenseReportRequests({ data: { accessToken } })
      setRequests(rows)
    } catch (err) {
      console.error('Failed to load expense report requests:', err)
      setError('We could not load your requests. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    if (authChecked) loadRequests()
  }, [authChecked, loadRequests])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    if (endDate < startDate) {
      setError('End date must be on or after the start date.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createExpenseReportRequest({
        data: { accessToken, periodStart: startDate, periodEnd: endDate, note: note.trim() || null },
      })
      setNote('')
      await loadRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleViewReport = async (req: ExpenseReportRequest) => {
    if (!accessToken) return
    // Toggle off if already showing this one.
    if (activeReport?.request_id === req.id) {
      setActiveReport(null)
      return
    }
    setReportLoadingId(req.id)
    setError(null)
    try {
      const summary = await getMyExpenseReport({ data: { accessToken, requestId: req.id } })
      setActiveReport(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open the report')
    } finally {
      setReportLoadingId(null)
    }
  }

  const handleDownloadReport = async (summary: ExpenseReportSummary) => {
    const headers = ['Category', 'Amount (PHP)']
    const rows = summary.byCategory.map((c) => [categoryLabel(c.category), Number(c.amount).toFixed(2)])
    rows.push(['TOTAL', Number(summary.totalExpenses).toFixed(2)])
    try {
      await downloadPDF(
        `church-expense-report-${summary.period_start}_to_${summary.period_end}`,
        headers,
        rows,
        `Church Expense Report — ${formatDate(summary.period_start)} to ${formatDate(summary.period_end)}`,
      )
    } catch (err) {
      console.error('PDF export failed:', err)
      setError('Could not generate the PDF. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
          <h1 className="text-2xl sm:text-3xl font-bold">Church Expense Report</h1>
          <p className="text-white/80 mt-1 text-sm sm:text-base">
            Request a report of how the church used its funds. Finance will review and release it.
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-lg p-4 text-sm">{error}</div>
        )}

        {/* Not-linked notice: only linked members may request a report */}
        {isLinked === false && (
          <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-lg p-4 text-sm">
            Your account isn't linked to a member record yet, so you can't request a report.
            Please contact an admin to link your account.
          </div>
        )}

        {/* Request form */}
        {isLinked !== false && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Request a report</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="start" className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30"
                />
              </div>
              <div>
                <label htmlFor="end" className="block text-xs font-medium text-gray-500 mb-1">To</label>
                <input
                  id="end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30"
                />
              </div>
            </div>
            <div>
              <label htmlFor="note" className="block text-xs font-medium text-gray-500 mb-1">
                Note (optional)
              </label>
              <input
                id="note"
                type="text"
                value={note}
                maxLength={500}
                placeholder="e.g. For my records"
                onChange={(e) => setNote(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-lg bg-[#8B1538] text-white hover:bg-[#6D1029] disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </form>
        </div>
        )}

        {/* Requests list */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">My requests</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-400">You haven't requested any expense reports yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800">
                        {formatDate(r.period_start)} – {formatDate(r.period_end)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Requested {formatDate(r.created_at.split('T')[0])}
                        {r.note ? ` · "${r.note}"` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${EXPENSE_REPORT_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {EXPENSE_REPORT_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                      {r.status === 'released' && (
                        <button
                          onClick={() => handleViewReport(r)}
                          disabled={reportLoadingId === r.id}
                          className="text-xs font-medium text-[#8B1538] hover:underline disabled:opacity-50"
                        >
                          {reportLoadingId === r.id
                            ? 'Opening…'
                            : activeReport?.request_id === r.id
                              ? 'Hide report'
                              : 'View report'}
                        </button>
                      )}
                    </div>
                  </div>

                  {r.status === 'rejected' && r.note && (
                    <p className="text-xs text-red-500 mt-1.5">Finance note: {r.note}</p>
                  )}

                  {/* Inline released report */}
                  {activeReport?.request_id === r.id && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-gray-400">Total church expenses</p>
                          <p className="text-xl font-bold text-gray-900">
                            {formatCurrency(activeReport.totalExpenses)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDownloadReport(activeReport)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                        >
                          Download PDF
                        </button>
                      </div>

                      {activeReport.byCategory.length === 0 ? (
                        <p className="text-sm text-gray-400">No expenses recorded for this period.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {activeReport.byCategory.map((c) => {
                            const pct =
                              activeReport.totalExpenses > 0
                                ? Math.round((c.amount / activeReport.totalExpenses) * 100)
                                : 0
                            return (
                              <div key={c.category} className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: categoryColor(c.category) }}
                                />
                                <span className="text-sm text-gray-700 w-28 shrink-0">
                                  {categoryLabel(c.category)}
                                </span>
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${pct}%`, backgroundColor: categoryColor(c.category) }}
                                  />
                                </div>
                                <span className="text-sm font-semibold text-gray-900 w-24 text-right shrink-0">
                                  {formatCurrency(c.amount)}
                                </span>
                                <span className="text-xs text-gray-400 w-9 text-right shrink-0">{pct}%</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <p className="text-[11px] text-gray-400 mt-3">
                        Aggregate figures only. For questions, contact the finance office.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
