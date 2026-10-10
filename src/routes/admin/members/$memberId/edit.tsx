// Quest Laguna Directory - Edit Member Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getMemberWithRelations, updateMember, getAllMembersLite } from '../../../../server/functions/members'
import { getSatellites } from '../../../../server/functions/satellites'
import { getAllCellGroups, addMemberToCellGroup, removeMemberFromCellGroup } from '../../../../server/functions/cellGroups'
import { MemberForm } from '../../../../components/MemberForm'
import { activePlainCircle } from '../../../../lib/circleRules'
import { AGAPAY_ENROLL_FAILED_SAVED, disciplerToKeepAfterMove, enrollFailedAfter, withoutUnchangedAgapayFields } from '../../../../lib/agapay'
import { useLivePermission } from '../../../../lib/useLivePermission'
import { useAuth } from '../../../../components/AuthProvider'
import type { Member, MemberInsert, SatelliteRow, CellGroup } from '../../../../lib/types'

// shadcn/ui components
import { Button } from '../../../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card'

export const Route = createFileRoute('/admin/members/$memberId/edit')({
  component: EditMemberPage,
})

function EditMemberPage() {
  const { memberId } = Route.useParams()
  return <EditMemberForm memberId={memberId} />
}

// Edit Member Form
function EditMemberForm({ memberId }: { memberId: string }) {
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const accessToken = session?.access_token ?? ''
  // Moving a member between circles needs cell_groups.write on top of
  // members.write. Without it the Quest Circle field is hidden, so a save
  // never half-fails on permissions. null while the live matrix loads.
  const canWriteCircles = useLivePermission(accessToken, profile?.role, 'cell_groups.write')
  // The save needs members.write (the server enforces it). Without it the
  // page shows "Not permitted." instead of the form. null while loading.
  const canWriteMembers = useLivePermission(accessToken, profile?.role, 'members.write')
  const [member, setMember] = useState<Member | null>(null)
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [cellGroups, setCellGroups] = useState<CellGroup[]>([])
  const [currentCellGroupId, setCurrentCellGroupId] = useState<string | null>(null)
  const [currentCellGroupRole, setCurrentCellGroupRole] = useState<'leader' | 'co_leader' | 'member'>('member')
  // Stage and discipler as last read from the server. Agapay changes them
  // too, so a save writes them only when changed from these values.
  const [loadedAgapay, setLoadedAgapay] = useState<{ discipleship_stage: string; discipler_id: string | null } | null>(null)
  // The stored discipler's name (the profile read finds archived members too),
  // for a discipler the Discipler picker does not list.
  const [currentDiscipler, setCurrentDiscipler] = useState<{ id: string; name: string } | null>(null)
  // Set after a save whose Agapay enrollment failed. The save stands and the
  // page stays, so Save again retries the enrollment.
  const [agapayWarning, setAgapayWarning] = useState(false)
  const [allMembers, setAllMembers] = useState<{ id: string; name: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Circle, discipler and stage as the server has them. The form fields keep
  // the admin's input; only the page's starting point changes.
  const applyServerState = (
    memberData: Member & { cell_groups?: unknown; discipler?: { id: string; name: string } | null },
  ) => {
    // The Quest Circle field moves plain membership only. Start from the
    // member's active plain-member circle, never a circle they lead or a
    // team, so a move or a restore never touches a leader or co-leader row
    // or a team membership.
    const current = activePlainCircle(memberData.cell_groups as Parameters<typeof activePlainCircle>[0])
    setCurrentCellGroupId(current?.cellGroupId ?? null)
    setCurrentCellGroupRole(current?.role ?? 'member')
    setLoadedAgapay({
      discipleship_stage: memberData.discipleship_stage,
      discipler_id: memberData.discipler_id ?? null,
    })
    setCurrentDiscipler(memberData.discipler ?? null)
  }

  // After a failed save, part of it may have gone through (for example the
  // old circle left and the new one refused). Read the real state again so a
  // retry starts from it. Best-effort: a failed read keeps the old values.
  const reloadServerState = async () => {
    try {
      const fresh = await getMemberWithRelations({ data: { accessToken, id: memberId } })
      if (fresh) applyServerState(fresh as Parameters<typeof applyServerState>[0])
    } catch (err) {
      console.error('Error reloading member after a failed save:', err)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    const fetchData = async () => {
      try {
        const [memberData, sats, cgs, membersLite] = await Promise.all([
          getMemberWithRelations({ data: { accessToken, id: memberId } }),
          getSatellites({ data: false }),
          getAllCellGroups({ data: { accessToken, activeOnly: true } }),
          getAllMembersLite({ data: { accessToken } }),
        ])

        if (!memberData) {
          setNotFound(true)
        } else {
          setMember(memberData as Member)
          applyServerState(memberData as Parameters<typeof applyServerState>[0])
        }
        setSatellites(sats)
        setCellGroups(cgs)
        setAllMembers(membersLite)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load member data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [memberId, accessToken])

  const handleSubmit = async (data: MemberInsert, newCellGroupId?: string | null) => {
    setIsSubmitting(true)
    setError(null)
    setAgapayWarning(false)

    try {
      // Stage and discipler only when changed on the form, so a change made
      // in Agapay since this page loaded is not reverted. retryAgapayEnroll:
      // the save also enrolls a member with a discipler who is missing from
      // Agapay or has no checklist, so Save retries a failed enrollment.
      const updates = loadedAgapay ? withoutUnchangedAgapayFields(data, loadedAgapay) : data
      const saved = await updateMember({ data: { accessToken, id: memberId, updates, retryAgapayEnroll: true } })
      // The last Agapay enrollment that ran decides (the circle steps run it too).
      let agapayFailed = enrollFailedAfter(false, saved)

      // Handle Quest Circle change if needed
      if (newCellGroupId !== undefined && newCellGroupId !== currentCellGroupId) {
        if (currentCellGroupId) {
          await removeMemberFromCellGroup({ data: { accessToken, memberId, cellGroupId: currentCellGroupId } })
        }
        if (newCellGroupId) {
          try {
            const added = await addMemberToCellGroup({ data: { accessToken, memberId, cellGroupId: newCellGroupId, role: 'member' } })
            agapayFailed = enrollFailedAfter(agapayFailed, added)
          } catch (addErr) {
            // A refused move changes no circle: put the member back where
            // they were, with the original joined date.
            if (currentCellGroupId) {
              await addMemberToCellGroup({
                data: {
                  accessToken,
                  memberId,
                  cellGroupId: currentCellGroupId,
                  role: currentCellGroupRole,
                  preserveJoinedAt: true,
                },
              }).catch((restoreErr) => console.error('Error restoring previous circle:', restoreErr))
            }
            throw addErr
          }
        }
        // Leaving the old circle clears a discipler who leads or co-leads it,
        // and joining the new one fills in that circle's leader. Only a
        // discipler the admin changed in this save is put back; an unchanged
        // one gives way to the new leader, so discipler and circle agree.
        const keepDiscipler = disciplerToKeepAfterMove(updates, saved)
        if (keepDiscipler) {
          const resaved = await updateMember({ data: { accessToken, id: memberId, updates: { discipler_id: keepDiscipler } } })
          agapayFailed = enrollFailedAfter(agapayFailed, resaved)
        }
      }

      if (agapayFailed) {
        // Saved. Stay on the form with a warning; the next Save retries the
        // enrollment from the state the server now has.
        setAgapayWarning(true)
        await reloadServerState()
        return
      }

      navigate({ to: '/admin', search: { tab: 'members' } })
    } catch (err) {
      console.error('Error updating member:', err)
      setError(err instanceof Error ? err.message : 'Failed to update member')
      await reloadServerState()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/admin', search: { tab: 'members' } })
  }

  if (canWriteMembers === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Not permitted.</h1>
          <p className="text-gray-500 mb-4">An admin grants access.</p>
          <Link
            to="/admin"
            search={{ tab: 'members' }}
            className="px-4 py-2 bg-[#8B1538] text-white rounded-lg hover:bg-[#6B0F2B] transition-colors"
          >
            Back to Members
          </Link>
        </div>
      </div>
    )
  }

  // Also waits for both permissions, so the form never shows before the
  // members.write check and the Quest Circle field never appears after the
  // form is in use.
  if (isLoading || (profile && (canWriteCircles === null || canWriteMembers === null))) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading member...</p>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Member Not Found</h1>
          <p className="text-gray-500 mb-4">The member you're looking for doesn't exist.</p>
          <Link
            to="/admin"
            search={{ tab: 'members' }}
            className="px-4 py-2 bg-[#8B1538] text-white rounded-lg hover:bg-[#6B0F2B] transition-colors"
          >
            Back to Members
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              search={{ tab: 'members' }}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Edit Member</h1>
              <p className="text-red-200 text-xs">{member?.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Member Information</CardTitle>
            <CardDescription>Update the member's details</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            {agapayWarning && !error && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                {AGAPAY_ENROLL_FAILED_SAVED}
              </div>
            )}

            <MemberForm
              member={member}
              satellites={satellites}
              cellGroups={canWriteCircles ? cellGroups : undefined}
              currentCellGroupId={currentCellGroupId}
              allMembers={allMembers}
              currentDisciplerId={member?.discipler_id ?? null}
              currentDiscipler={currentDiscipler}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
