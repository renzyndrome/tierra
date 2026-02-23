// Quest Laguna Directory - Member Profile Page
import { createFileRoute, Link } from '@tanstack/react-router'
import { getMemberWithRelations } from '../../../server/functions/members'
import { getPlaceholderAvatar } from '../../../lib/storage'
import {
  DISCIPLESHIP_JOURNEY_STAGES,
  LEADERSHIP_LEVELS,
  FOLLOW_THROUGH_STAGES,
} from '../../../lib/constants'
import type { DiscipleshipJourney } from '../../../lib/types'

export const Route = createFileRoute('/directory/members/$memberId')({
  loader: async ({ params }) => {
    const member = await getMemberWithRelations({ data: { id: params.memberId } })
    if (!member) {
      throw new Error('Member not found')
    }
    return { member }
  },
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
// MAIN PROFILE COMPONENT
// ============================================

function MemberProfilePage() {
  const { member } = Route.useLoaderData()

  const avatarUrl = member.photo_url || getPlaceholderAvatar(member.name)
  const satelliteName = (member as any).satellite?.name || null

  // Safely access relations
  const cellGroups = ((member as any).cell_groups || []).filter((cg: any) => cg.is_active)
  const ministries = ((member as any).ministries || []).filter((m: any) => m.is_active)

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
                  {member.discipleship_stage}
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
            <SectionCard title="Ministries" icon="🙏">
              {ministries.length > 0 ? (
                <div className="space-y-3">
                  {ministries.map((m: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.ministry?.name || 'Unknown Ministry'}</p>
                        {m.ministry?.department && (
                          <p className="text-xs text-gray-500">{m.ministry.department}</p>
                        )}
                      </div>
                      <Badge className="bg-gray-100 text-gray-700 capitalize">{m.role}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Not serving in any ministry.</p>
              )}
            </SectionCard>

            {/* Cell Groups */}
            <SectionCard title="Cell Groups" icon="👥">
              {cellGroups.length > 0 ? (
                <div className="space-y-3">
                  {cellGroups.map((cg: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{cg.cell_group?.name || 'Unknown Cell Group'}</p>
                        {(cg.cell_group?.meeting_day || cg.cell_group?.meeting_time) && (
                          <p className="text-xs text-gray-500">
                            {[cg.cell_group.meeting_day, cg.cell_group.meeting_time].filter(Boolean).join(' at ')}
                          </p>
                        )}
                      </div>
                      <Badge className="bg-gray-100 text-gray-700 capitalize">{cg.role}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Not a member of any cell group.</p>
              )}
            </SectionCard>

            {/* Photo Gallery */}
            <SectionCard title="Photo Gallery" icon="📷">
              {member.photo_url ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <img
                    src={member.photo_url}
                    alt={member.name}
                    className="w-full aspect-square rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No photos yet.</p>
              )}
            </SectionCard>

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
    </div>
  )
}
