// Quest Laguna — Finance: church expense report request queue.
// Finance reviews member requests for a church expense report and releases or
// rejects them. View requires finances.read; acting requires finances.write.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { hasPermission } from '../../lib/auth'
import {
  EXPENSE_REPORT_STATUS_LABELS,
  EXPENSE_REPORT_STATUS_BADGE,
} from '../../lib/constants'
import type { ExpenseReportRequestWithRequester } from '../../lib/types'
import {
  listExpenseReportRequests,
  releaseExpenseReportRequest,
  rejectExpenseReportRequest,
} from '../../server/functions/expenseReports'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

export const Route = createFileRoute('/finances/report-requests')({
  component: ReportRequestsPage,
})

type StatusFilter = '' | 'pending' | 'released' | 'rejected'

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function ReportRequestsPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, profile, session } = useAuth()
  const accessToken = session?.access_token
  const canView = profile ? hasPermission(profile.role, 'finances.read') : false
  const canAct = profile ? hasPermission(profile.role, 'finances.write') : false

  const [requests, setRequests] = useState<ExpenseReportRequestWithRequester[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  // Reject dialog
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/finances/report-requests')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  const loadData = useCallback(async () => {
    if (!accessToken || !canView) return
    setLoading(true)
    setError('')
    try {
      const rows = await listExpenseReportRequests({
        data: { accessToken, status: statusFilter || undefined },
      })
      setRequests(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }, [accessToken, canView, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRelease = async (id: string) => {
    if (!accessToken) return
    setRowBusyId(id)
    setError('')
    try {
      await releaseExpenseReportRequest({ data: { accessToken, id } })
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to release report')
    } finally {
      setRowBusyId(null)
    }
  }

  const handleReject = async () => {
    if (!accessToken || !rejectingId) return
    setRowBusyId(rejectingId)
    setError('')
    try {
      await rejectExpenseReportRequest({
        data: { accessToken, id: rejectingId, note: rejectNote.trim() || undefined },
      })
      setRejectingId(null)
      setRejectNote('')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request')
    } finally {
      setRowBusyId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#8B1538]" />
      </div>
    )
  }
  if (!isAuthenticated) return null
  if (!canView) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-gray-600">You don't have permission to view finance requests.</p>
        <Link to="/finances" className="text-[#8B1538] hover:underline">Back to Finances</Link>
      </div>
    )
  }

  const STATUS_TABS: { value: StatusFilter; label: string }[] = [
    { value: 'pending', label: 'Pending' },
    { value: 'released', label: 'Released' },
    { value: 'rejected', label: 'Rejected' },
    { value: '', label: 'All' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500 mb-1">
              <Link to="/finances" className="hover:text-[#8B1538]">Finances</Link>
              <span className="mx-1.5">/</span>
              <span>Report Requests</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Expense Report Requests</h1>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Requests</CardTitle>
            <div className="flex items-center gap-1">
              {STATUS_TABS.map((t) => (
                <button
                  key={t.value || 'all'}
                  onClick={() => setStatusFilter(t.value)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    statusFilter === t.value
                      ? 'bg-[#8B1538] text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            {loading ? (
              <p className="text-sm text-gray-400 py-4">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requester</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.requester_name || r.requester_email || 'Unknown'}
                        {r.requester_name && r.requester_email && (
                          <span className="block text-xs text-gray-500">{r.requester_email}</span>
                        )}
                        {r.note && <span className="block text-xs text-gray-400 italic mt-0.5">"{r.note}"</span>}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(r.period_start)} – {formatDate(r.period_end)}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${EXPENSE_REPORT_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {EXPENSE_REPORT_STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === 'pending' && canAct ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={rowBusyId === r.id}
                              onClick={() => handleRelease(r.id)}
                            >
                              Release
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rowBusyId === r.id}
                              onClick={() => { setRejectingId(r.id); setRejectNote('') }}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {requests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-6">
                        No requests here.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request</DialogTitle>
            <DialogDescription>
              Optionally add a note explaining why. The requester will see it.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Reason (optional)"
            value={rejectNote}
            maxLength={500}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!!rowBusyId} onClick={handleReject}>
              {rowBusyId ? 'Rejecting…' : 'Reject request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
