// Review UI for member-claim sign-ups. Shared by the leader view
// (/profile/circle) and the admin view (/admin/claims) so both show the same
// evidence and the same actions.

import { useState } from 'react'
import { claimReasonLabel, type ClaimReason } from '../lib/memberClaim'
import { CLAIM_STATUS_LABELS } from '../lib/constants'
import type { ClaimCandidateView, ClaimQueueItem } from '../lib/types'

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface ClaimQueueProps {
  items: ClaimQueueItem[]
  /** Show which circle each request came from (admin view). */
  showGroup?: boolean
  /** Admin-only: undo a completed link. */
  onUndo?: (claimId: string) => Promise<void>
  onConfirm: (claimId: string, memberId: string, addToGroup: boolean) => Promise<void>
  onCreateMember: (claimId: string) => Promise<void>
  onReject: (claimId: string, note: string | null) => Promise<void>
  busyClaimId?: string | null
  emptyMessage?: string
}

export function ClaimQueue({
  items,
  showGroup = false,
  onUndo,
  onConfirm,
  onCreateMember,
  onReject,
  busyClaimId,
  emptyMessage = 'No sign-ups waiting for review.',
}: ClaimQueueProps) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-xl border border-gray-200">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <ClaimCard
          key={item.claim.id}
          item={item}
          showGroup={showGroup}
          onUndo={onUndo}
          onConfirm={onConfirm}
          onCreateMember={onCreateMember}
          onReject={onReject}
          busy={busyClaimId === item.claim.id}
        />
      ))}
    </div>
  )
}

interface ClaimCardProps {
  item: ClaimQueueItem
  showGroup: boolean
  onUndo?: (claimId: string) => Promise<void>
  onConfirm: (claimId: string, memberId: string, addToGroup: boolean) => Promise<void>
  onCreateMember: (claimId: string) => Promise<void>
  onReject: (claimId: string, note: string | null) => Promise<void>
  busy: boolean
}

function ClaimCard({ item, showGroup, onUndo, onConfirm, onCreateMember, onReject, busy }: ClaimCardProps) {
  const { claim, candidates } = item
  const [addToGroup, setAddToGroup] = useState(true)
  const [confirmingCreate, setConfirmingCreate] = useState(false)
  const isPending = claim.status === 'pending'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* What the person typed */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {/* min-w-0 + break-words: long emails must wrap on a phone, not clip. */}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 break-words">{claim.submitted_name}</p>
            <p className="text-sm text-gray-600 break-all">{claim.submitted_email}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 break-words">
              {claim.submitted_phone && <span>📱 {claim.submitted_phone}</span>}
              {claim.submitted_birthday && <span>🎂 {claim.submitted_birthday}</span>}
              {showGroup && item.cell_group_name && <span>⭕ {item.cell_group_name}</span>}
              <span>🕑 {formatDateTime(claim.created_at)}</span>
            </div>
          </div>
          <StatusBadge status={claim.status} />
        </div>
      </div>

      {isPending ? (
        <div className="p-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">
              No matching record. New to the church: Create new member.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-3">
                Possible matches:
              </p>
              <div className="space-y-2 mb-4">
                {candidates.map((cand, idx) => (
                  <CandidateRow
                    key={cand.id}
                    candidate={cand}
                    best={idx === 0}
                    busy={busy}
                    onPick={() => onConfirm(claim.id, cand.id, addToGroup)}
                  />
                ))}
              </div>
              {claim.cell_group_id && (
                <label className="flex items-center gap-3 mb-4 py-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addToGroup}
                    onChange={(e) => setAddToGroup(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-[#8B1538] focus:ring-[#8B1538]"
                  />
                  Add to this circle as a disciple
                </label>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
            {confirmingCreate ? (
              <>
                <span className="text-sm text-gray-600 self-center">
                  New member record: confirm.
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    await onCreateMember(claim.id)
                    setConfirmingCreate(false)
                  }}
                  className="min-h-11 px-4 py-2.5 text-sm font-semibold bg-[#8B1538] hover:bg-[#6B0F2B] disabled:opacity-60 text-white rounded-lg"
                >
                  Create record
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCreate(false)}
                  className="min-h-11 px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingCreate(true)}
                  className="min-h-11 px-4 py-2.5 text-sm font-semibold border border-[#8B1538] text-[#8B1538] hover:bg-[#8B1538]/5 disabled:opacity-60 rounded-lg"
                >
                  Create new member
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReject(claim.id, null)}
                  className="min-h-11 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 disabled:opacity-60"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">
            {item.matched_member_name ? (
              <>
                Linked to <span className="font-semibold">{item.matched_member_name}</span>
              </>
            ) : claim.status === 'rejected' ? (
              <>Rejected{claim.note ? `: ${claim.note}` : ''}</>
            ) : (
              'Not linked to a member record'
            )}
          </p>
          {onUndo && claim.matched_member_id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onUndo(claim.id)}
              className="min-h-11 px-4 py-2.5 text-sm text-gray-600 hover:text-red-600 disabled:opacity-60"
            >
              Undo link
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CandidateRow({
  candidate,
  best,
  busy,
  onPick,
}: {
  candidate: ClaimCandidateView
  best: boolean
  busy: boolean
  onPick: () => void
}) {
  const pct = Math.round(candidate.score * 100)
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border ${
        best ? 'border-[#8B1538]/40 bg-[#8B1538]/5' : 'border-gray-200'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-gray-900 break-words">{candidate.name}</span>
          <span className="text-xs font-semibold text-[#8B1538]">{pct}% match</span>
          {best && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide bg-[#8B1538] text-white rounded-full">
              Best match
            </span>
          )}
          {candidate.already_linked && (
            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded-full">
              Account exists
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          {candidate.email && <span className="break-all">{candidate.email}</span>}
          {candidate.phone && <span>{candidate.phone}</span>}
          {candidate.satellite_name && <span>{candidate.satellite_name}</span>}
          {candidate.giving_total > 0 && (
            <span className="text-emerald-700">Giving on record: {formatPeso(candidate.giving_total)}</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {candidate.reasons.map((r) => (
            <span key={r} className="px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
              {claimReasonLabel(r as ClaimReason)}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={busy || candidate.already_linked}
        onClick={onPick}
        title={candidate.already_linked ? 'Linked to another account' : undefined}
        className="shrink-0 min-h-11 px-4 py-2.5 text-sm font-semibold bg-[#8B1538] hover:bg-[#6B0F2B] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg"
      >
        Link record
      </button>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'pending'
      ? 'bg-amber-100 text-amber-800'
      : status === 'rejected'
        ? 'bg-red-100 text-red-700'
        : 'bg-emerald-100 text-emerald-800'
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${tone}`}>
      {CLAIM_STATUS_LABELS[status] ?? status}
    </span>
  )
}
