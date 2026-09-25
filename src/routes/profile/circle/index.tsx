// Leader view: run the sign-up link for the Quest Circles you lead and review
// the member-claim requests that come in from its QR code.
//
// Deliberately under /profile, not /admin: circle leaders normally hold the
// `member` role, which the admin dashboard tabs are not built for.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { SignupQRCard } from '../../../components/SignupQRCard'
import { ClaimQueue } from '../../../components/ClaimQueue'
import {
  getMyLedGroups,
  getClaimQueue,
  setGroupSignupEnabled,
  regenerateGroupSignupToken,
  confirmClaim,
  createMemberFromClaim,
  rejectClaim,
} from '../../../server/functions/memberClaims'
import type { ClaimQueueItem, LedCircle } from '../../../lib/types'

export const Route = createFileRoute('/profile/circle/')({
  component: MyCirclePage,
})

function MyCirclePage() {
  const { session, isAuthenticated, isLoading: authLoading } = useAuth()
  const accessToken = session?.access_token

  const [loading, setLoading] = useState(true)
  const [circles, setCircles] = useState<LedCircle[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [queue, setQueue] = useState<ClaimQueueItem[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyClaimId, setBusyClaimId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [confirmingRotate, setConfirmingRotate] = useState(false)

  const selected = circles.find((c) => c.id === selectedId) ?? null

  const loadCircles = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const rows = await getMyLedGroups({ data: { accessToken } })
      setCircles(rows)
      setSelectedId((prev) => prev ?? rows[0]?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Circles failed to load. Retry.')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  const loadQueue = useCallback(async () => {
    if (!accessToken || !selectedId) {
      setQueue([])
      return
    }
    setQueueLoading(true)
    try {
      const rows = await getClaimQueue({
        data: {
          accessToken,
          cellGroupId: selectedId,
          status: showResolved ? 'confirmed' : 'pending',
        },
      })
      setQueue(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up requests failed to load. Retry.')
    } finally {
      setQueueLoading(false)
    }
  }, [accessToken, selectedId, showResolved])

  useEffect(() => {
    loadCircles()
  }, [loadCircles])

  useEffect(() => {
    loadQueue()
  }, [loadQueue])

  const refresh = async () => {
    await Promise.all([loadCircles(), loadQueue()])
  }

  const withBusy = async (claimId: string, fn: () => Promise<unknown>) => {
    setBusyClaimId(claimId)
    setError('')
    try {
      await fn()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed. Retry.')
    } finally {
      setBusyClaimId(null)
    }
  }

  const toggleSignup = async (enabled: boolean) => {
    if (!accessToken || !selectedId) return
    setError('')
    try {
      await setGroupSignupEnabled({ data: { accessToken, cellGroupId: selectedId, enabled } })
      await loadCircles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up link update failed. Retry.')
    }
  }

  const rotateToken = async () => {
    if (!accessToken || !selectedId) return
    setError('')
    try {
      await regenerateGroupSignupToken({ data: { accessToken, cellGroupId: selectedId } })
      setConfirmingRotate(false)
      await loadCircles()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Link replacement failed. Retry.')
    }
  }

  if (authLoading || loading) {
    return <CenteredNote>Loading…</CenteredNote>
  }

  if (!isAuthenticated) {
    return (
      <CenteredNote>
        Sign-in required. <Link to="/auth/login" className="text-[#8B1538] font-semibold underline">Sign in</Link>
      </CenteredNote>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Quest Circle</h1>
            <p className="text-sm text-gray-500">Sign-up QR and member requests</p>
          </div>
          <Link to="/profile" className="text-sm text-[#8B1538] font-semibold hover:underline">
            Back to profile
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {circles.length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-gray-200 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">No circle led</h2>
            <p className="text-gray-600 text-sm">
              Circle leaders only. Admin setup: Admin → Users → Link member record, then set the
              circle leader.
            </p>
          </div>
        ) : (
          <>
            {circles.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {circles.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`min-h-11 px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                      c.id === selectedId
                        ? 'bg-[#8B1538] text-white border-[#8B1538]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {c.name}
                    {c.pending_count > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-400 text-amber-900 rounded-full">
                        {c.pending_count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <section className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 break-words">{selected.name}</h2>
                    <p className="text-sm text-gray-500">
                      {selected.member_count} member{selected.member_count === 1 ? '' : 's'}
                      {selected.satellite_name ? ` · ${selected.satellite_name}` : ''}
                    </p>
                  </div>
                  <label className="flex items-center gap-3 py-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.signup_enabled}
                      onChange={(e) => toggleSignup(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-[#8B1538] focus:ring-[#8B1538]"
                    />
                    <span className="font-medium text-gray-700">Sign-up link active</span>
                  </label>
                </div>

                <div className="mt-5 flex flex-col items-center">
                  <SignupQRCard
                    token={selected.signup_token}
                    groupName={selected.name}
                    enabled={selected.signup_enabled}
                  />
                </div>

                <div className="mt-5 pt-4 border-t border-gray-100 text-center">
                  {confirmingRotate ? (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <span className="text-sm text-gray-600">
                        Old QR code stops working.
                      </span>
                      <button
                        type="button"
                        onClick={rotateToken}
                        className="min-h-11 px-4 py-2.5 text-sm font-semibold bg-[#8B1538] hover:bg-[#6B0F2B] text-white rounded-lg"
                      >
                        Replace link
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingRotate(false)}
                        className="min-h-11 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingRotate(true)}
                      className="min-h-11 px-2 text-sm text-gray-500 hover:text-[#8B1538]"
                    >
                      Replace link
                    </button>
                  )}
                </div>
              </section>
            )}

            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  {showResolved ? 'Already linked' : 'Waiting for review'}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowResolved((v) => !v)}
                  className="text-sm text-[#8B1538] font-semibold hover:underline"
                >
                  {showResolved ? 'Show pending' : 'Show linked'}
                </button>
              </div>

              {queueLoading ? (
                <CenteredNote>Loading requests…</CenteredNote>
              ) : (
                <ClaimQueue
                  items={queue}
                  busyClaimId={busyClaimId}
                  emptyMessage={
                    showResolved
                      ? 'No linked sign-ups.'
                      : 'No pending sign-ups.'
                  }
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
                />
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <p className="text-gray-500 text-center">{children}</p>
    </div>
  )
}
