// Admin — Inventory borrow / deployment requests queue.
// Ministry heads submit requests; inventory managers approve, hand out (recording
// condition before), and record the return (condition after). Each record tracks
// the responsible custodian and the deployment destination (satellite / outreach).

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { hasPermission } from '../../../lib/auth'
import { getInventoryItems } from '../../../server/functions/inventory'
import { getAllMembersLite } from '../../../server/functions/members'
import { getAllMinistries } from '../../../server/functions/ministries'
import { getSatellites } from '../../../server/functions/satellites'
import {
  getBorrowRequests,
  createBorrowRequest,
  approveBorrowRequest,
  rejectBorrowRequest,
  checkoutBorrowRequest,
  returnBorrowRequest,
  cancelBorrowRequest,
} from '../../../server/functions/inventoryBorrow'
import {
  BORROW_DESTINATION_TYPES,
  BORROW_DESTINATION_LABELS,
  BORROW_STATUS_LABELS,
  BORROW_STATUS_BADGE,
  INVENTORY_CONDITIONS,
} from '../../../lib/constants'
import type {
  InventoryItem,
  InventoryBorrowRequestWithRelations,
  BorrowStatus,
  BorrowDestinationType,
  Ministry,
  SatelliteRow,
  InventoryCondition,
} from '../../../lib/types'
import { Card, CardContent } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Combobox } from '../../../components/ui/combobox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'

export const Route = createFileRoute('/admin/inventory/requests')({
  component: () => (
    <AdminRoute requiredPermissions={['inventory.read']}>
      <BorrowRequestsPage />
    </AdminRoute>
  ),
})

const STATUS_FILTERS: { value: '' | BorrowStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'checked_out', label: 'Checked out' },
  { value: 'returned', label: 'Returned' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
]

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm'

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    const iso = dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function emptyForm() {
  return {
    item_id: '',
    quantity: 1,
    borrower_member_id: '',
    borrower_name: '',
    ministry_id: '',
    destination_type: 'internal' as BorrowDestinationType,
    destination_satellite_id: '',
    destination_detail: '',
    purpose: '',
    borrow_date: '',
    expected_return_date: '',
    notes: '',
  }
}

