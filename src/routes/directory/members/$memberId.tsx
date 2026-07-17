// Quest Laguna Directory - Member Profile Page
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { getMemberWithRelations, updateMember } from '../../../server/functions/members'
import { addMemberToMinistry } from '../../../server/functions/ministries'
import { getAllMinistries } from '../../../server/functions/ministries'
import { addMemberToCellGroup } from '../../../server/functions/cellGroups'
import { getAllCellGroups } from '../../../server/functions/cellGroups'
import { MemberAttendanceSection } from '../../../components/MemberAttendanceSection'
import { getPlaceholderAvatar, uploadMemberPhoto } from '../../../lib/storage'
import {
  DISCIPLESHIP_JOURNEY_STAGES,
  LEADERSHIP_LEVELS,
  FOLLOW_THROUGH_STAGES,
  STAGE_LABELS,
} from '../../../lib/constants'
import type { DiscipleshipJourney, Ministry, CellGroup } from '../../../lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'

export const Route = createFileRoute('/directory/members/$memberId')({
  // Member data is fetched CLIENT-SIDE (below), not in an SSR loader, so member
  // PII is never rendered/serialized server-side for anonymous visitors. The
  // global AuthGate redirects unauthenticated users before this ever renders.
  component: MemberProfilePage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Member Not Found</h1>
        <p className="text-gray-600 mb-4">{error.message}</p>
        <Link
          to="/admin/members"
          className="text-[#8B1538] hover:underline"
        >
          Back to Members
        </Link>
      </div>
    </div>
  ),
})

// ============================================
// BADGE HELPERS
// ============================================

const stageBadgeColors: Record<string, string> = {
  Newbie: 'bg-amber-100 text-amber-800',
  Growing: 'bg-teal-100 text-teal-800',
  Leader: 'bg-slate-200 text-slate-800',
}

