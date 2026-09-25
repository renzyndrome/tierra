// Admin — member claim requests across every Quest Circle.
//
// Leaders review their own circle at /profile/circle; this is the church-wide
// view, and the only place a completed link can be undone.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { ClaimQueue } from '../../../components/ClaimQueue'
import {
  getClaimQueue,
  confirmClaim,
  createMemberFromClaim,
  rejectClaim,
  undoClaimLink,
} from '../../../server/functions/memberClaims'
import { CLAIM_STATUS_LABELS } from '../../../lib/constants'
import type { ClaimQueueItem, ClaimStatus } from '../../../lib/types'

export const Route = createFileRoute('/admin/claims/')({
  component: () => (
    <AdminRoute requiredPermissions={['cell_groups.write']}>
      <AdminClaimsPage />
    </AdminRoute>
  ),
})

const STATUSES: ClaimStatus[] = ['pending', 'auto_linked', 'confirmed', 'new_member', 'rejected']

function AdminClaimsPage() {
  const { session } = useAuth()
  const accessToken = session?.access_token

  const [status, setStatus] = useState<ClaimStatus>('pending')
  const [items, setItems] = useState<ClaimQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      setItems(await getClaimQueue({ data: { accessToken, status } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up requests failed to load. Retry.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, status])

  useEffect(() => {
    load()
  }, [load])

  const withBusy = async (claimId: string, fn: () => Promise<unknown>) => {
    setBusyClaimId(claimId)
    setError('')
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed. Retry.')
    } finally {
      setBusyClaimId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Member sign-ups</h1>
            <p className="text-sm text-gray-500">
              Member record claims from Quest Circle QR codes
            </p>
          </div>
          <Link to="/admin" className="text-sm text-[#8B1538] font-semibold hover:underline">
            Back to admin
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`min-h-11 px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                s === status
                  ? 'bg-[#8B1538] text-white border-[#8B1538]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
              }`}
            >
              {CLAIM_STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="p-8 text-center text-gray-500">Loading…</p>
        ) : (
          <ClaimQueue
            items={items}
            showGroup
            busyClaimId={busyClaimId}
            emptyMessage={`No ${CLAIM_STATUS_LABELS[status].toLowerCase()} sign-ups.`}
            onConfirm={(claimId, memberId, addToGroup) =>
              withBusy(claimId, () =>
                confirmClaim({ data: { accessToken: accessToken!, claimId, memberId, addToGroup } }),
              )
            }
            onCreateMember={(claimId) =>
              withBusy(claimId, () =>
                createMemberFromClaim({ data: { accessToken: accessToken!, claimId } }),
              )
            }
            onReject={(claimId, note) =>
              withBusy(claimId, () =>
                rejectClaim({ data: { accessToken: accessToken!, claimId, note } }),
              )
            }
            onUndo={(claimId) =>
              withBusy(claimId, () => undoClaimLink({ data: { accessToken: accessToken!, claimId } }))
            }
          />
        )}
      </main>
    </div>
  )
}
