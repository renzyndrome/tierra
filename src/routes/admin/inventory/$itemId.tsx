// Admin — Inventory item detail: item info + purchase date, maintenance history
// (e.g. aircon cleaning logs), and this item's borrow / deployment history.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { hasPermission } from '../../../lib/auth'
import { getInventoryItem } from '../../../server/functions/inventory'
import {
  getMaintenanceLogs,
  createMaintenanceLog,
  deleteMaintenanceLog,
} from '../../../server/functions/inventoryMaintenance'
import { getBorrowRequests } from '../../../server/functions/inventoryBorrow'
import { MAINTENANCE_TYPES, BORROW_STATUS_LABELS, BORROW_STATUS_BADGE, BORROW_DESTINATION_LABELS } from '../../../lib/constants'
import type {
  InventoryItem,
  InventoryMaintenanceLog,
  InventoryBorrowRequestWithRelations,
  MaintenanceType,
} from '../../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'

export const Route = createFileRoute('/admin/inventory/$itemId')({
  component: () => (
    <AdminRoute requiredPermissions={['inventory.read']}>
      <InventoryItemDetail />
    </AdminRoute>
  ),
})

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    // Date-only values are rendered without timezone shift.
    const iso = dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

const conditionBadge: Record<string, string> = {
  Good: 'bg-green-100 text-green-800',
  Fair: 'bg-yellow-100 text-yellow-800',
  'Needs Repair': 'bg-amber-100 text-amber-800',
  Damaged: 'bg-red-100 text-red-800',
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function InventoryItemDetail() {
  const { itemId } = Route.useParams()
  const { session, profile } = useAuth()
  const accessToken = session?.access_token
  const canWrite = profile ? hasPermission(profile.role, 'inventory.write') : false

  const [item, setItem] = useState<InventoryItem | null>(null)
  const [logs, setLogs] = useState<InventoryMaintenanceLog[]>([])
  const [borrows, setBorrows] = useState<InventoryBorrowRequestWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showLogDialog, setShowLogDialog] = useState(false)
  const [savingLog, setSavingLog] = useState(false)
  const emptyLog = {
    maintenance_date: todayISO(),
    maintenance_type: 'Cleaning' as MaintenanceType,
    description: '',
    performed_by: '',
    cost: '',
    next_due_date: '',
  }
  const [logForm, setLogForm] = useState(emptyLog)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [it, ls, bs] = await Promise.all([
        getInventoryItem({ data: { id: itemId } }),
        getMaintenanceLogs({ data: { accessToken, itemId } }),
        getBorrowRequests({ data: { accessToken, itemId } }),
      ])
      setItem(it)
      setLogs(ls)
      setBorrows(bs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load item')
    } finally {
      setLoading(false)
    }
  }, [accessToken, itemId])

  useEffect(() => {
    load()
  }, [load])

  const handleSaveLog = async () => {
    if (!accessToken) return
    setSavingLog(true)
    try {
      await createMaintenanceLog({
        data: {
          accessToken,
          item_id: itemId,
          maintenance_date: logForm.maintenance_date,
          maintenance_type: logForm.maintenance_type,
          description: logForm.description.trim() || null,
          performed_by: logForm.performed_by.trim() || null,
          cost: logForm.cost ? Number(logForm.cost) : null,
          next_due_date: logForm.next_due_date || null,
        },
      })
      setShowLogDialog(false)
      setLogForm(emptyLog)
      const ls = await getMaintenanceLogs({ data: { accessToken, itemId } })
      setLogs(ls)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save maintenance log')
    } finally {
      setSavingLog(false)
    }
  }

  const handleDeleteLog = async (id: string) => {
    if (!accessToken) return
    if (!confirm('Delete this maintenance log?')) return
    try {
      await deleteMaintenanceLog({ data: { accessToken, id } })
      setLogs((prev) => prev.filter((l) => l.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete log')
    }
  }

  if (loading) {
    return <div className="max-w-5xl mx-auto p-6 text-gray-500">Loading item…</div>
  }

  if (error || !item) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-red-600 mb-4">{error || 'Item not found'}</p>
        <Link to="/admin" className="text-[#8B1538] hover:underline">← Back to Inventory</Link>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link to="/admin" className="text-sm text-[#8B1538] hover:underline">← Back to Inventory</Link>
        <Link
          to="/admin/inventory/requests"
          className="text-sm font-medium text-[#8B1538] hover:underline"
        >
          Borrow / Deployment Requests →
        </Link>
      </div>

      {/* Item info */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
            {item.photo_url && (
              <img
                src={item.photo_url}
                alt={item.name}
                className="w-24 h-24 rounded-lg object-cover border"
              />
            )}
            <div className="flex-1">
              <CardTitle className="text-xl">{item.name}</CardTitle>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                  {item.location}
                </span>
                {item.category && (
                  <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                    {item.category}
                  </span>
                )}
                <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${conditionBadge[item.condition] ?? 'bg-gray-100 text-gray-700'}`}>
                  {item.condition}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                  Qty: {item.quantity}
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Date purchased</dt>
              <dd className="text-gray-900">{fmtDate(item.date_purchased)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Added</dt>
              <dd className="text-gray-900">{fmtDate(item.created_at)}</dd>
            </div>
            {item.description && (
              <div className="sm:col-span-2">
                <dt className="text-gray-500">Description</dt>
                <dd className="text-gray-900 whitespace-pre-line">{item.description}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Maintenance logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">🔧 Maintenance Logs</CardTitle>
            {canWrite && (
              <Button size="sm" onClick={() => { setLogForm(emptyLog); setShowLogDialog(true) }}>
                + Log Maintenance
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No maintenance recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start justify-between gap-3 border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{log.maintenance_type}</span>
                      <span className="text-xs text-gray-500">{fmtDate(log.maintenance_date)}</span>
                    </div>
                    {log.description && <p className="text-sm text-gray-600 mt-0.5">{log.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                      {log.performed_by && <span>By: {log.performed_by}</span>}
                      {log.cost != null && <span>Cost: ₱{Number(log.cost).toLocaleString('en-PH')}</span>}
                      {log.next_due_date && <span>Next due: {fmtDate(log.next_due_date)}</span>}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="text-xs text-red-500 hover:text-red-700 shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Borrow / deployment history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📦 Borrow / Deployment History</CardTitle>
        </CardHeader>
        <CardContent>
          {borrows.length === 0 ? (
            <p className="text-sm text-gray-400 italic">This item has not been borrowed or deployed.</p>
          ) : (
            <div className="space-y-3">
              {borrows.map((b) => (
                <div key={b.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {b.borrower?.name || b.borrower_name || 'Unknown borrower'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${BORROW_STATUS_BADGE[b.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {BORROW_STATUS_LABELS[b.status] ?? b.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                    <span>
                      {BORROW_DESTINATION_LABELS[b.destination_type] ?? b.destination_type}
                      {b.destination_satellite?.name ? ` · ${b.destination_satellite.name}` : ''}
                      {b.destination_detail ? ` · ${b.destination_detail}` : ''}
                    </span>
                    {b.ministry?.name && <span>Ministry: {b.ministry.name}</span>}
                    {b.borrow_date && <span>Out: {fmtDate(b.borrow_date)}</span>}
                    {b.expected_return_date && <span>Due: {fmtDate(b.expected_return_date)}</span>}
                    {(b.condition_before || b.condition_after) && (
                      <span>
                        Condition: {b.condition_before ?? '—'} → {b.condition_after ?? '—'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log maintenance dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Maintenance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">Date</Label>
                <Input
                  type="date"
                  value={logForm.maintenance_date}
                  onChange={(e) => setLogForm({ ...logForm, maintenance_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Type</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={logForm.maintenance_type}
                  onChange={(e) => setLogForm({ ...logForm, maintenance_type: e.target.value as MaintenanceType })}
                >
                  {MAINTENANCE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="mb-1.5">Description</Label>
              <textarea
                className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Aircon deep cleaning"
                value={logForm.description}
                onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">Performed by</Label>
                <Input
                  placeholder="Person or vendor"
                  value={logForm.performed_by}
                  onChange={(e) => setLogForm({ ...logForm, performed_by: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Cost (₱)</Label>
                <Input
                  type="number"
                  min="0"
                  value={logForm.cost}
                  onChange={(e) => setLogForm({ ...logForm, cost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="mb-1.5">Next maintenance due (optional)</Label>
              <Input
                type="date"
                value={logForm.next_due_date}
                onChange={(e) => setLogForm({ ...logForm, next_due_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveLog} disabled={savingLog}>
              {savingLog ? 'Saving…' : 'Save Log'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