const statusBadgeColors: Record<string, string> = {
  visitor: 'bg-gray-100 text-gray-800',
  regular: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-red-100 text-red-800',
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${className}`}>
      {children}
    </span>
  )
}

// ============================================
// PROGRESS BAR FOR DISCIPLESHIP JOURNEY
// ============================================

function JourneyProgressBar({ journey }: { journey: DiscipleshipJourney | null }) {
  if (!journey) return null

  const totalSteps = DISCIPLESHIP_JOURNEY_STAGES.length
  const currentIndex = DISCIPLESHIP_JOURNEY_STAGES.findIndex((s) => s.value === journey)
  if (currentIndex === -1) return null

  const currentStep = currentIndex + 1
  const percentage = (currentStep / totalSteps) * 100
  const stage = DISCIPLESHIP_JOURNEY_STAGES[currentIndex]

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{stage.label}</span>
        <span className="text-xs text-gray-500">
          Step {currentStep} of {totalSteps}
        </span>
      </div>
      <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#8B1538] rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{stage.description}</p>
    </div>
  )
}

// ============================================
// SECTION CARD COMPONENT
// ============================================

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ============================================
// SECTION CARD WITH ACTION BUTTON
// ============================================

function SectionCardWithAction({
  title,
  icon,
  actionLabel,
  onAction,
  children,
}: {
  title: string
  icon: string
  actionLabel: string
  onAction: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <button
          onClick={onAction}
          className="text-xs font-medium text-[#8B1538] hover:text-[#6B0F2B] hover:bg-[#8B1538]/5 px-2.5 py-1 rounded-md transition-colors"
        >
          {actionLabel}
        </button>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

// ============================================
// INFO ROW COMPONENT
// ============================================

function InfoRow({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-sm text-gray-500 w-24 shrink-0">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#8B1538] hover:underline break-all"
        >
          {value}
        </a>
      ) : (
        <span className="text-sm text-gray-900 break-all">{value}</span>
      )}
    </div>
  )
}

// ============================================
// LEADER CHIP COMPONENT
// ============================================

function LeaderChip({
  leader,
  label,
}: {
  leader: { id: string; name: string; photo_url?: string | null } | null | undefined
  label: string
}) {
  if (!leader) return null
  return (
    <Link
      to="/directory/members/$memberId"
      params={{ memberId: leader.id }}
      className="inline-flex items-center gap-1.5 group"
    >
      <img
        src={leader.photo_url || getPlaceholderAvatar(leader.name)}
        alt={leader.name}
        className="w-5 h-5 rounded-full object-cover"
      />
      <span className="text-xs text-gray-600 group-hover:text-[#8B1538] group-hover:underline truncate">
        {leader.name}
      </span>
      <span className="text-[10px] text-gray-400 shrink-0">· {label}</span>
    </Link>
  )
}

// ============================================
// MAIN PROFILE COMPONENT
// ============================================

function MemberProfilePage() {
  const { memberId } = Route.useParams()
  const [member, setMember] = useState<any>(null)
  const [memberLoading, setMemberLoading] = useState(true)
  const [memberError, setMemberError] = useState('')

  const reloadMember = useCallback(async () => {
    try {
      const data = await getMemberWithRelations({ data: { id: memberId } })
      if (data) {
        setMember(data)
        setMemberError('')
      } else {
        setMember(null)
        setMemberError('Member not found')
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to load member')
    } finally {
      setMemberLoading(false)
    }
  }, [memberId])

  useEffect(() => {
    reloadMember()
  }, [reloadMember])

  const avatarUrl = member ? member.photo_url || getPlaceholderAvatar(member.name) : null
  const satelliteName = (member as any)?.satellite?.name || null

  // Safely access relations
  const cellGroups = ((member as any)?.cell_groups || []).filter((cg: any) => cg.is_active)
  const ministries = ((member as any)?.ministries || []).filter((m: any) => m.is_active)

  // Quick action state
  const [showMinistryDialog, setShowMinistryDialog] = useState(false)
  const [showCellGroupDialog, setShowCellGroupDialog] = useState(false)
  const [allMinistries, setAllMinistries] = useState<Ministry[]>([])
  const [allCellGroups, setAllCellGroups] = useState<CellGroup[]>([])
  const [selectedMinistryId, setSelectedMinistryId] = useState('')
  const [selectedMinistryRole, setSelectedMinistryRole] = useState<'head' | 'coordinator' | 'volunteer'>('volunteer')
  const [selectedCellGroupId, setSelectedCellGroupId] = useState('')
  const [selectedCellGroupRole, setSelectedCellGroupRole] = useState<'leader' | 'co_leader' | 'member'>('member')
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)

  // Fetch ministries/cell groups for dropdowns when dialogs open
  useEffect(() => {
    if (showMinistryDialog && allMinistries.length === 0) {
      getAllMinistries({ data: { activeOnly: true } }).then(setAllMinistries).catch(console.error)
    }
  }, [showMinistryDialog, allMinistries.length])

  useEffect(() => {
    if (showCellGroupDialog && allCellGroups.length === 0) {
      getAllCellGroups({ data: { activeOnly: true } }).then(setAllCellGroups).catch(console.error)
    }
  }, [showCellGroupDialog, allCellGroups.length])

  // Loading / not-found states (client-side fetch; all hooks are above this).
  if (memberLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (memberError || !member) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Member Not Found</h1>
          <p className="text-gray-600 mb-4">{memberError || 'This member could not be loaded.'}</p>
          <Link to="/admin/members" className="text-[#8B1538] hover:underline">Back to members</Link>
        </div>
      </div>
    )
  }

  // Filter out ministries/cell groups the member is already in
  const existingMinistryIds = new Set(ministries.map((m: any) => m.ministry?.id).filter(Boolean))
  const existingCellGroupIds = new Set(cellGroups.map((cg: any) => cg.cell_group?.id).filter(Boolean))
  const availableMinistries = allMinistries.filter(m => !existingMinistryIds.has(m.id))
  const availableCellGroups = allCellGroups.filter(cg => !existingCellGroupIds.has(cg.id))

  const handleAddMinistry = async () => {
    if (!selectedMinistryId) return setActionError('Select a ministry')
    setIsSaving(true)
    setActionError('')
    try {
      await addMemberToMinistry({ data: { memberId: member.id, ministryId: selectedMinistryId, role: selectedMinistryRole } })
      setShowMinistryDialog(false)
      setSelectedMinistryId('')
      setSelectedMinistryRole('volunteer')
      reloadMember()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to add to ministry')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAddCellGroup = async () => {
    if (!selectedCellGroupId) return setActionError('Select a Quest Circle')
    setIsSaving(true)
    setActionError('')
    try {
      await addMemberToCellGroup({ data: { memberId: member.id, cellGroupId: selectedCellGroupId, role: selectedCellGroupRole } })
      setShowCellGroupDialog(false)
      setSelectedCellGroupId('')
      setSelectedCellGroupRole('member')
      reloadMember()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to add to Quest Circle')
    } finally {
      setIsSaving(false)
    }
  }

  const handlePhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true)
    try {
      const { url, error } = await uploadMemberPhoto(member.id, file)
      if (error) {
        alert(`Upload failed: ${error.message}`)
        return
      }
      await updateMember({ data: { id: member.id, updates: { photo_url: url } } })
      reloadMember()
    } catch (error) {
      alert('Failed to upload photo')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  // Format birthday for display
  const formatBirthday = (dateStr: string | null) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr + 'T00:00:00')
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  // Format anniversary for display
  const formatAnniversary = (dateStr: string | null) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr + 'T00:00:00')
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const leadershipInfo = LEADERSHIP_LEVELS.find((l) => l.value === member.leadership_level)
  const followThroughInfo = FOLLOW_THROUGH_STAGES.find((f) => f.value === member.follow_through)

  const hasSpiritualProfile = member.bio || member.spiritual_description || member.prayer_needs
  const hasPersonalDetails = member.civil_status || member.num_children != null
  const hasEmergencyContact = member.emergency_contact_name || member.emergency_contact_phone
  const hasDesignations = member.is_vision_keeper || member.is_full_time || member.needs_support

  // Extract Facebook display name from URL
  const getFacebookDisplay = (url: string | null) => {
    if (!url) return null
    try {
      const parsed = new URL(url)
      const pathname = parsed.pathname.replace(/^\//, '').replace(/\/$/, '')
      return pathname || url
    } catch {
      return url
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#8B1538] to-[#6B0F2B] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {/* Navigation Row */}
          <div className="flex items-center justify-between mb-6">
            <Link
              to="/admin/members"
              className="inline-flex items-center gap-1.5 text-white/80 hover:text-white transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Members
            </Link>
            <Link
              to="/admin/members/$memberId/edit"
              params={{ memberId: member.id }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </Link>
          </div>

          {/* Profile Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
            <img
              src={avatarUrl}
              alt={member.name}
              className="w-28 h-28 rounded-full object-cover border-4 border-white/20 shadow-lg"
            />
            <div className="text-center sm:text-left pb-1">
              <h1 className="text-2xl sm:text-3xl font-bold">{member.name}</h1>
              <p className="text-white/70 mt-0.5">{member.city}</p>

              {/* Badges Row 1: Stage, Status, Satellite */}
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                <Badge className={stageBadgeColors[member.discipleship_stage] || 'bg-gray-100 text-gray-800'}>
                  {STAGE_LABELS[member.discipleship_stage] || member.discipleship_stage}
                </Badge>
                <Badge className={statusBadgeColors[member.membership_status] || 'bg-gray-100 text-gray-800'}>
                  {member.membership_status}
                </Badge>
                {satelliteName && (
                  <Badge className="bg-white/20 text-white">
                    {satelliteName}
                  </Badge>
                )}
              </div>

              {/* Badges Row 2: Category, Leadership, Designations */}
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                {member.member_category && (
                  <Badge className="bg-purple-100 text-purple-800">{member.member_category}</Badge>
                )}
                {member.leadership_level && member.leadership_level !== 'Member' && (
                  <Badge className="bg-indigo-100 text-indigo-800">{member.leadership_level}</Badge>
                )}
                {member.is_vision_keeper && (
                  <Badge className="bg-amber-100 text-amber-800">Vision Keeper</Badge>
                )}
                {member.is_full_time && (
                  <Badge className="bg-blue-100 text-blue-800">Full-Time</Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Church Journey */}
            <SectionCard title="Church Journey" icon="⛪">
              <div className="space-y-4">
                {/* Discipleship Journey Progress */}
                {member.discipleship_journey && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Discipleship Journey</label>
                    <div className="mt-1.5">
                      <JourneyProgressBar journey={member.discipleship_journey} />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Follow Through */}
                  {followThroughInfo && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Follow Through</label>
                      <p className="text-sm text-gray-900 mt-0.5">{followThroughInfo.label}</p>
                      <p className="text-xs text-gray-500">{followThroughInfo.description}</p>
                    </div>
                  )}

                  {/* Leadership Level */}
                  {leadershipInfo && member.leadership_level !== 'Member' && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Leadership Level</label>
                      <p className="text-sm text-gray-900 mt-0.5">{leadershipInfo.label}</p>
                      <p className="text-xs text-gray-500">{leadershipInfo.description}</p>
                    </div>
                  )}

                  {/* Spiritual Name */}
                  {member.spiritual_name && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Spiritual Name</label>
                      <p className="text-sm text-gray-900 mt-0.5 italic">"{member.spiritual_name}"</p>
                    </div>
                  )}

                  {/* Community */}
                  {member.community && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Community</label>
                      <p className="text-sm text-gray-900 mt-0.5">{member.community}</p>
                    </div>
                  )}
                </div>

                {/* Empty state */}
                {!member.discipleship_journey && !followThroughInfo && member.leadership_level === 'Member' && !member.spiritual_name && !member.community && (
                  <p className="text-sm text-gray-400 italic">No church journey details recorded yet.</p>
                )}
              </div>
            </SectionCard>

            {/* Ministries */}
            <SectionCardWithAction
              title="Ministries"
              icon="🙏"
              actionLabel="+ Add"
              onAction={() => { setActionError(''); setShowMinistryDialog(true) }}
            >
              {ministries.length > 0 ? (
                <div className="space-y-3">
                  {ministries.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.ministry?.name || 'Unknown Ministry'}</p>
                        {m.ministry?.department && (
                          <p className="text-xs text-gray-500">{m.ministry.department}</p>
                        )}
                        {m.ministry?.head && (
                          <div className="mt-1">
                            <LeaderChip leader={m.ministry.head} label="Ministry Head" />
                          </div>
                        )}
                      </div>
                      <Badge className="bg-gray-100 text-gray-700 capitalize">{m.role}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Not serving in any ministry.</p>
              )}
            </SectionCardWithAction>

            {/* Quest Circles */}
            <SectionCardWithAction
              title="Quest Circles"
              icon="👥"
              actionLabel="+ Add"
              onAction={() => { setActionError(''); setShowCellGroupDialog(true) }}
            >
              {cellGroups.length > 0 ? (
                <div className="space-y-3">
                  {cellGroups.map((cg: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">{cg.cell_group?.name || 'Unknown Quest Circle'}</p>
                        {(cg.cell_group?.meeting_day || cg.cell_group?.meeting_time) && (
                          <p className="text-xs text-gray-500">
                            {[cg.cell_group.meeting_day, cg.cell_group.meeting_time].filter(Boolean).join(' at ')}
                          </p>
                        )}
                        {(cg.cell_group?.leader || cg.cell_group?.co_leader) && (
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            <LeaderChip leader={cg.cell_group.leader} label="Leader" />
                            <LeaderChip leader={cg.cell_group.co_leader} label="Co-Leader" />
                          </div>
                        )}
                      </div>
                      <Badge className="bg-gray-100 text-gray-700 capitalize">{cg.role}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Not a member of any Quest Circle.</p>
              )}
            </SectionCardWithAction>

            {/* Photo Gallery */}
            <SectionCardWithAction
              title="Photo Gallery"
              icon="📷"
              actionLabel={isUploadingPhoto ? 'Uploading...' : '+ Add Photo'}
              onAction={() => document.getElementById('photo-upload-input')?.click()}
            >
              <input
                id="photo-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handlePhotoUpload(file)
                  e.target.value = ''
                }}
              />
              {member.photo_url ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <img
                    src={member.photo_url}
                    alt={member.name}
                    className="w-full aspect-square rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </div>
              ) : (
                <div className="text-center py-6">
                  <svg className="w-10 h-10 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-gray-400 italic">No photos yet.</p>
                  <button
                    onClick={() => document.getElementById('photo-upload-input')?.click()}
                    className="mt-2 text-sm text-[#8B1538] hover:underline font-medium"
                  >
                    Upload a photo
                  </button>
                </div>
              )}
            </SectionCardWithAction>

            {/* Service Attendance (staff-only; renders nothing without registration.read) */}
            <MemberAttendanceSection memberId={member.id} />

            {/* Spiritual Profile */}
            {hasSpiritualProfile && (
              <SectionCard title="Spiritual Profile" icon="✨">
                <div className="space-y-4">
                  {member.bio && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bio</label>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{member.bio}</p>
                    </div>
                  )}

                  {member.spiritual_description && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Spiritual Journey</label>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{member.spiritual_description}</p>
                    </div>
                  )}

                  {member.prayer_needs && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                      <label className="text-xs font-medium text-blue-600 uppercase tracking-wide">Prayer Needs</label>
                      <p className="text-sm text-blue-900 mt-1 whitespace-pre-line">{member.prayer_needs}</p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
          </div>

          {/* Sidebar Column (1/3) */}
          <div className="space-y-6">
            {/* Contact Info */}
            <SectionCard title="Contact Info" icon="📞">
              <div className="space-y-0.5">
                <InfoRow
                  label="Email"
                  value={member.email}
                  href={member.email ? `mailto:${member.email}` : undefined}
                />
                <InfoRow
                  label="Phone"
                  value={member.phone}
                  href={member.phone ? `tel:${member.phone}` : undefined}
                />
                <InfoRow
                  label="Facebook"
                  value={getFacebookDisplay(member.facebook_url)}
                  href={member.facebook_url || undefined}
                />
                <InfoRow label="Birthday" value={formatBirthday(member.birthday)} />
                <InfoRow label="Age" value={member.age ? `${member.age} years old` : null} />
                <InfoRow label="Gender" value={member.gender ? (member.gender === 'male' ? 'Male' : 'Female') : null} />
                <InfoRow label="Address" value={member.address} />

                {!member.email && !member.phone && !member.facebook_url && !member.birthday && !member.address && (
                  <p className="text-sm text-gray-400 italic">No contact info available.</p>
                )}
              </div>
            </SectionCard>

            {/* Personal Details - only if any data exists */}
            {hasPersonalDetails && (
              <SectionCard title="Personal Details" icon="👤">
                <div className="space-y-0.5">
                  <InfoRow
                    label="Civil Status"
                    value={member.civil_status ? member.civil_status.charAt(0).toUpperCase() + member.civil_status.slice(1) : null}
                  />
                  {member.civil_status === 'married' && (
                    <>
                      <InfoRow label="Spouse" value={member.spouse_name} />
                      <InfoRow label="Anniversary" value={formatAnniversary(member.wedding_anniversary)} />
                      <InfoRow
                        label="Children"
                        value={member.num_children != null ? String(member.num_children) : null}
                      />
                    </>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Emergency Contact */}
            {hasEmergencyContact && (
              <SectionCard title="Emergency Contact" icon="🚨">
                <div className="space-y-0.5">
                  <InfoRow label="Name" value={member.emergency_contact_name} />
                  <InfoRow
                    label="Phone"
                    value={member.emergency_contact_phone}
                    href={member.emergency_contact_phone ? `tel:${member.emergency_contact_phone}` : undefined}
                  />
                </div>
              </SectionCard>
            )}

            {/* Designations */}
            {hasDesignations && (
              <SectionCard title="Designations" icon="🏅">
                <div className="space-y-2">
                  {member.is_vision_keeper && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-sm text-gray-700">Vision Keeper</span>
                    </div>
                  )}
                  {member.is_full_time && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm text-gray-700">Full-Time</span>
                    </div>
                  )}
                  {member.needs_support && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-sm font-medium text-red-700">Needs Support</span>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </div>

      {/* Add to Ministry Dialog */}
      <Dialog open={showMinistryDialog} onOpenChange={setShowMinistryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Ministry</DialogTitle>
            <DialogDescription>
              Assign {member.name} to a ministry with a role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{actionError}</p>
            )}
            <div className="space-y-2">
              <Label>Ministry</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30 focus:border-[#8B1538]"
                value={selectedMinistryId}
                onChange={(e) => setSelectedMinistryId(e.target.value)}
              >
                <option value="">Select a ministry...</option>
                {availableMinistries.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.department ? ` (${m.department})` : ''}
                  </option>
                ))}
              </select>
              {availableMinistries.length === 0 && allMinistries.length > 0 && (
                <p className="text-xs text-gray-500 italic">Already a member of all ministries.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30 focus:border-[#8B1538]"
                value={selectedMinistryRole}
                onChange={(e) => setSelectedMinistryRole(e.target.value as 'head' | 'coordinator' | 'volunteer')}
              >
                <option value="volunteer">Volunteer</option>
                <option value="coordinator">Coordinator</option>
                <option value="head">Head</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMinistryDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleAddMinistry}
              disabled={isSaving || !selectedMinistryId}
              className="bg-[#8B1538] hover:bg-[#6B0F2B] text-white"
            >
              {isSaving ? 'Adding...' : 'Add to Ministry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Cell Group Dialog */}
      <Dialog open={showCellGroupDialog} onOpenChange={setShowCellGroupDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to Quest Circle</DialogTitle>
            <DialogDescription>
              Assign {member.name} to a Quest Circle with a role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {actionError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{actionError}</p>
            )}
            <div className="space-y-2">
              <Label>Quest Circle</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30 focus:border-[#8B1538]"
                value={selectedCellGroupId}
                onChange={(e) => setSelectedCellGroupId(e.target.value)}
              >
                <option value="">Select a Quest Circle...</option>
                {availableCellGroups.map((cg) => (
                  <option key={cg.id} value={cg.id}>
                    {cg.name}{cg.meeting_day ? ` (${cg.meeting_day})` : ''}
                  </option>
                ))}
              </select>
              {availableCellGroups.length === 0 && allCellGroups.length > 0 && (
                <p className="text-xs text-gray-500 italic">Already a member of all Quest Circles.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B1538]/30 focus:border-[#8B1538]"
                value={selectedCellGroupRole}
                onChange={(e) => setSelectedCellGroupRole(e.target.value as 'leader' | 'co_leader' | 'member')}
              >
                <option value="member">Member</option>
                <option value="co_leader">Co-Leader</option>
                <option value="leader">Leader</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCellGroupDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleAddCellGroup}
              disabled={isSaving || !selectedCellGroupId}
              className="bg-[#8B1538] hover:bg-[#6B0F2B] text-white"
            >
              {isSaving ? 'Adding...' : 'Add to Quest Circle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