function BorrowRequestsPage() {
  const { session, profile } = useAuth()
  const accessToken = session?.access_token
  const canWrite = profile ? hasPermission(profile.role, 'inventory.write') : false

  const [requests, setRequests] = useState<InventoryBorrowRequestWithRelations[]>([])
  const [statusFilter, setStatusFilter] = useState<'' | BorrowStatus>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Dropdown data.
  const [items, setItems] = useState<InventoryItem[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])

  // New-request dialog.
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm())

  // Condition dialog (checkout / return).
  const [conditionAction, setConditionAction] = useState<{
    id: string
    mode: 'checkout' | 'return'
  } | null>(null)
  const [conditionValue, setConditionValue] = useState<InventoryCondition>('Good')
  const [conditionSaving, setConditionSaving] = useState(false)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const rows = await getBorrowRequests({
        data: { accessToken, status: statusFilter || undefined },
      })
      setRequests(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }, [accessToken, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  // Load dropdown data once.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [its, mems, mins, sats] = await Promise.all([
          getInventoryItems({ data: { sortBy: 'name', sortOrder: 'asc' } }),
          getAllMembersLite(),
          getAllMinistries({ data: { activeOnly: true } }),
          getSatellites({ data: false }),
        ])
        if (cancelled) return
        setItems(its)
        setMembers(mems)
        setMinistries(mins)
        setSatellites(sats)
      } catch {
        // Dropdowns will simply be empty on failure; the queue still works.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === 'pending').length,
    [requests],
  )

  const handleCreate = async () => {
    if (!accessToken) return
    if (!form.item_id) {
      alert('Select an item')
      return
    }
    if (!form.borrower_member_id && !form.borrower_name.trim()) {
      alert('Select a responsible borrower or enter a name')
      return
    }
    if (form.destination_type === 'satellite' && !form.destination_satellite_id) {
      alert('Select the destination satellite')
      return
    }
    setSaving(true)
    try {
      await createBorrowRequest({
        data: {
          accessToken,
          item_id: form.item_id,
          quantity: form.quantity,
          borrower_member_id: form.borrower_member_id || null,
          borrower_name: form.borrower_name.trim() || null,
          ministry_id: form.ministry_id || null,
          destination_type: form.destination_type,
          destination_satellite_id: form.destination_satellite_id || null,
          destination_detail: form.destination_detail.trim() || null,
          purpose: form.purpose.trim() || null,
          borrow_date: form.borrow_date || null,
          expected_return_date: form.expected_return_date || null,
          notes: form.notes.trim() || null,
        },
      })
      setShowForm(false)
      setForm(emptyForm())
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setSaving(false)
    }
  }

  const runAction = async (fn: () => Promise<unknown>) => {
    if (!accessToken) return
    try {
      await fn()
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    }
  }

  const handleApprove = (id: string) =>
    runAction(() => approveBorrowRequest({ data: { accessToken: accessToken!, id } }))

  const handleReject = (id: string) => {
    const notes = window.prompt('Reason for rejection (optional):') ?? undefined
    return runAction(() => rejectBorrowRequest({ data: { accessToken: accessToken!, id, notes } }))
  }

  const handleCancel = (id: string) => {
    if (!confirm('Cancel this request?')) return
    return runAction(() => cancelBorrowRequest({ data: { accessToken: accessToken!, id } }))
  }

  const openCondition = (id: string, mode: 'checkout' | 'return') => {
    setConditionValue('Good')
    setConditionAction({ id, mode })
  }

  const handleConditionSubmit = async () => {
    if (!accessToken || !conditionAction) return
    setConditionSaving(true)
    try {
      if (conditionAction.mode === 'checkout') {
        await checkoutBorrowRequest({
          data: { accessToken, id: conditionAction.id, condition_before: conditionValue },
        })
      } else {
        await returnBorrowRequest({
          data: { accessToken, id: conditionAction.id, condition_after: conditionValue },
        })
      }
      setConditionAction(null)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setConditionSaving(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="text-sm text-[#8B1538] hover:underline">← Back to Inventory</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Borrow &amp; Deployment Requests</h1>
          <p className="text-sm text-gray-500">
            {pendingCount > 0 ? `${pendingCount} pending approval` : 'No pending approvals'}
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm()); setShowForm(true) }}>+ New Request</Button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              statusFilter === f.value
                ? 'bg-[#8B1538] text-white border-[#8B1538]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading requests…</p>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-400">No requests found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/admin/inventory/$itemId"
                        params={{ itemId: r.item_id }}
                        className="text-sm font-semibold text-gray-900 hover:text-[#8B1538] hover:underline"
                      >
                        {r.item?.name || 'Unknown item'}
                      </Link>
                      {r.quantity > 1 && <span className="text-xs text-gray-500">×{r.quantity}</span>}
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${BORROW_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {BORROW_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">
                      Responsible: <span className="font-medium">{r.borrower?.name || r.borrower_name || '—'}</span>
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                      <span>
                        {BORROW_DESTINATION_LABELS[r.destination_type] ?? r.destination_type}
                        {r.destination_satellite?.name ? ` · ${r.destination_satellite.name}` : ''}
                        {r.destination_detail ? ` · ${r.destination_detail}` : ''}
                      </span>
                      {r.ministry?.name && <span>Ministry: {r.ministry.name}</span>}
                      {r.borrow_date && <span>Out: {fmtDate(r.borrow_date)}</span>}
                      {r.expected_return_date && <span>Due: {fmtDate(r.expected_return_date)}</span>}
                    </div>
                    {r.purpose && <p className="text-xs text-gray-500 mt-1">Purpose: {r.purpose}</p>}
                    {(r.condition_before || r.condition_after) && (
                      <p className="text-xs text-gray-500 mt-1">
                        Condition: {r.condition_before ?? '—'} → {r.condition_after ?? '—'}
                      </p>
                    )}
                    {r.status === 'rejected' && r.notes && (
                      <p className="text-xs text-red-500 mt-1">Rejected: {r.notes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {r.status === 'pending' && canWrite && (
                      <>
                        <Button size="sm" onClick={() => handleApprove(r.id)}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(r.id)}>Reject</Button>
                      </>
                    )}
                    {r.status === 'approved' && canWrite && (
                      <Button size="sm" onClick={() => openCondition(r.id, 'checkout')}>Check Out</Button>
                    )}
                    {r.status === 'checked_out' && canWrite && (
                      <Button size="sm" onClick={() => openCondition(r.id, 'return')}>Record Return</Button>
                    )}
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <Button size="sm" variant="outline" onClick={() => handleCancel(r.id)}>Cancel</Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New request dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Borrow / Deployment Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="mb-1.5">Item *</Label>
                <Combobox
                  placeholder="Search item…"
                  options={items.map((it) => ({ value: it.id, label: `${it.name} (${it.location})` }))}
                  value={form.item_id}
                  onChange={(v) => setForm({ ...form, item_id: v })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Qty</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5">Responsible member</Label>
              <Combobox
                placeholder="Search member…"
                emptyText="No member found"
                allowClear
                options={members.map((m) => ({ value: m.id, label: m.name }))}
                value={form.borrower_member_id}
                onChange={(v) => setForm({ ...form, borrower_member_id: v })}
              />
              {!form.borrower_member_id && (
                <Input
                  className="mt-2"
                  placeholder="…or enter responsible person's name"
                  value={form.borrower_name}
                  onChange={(e) => setForm({ ...form, borrower_name: e.target.value })}
                />
              )}
            </div>

            <div>
              <Label className="mb-1.5">Requesting ministry (optional)</Label>
              <Combobox
                placeholder="Search ministry…"
                emptyText="No ministry found"
                allowClear
                options={ministries.map((m) => ({ value: m.id, label: m.name }))}
                value={form.ministry_id}
                onChange={(v) => setForm({ ...form, ministry_id: v })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">Destination *</Label>
                <select
                  className={selectClass}
                  value={form.destination_type}
                  onChange={(e) =>
                    setForm({ ...form, destination_type: e.target.value as BorrowDestinationType })
                  }
                >
                  {BORROW_DESTINATION_TYPES.map((d) => (
                    <option key={d} value={d}>{BORROW_DESTINATION_LABELS[d]}</option>
                  ))}
                </select>
              </div>
              {form.destination_type === 'satellite' ? (
                <div>
                  <Label className="mb-1.5">Satellite *</Label>
                  <select
                    className={selectClass}
                    value={form.destination_satellite_id}
                    onChange={(e) => setForm({ ...form, destination_satellite_id: e.target.value })}
                  >
                    <option value="">Select…</option>
                    {satellites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <Label className="mb-1.5">Location detail</Label>
                  <Input
                    placeholder={form.destination_type === 'outreach' ? 'Outreach program' : 'Where'}
                    value={form.destination_detail}
                    onChange={(e) => setForm({ ...form, destination_detail: e.target.value })}
                  />
                </div>
              )}
            </div>

            {form.destination_type === 'satellite' && (
              <div>
                <Label className="mb-1.5">Location detail (optional)</Label>
                <Input
                  placeholder="e.g. specific event / room"
                  value={form.destination_detail}
                  onChange={(e) => setForm({ ...form, destination_detail: e.target.value })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5">Borrow date</Label>
                <Input
                  type="date"
                  value={form.borrow_date}
                  onChange={(e) => setForm({ ...form, borrow_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5">Expected return</Label>
                <Input
                  type="date"
                  value={form.expected_return_date}
                  onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label className="mb-1.5">Purpose</Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Why is this being borrowed?"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Condition dialog (checkout / return) */}
      <Dialog open={conditionAction !== null} onOpenChange={(o) => !o && setConditionAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {conditionAction?.mode === 'checkout' ? 'Check Out Item' : 'Record Return'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="mb-1.5">
              {conditionAction?.mode === 'checkout' ? 'Condition before hand-out' : 'Condition on return'}
            </Label>
            <select
              className={selectClass}
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value as InventoryCondition)}
            >
              {INVENTORY_CONDITIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {conditionAction?.mode === 'return' && (
              <p className="text-xs text-gray-500 mt-2">
                This updates the item's current condition to match.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConditionAction(null)}>Cancel</Button>
            <Button onClick={handleConditionSubmit} disabled={conditionSaving}>
              {conditionSaving ? 'Saving…' : conditionAction?.mode === 'checkout' ? 'Check Out' : 'Record Return'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
