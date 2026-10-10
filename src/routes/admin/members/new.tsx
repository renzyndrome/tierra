// Quest Laguna Directory - Add New Member Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createMember, getAllMembersLite } from '../../../server/functions/members'
import { getSatellites } from '../../../server/functions/satellites'
import { getAllCellGroups, addMemberToCellGroup } from '../../../server/functions/cellGroups'
import { MemberForm } from '../../../components/MemberForm'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT, enrollFailedAfter } from '../../../lib/agapay'
import { useLivePermission } from '../../../lib/useLivePermission'
import { createFormCircleProps } from '../../../lib/circleRules'
import type { MemberInsert, SatelliteRow, CellGroup } from '../../../lib/types'

// shadcn/ui components
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'

export const Route = createFileRoute('/admin/members/new')({
  component: () => (
    <AdminRoute requiredPermissions={['members.write']}>
      <NewMemberForm />
    </AdminRoute>
  ),
})

// New Member Form
function NewMemberForm() {
  const navigate = useNavigate()
  const { session, profile } = useAuth()
  const accessToken = session?.access_token ?? ''
  // Adding to a circle needs cell_groups.write on top of members.write. Without
  // it the Quest Circle field is hidden, so a save never half-fails on
  // permissions. null while the live permission matrix loads.
  const canWriteCircles = useLivePermission(accessToken, profile?.role, 'cell_groups.write')
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [allMembers, setAllMembers] = useState<{ id: string; name: string }[]>([])
  const [cellGroups, setCellGroups] = useState<CellGroup[]>([])
  // The Discipler field waits for this list (see MemberForm circlesLoad).
  const [circlesLoad, setCirclesLoad] = useState<'loading' | 'loaded' | 'failed'>('loading')
  // Set when the member was created but the Quest Circle add was refused, or
  // the Agapay enrollment failed. The form is replaced by this result.
  const [createdNotice, setCreatedNotice] = useState<{
    memberId: string
    circleReason: string | null
    agapayFailed: boolean
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSatellites = async () => {
      try {
        const sats = await getSatellites({ data: false }) // Only active satellites
        setSatellites(sats)
      } catch (err) {
        console.error('Error fetching satellites:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSatellites()
  }, [])

  // Discipler choices. Loaded separately (needs the session) so a failure
  // only hides the Discipler field and never blocks the form.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    getAllMembersLite({ data: { accessToken } })
      .then((members) => {
        if (!cancelled) setAllMembers(members)
      })
      .catch((err) => console.error('Error fetching members:', err))
    return () => {
      cancelled = true
    }
  }, [accessToken])

  // Quest Circle choices. Loaded the same way: a failure hides the Quest
  // Circle field and shows a reload line instead, so no circle is set.
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    getAllCellGroups({ data: { accessToken, activeOnly: true } })
      .then((groups) => {
        if (cancelled) return
        setCellGroups(groups)
        setCirclesLoad('loaded')
      })
      .catch((err) => {
        console.error('Error fetching Quest Circles:', err)
        if (!cancelled) setCirclesLoad('failed')
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  const handleSubmit = async (data: MemberInsert, cellGroupId?: string | null) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const created = await createMember({ data: { ...data, accessToken } })
      // The last Agapay enrollment that ran decides (the circle add may run one too).
      let agapayFailed = enrollFailedAfter(false, created)
      let circleReason: string | null = null

      if (cellGroupId) {
        try {
          const added = await addMemberToCellGroup({
            data: { accessToken, memberId: created.id, cellGroupId, role: 'member' },
          })
          agapayFailed = enrollFailedAfter(agapayFailed, added)
        } catch (addErr) {
          // The member stays created. Show the refusal instead of leaving
          // silently; the form is replaced so Save cannot create a duplicate.
          console.error('Error adding new member to Quest Circle:', addErr)
          circleReason = addErr instanceof Error ? addErr.message : 'Failed to add member to Quest Circle'
        }
      }

      if (circleReason || agapayFailed) {
        setCreatedNotice({ memberId: created.id, circleReason, agapayFailed })
        return
      }

      navigate({ to: '/admin', search: { tab: 'members' } })
    } catch (err) {
      console.error('Error creating member:', err)
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/admin', search: { tab: 'members' } })
  }

  // No cell_groups.write: no Quest Circle field. See createFormCircleProps.
  const circleProps = createFormCircleProps(canWriteCircles, circlesLoad, cellGroups)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
              <h1 className="text-xl font-bold text-white">Add New Member</h1>
              <p className="text-red-200 text-xs">Quest Laguna Directory</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Member Information</CardTitle>
            <CardDescription>Fill in the details for the new member</CardDescription>
          </CardHeader>
          <CardContent>
            {createdNotice ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <p className="font-medium">
                    {createdNotice.circleReason ? 'Member created. Quest Circle not set.' : 'Member created.'}
                  </p>
                  {createdNotice.circleReason && <p className="mt-1">{createdNotice.circleReason}</p>}
                  {createdNotice.agapayFailed && <p className="mt-1">{AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT}</p>}
                </div>
                <div className="flex justify-end gap-3">
                  <Link
                    to="/admin"
                    search={{ tab: 'members' }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Back to Members
                  </Link>
                  <Link
                    to="/admin/members/$memberId/edit"
                    params={{ memberId: createdNotice.memberId }}
                    className="px-4 py-2 text-white bg-[#8B1538] rounded-lg hover:bg-[#6B0F2B] transition-colors"
                  >
                    Edit Member
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <MemberForm
                  satellites={satellites}
                  cellGroups={circleProps.cellGroups}
                  circlesLoad={circleProps.circlesLoad}
                  allMembers={allMembers}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                  isSubmitting={isSubmitting}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
