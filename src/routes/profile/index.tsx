// Quest Laguna Directory - User Profile Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { getPlaceholderAvatar } from '../../lib/storage'
import type { Member, Satellite, CellGroupWithRelations, MinistryWithRelations } from '../../lib/types'

export const Route = createFileRoute('/profile/')({
  component: ProfilePage,
})

function ProfilePage() {
  const navigate = useNavigate()
  const [member, setMember] = useState<Member | null>(null)
  const [satellite, setSatellite] = useState<Satellite | null>(null)
  const [cellGroups, setCellGroups] = useState<CellGroupWithRelations[]>([])
  const [ministries, setMinistries] = useState<MinistryWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    const checkAuthAndFetchProfile = async () => {
      setIsLoading(true)

      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Redirect to login
        navigate({ to: '/auth/login' })
        return
      }

      setIsAuthenticated(true)

      // Fetch user profile to get member_id
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!profile?.member_id) {
        setIsLoading(false)
        return
      }

      // Fetch member data
      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('id', profile.member_id)
        .single()

      if (memberData) {
        setMember(memberData as Member)

        // Fetch satellite
        if (memberData.satellite_id) {
          const { data: sat } = await supabase
            .from('satellites')
            .select('*')
            .eq('id', memberData.satellite_id)
            .single()
          if (sat) setSatellite(sat as Satellite)
        }

        // Fetch cell groups
        const { data: cgMemberships } = await supabase
          .from('member_cell_groups')
          .select(`
            *,
            cell_group:cell_groups(*)
          `)
          .eq('member_id', profile.member_id)
          .eq('is_active', true)

        if (cgMemberships) {
          setCellGroups(cgMemberships.map((m: any) => m.cell_group) as CellGroupWithRelations[])
        }

        // Fetch ministries
        const { data: minMemberships } = await supabase
          .from('member_ministries')
          .select(`
            *,
            ministry:ministries(*)
          `)
          .eq('member_id', profile.member_id)
          .eq('is_active', true)

        if (minMemberships) {
          setMinistries(minMemberships.map((m: any) => m.ministry) as MinistryWithRelations[])
        }
      }

      setIsLoading(false)
    }

    checkAuthAndFetchProfile()
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate({ to: '/directory' })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538]" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // Will redirect
  }

  const avatarUrl = member?.photo_url || (member ? getPlaceholderAvatar(member.name) : null)

  const stageBadgeColor = member ? {
    Newbie: 'bg-amber-100 text-amber-800',
    Growing: 'bg-teal-100 text-teal-800',
    Leader: 'bg-slate-200 text-slate-800',
  }[member.discipleship_stage] : ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Link to="/directory" className="text-white/70 hover:text-white flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Directory
            </Link>
            <div className="flex gap-2">
              <Link
                to="/profile/settings"
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </Link>
              <button
                onClick={handleSignOut}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </div>

          {member ? (
            <div className="flex items-center gap-6">
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt={member.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white/20"
                />
              )}
              <div>
                <h1 className="text-3xl font-bold">{member.name}</h1>
                <p className="text-white/80 mt-1">{member.city}</p>
                <div className="flex gap-2 mt-2">
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${stageBadgeColor}`}>
                    {member.discipleship_stage}
                  </span>
                  {satellite && (
                    <span className="px-3 py-1 text-sm font-medium rounded-full bg-white/20 text-white">
                      {satellite.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold">My Profile</h1>
              <p className="text-white/80 mt-1">Complete your profile to connect with the church family</p>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {member ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="md:col-span-2 space-y-6">
              {/* About */}
              {member.bio && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-3">About Me</h2>
                  <p className="text-gray-700">{member.bio}</p>
                </div>
              )}

              {/* Spiritual Journey */}
              {member.spiritual_description && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Spiritual Journey</h2>
                  <p className="text-gray-700">{member.spiritual_description}</p>
                </div>
              )}

              {/* Cell Groups */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">My Cell Groups</h2>
                {cellGroups.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-500 mb-3">You're not part of any cell group yet.</p>
                    <Link
                      to="/directory/cell-groups"
                      className="text-[#8B1538] hover:underline"
                    >
                      Browse Cell Groups
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cellGroups.map((cg) => (
                      <Link
                        key={cg.id}
                        to="/directory/cell-groups/$groupId"
                        params={{ groupId: cg.id }}
                        className="block p-4 border border-gray-200 rounded-lg hover:border-[#8B1538] transition-colors"
                      >
                        <p className="font-medium text-gray-900">{cg.name}</p>
                        {cg.meeting_day && cg.meeting_time && (
                          <p className="text-sm text-gray-500">
                            {cg.meeting_day}s at {cg.meeting_time}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Ministries */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">My Ministries</h2>
                {ministries.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-gray-500 mb-3">You're not serving in any ministry yet.</p>
                    <Link
                      to="/directory/ministries"
                      className="text-[#8B1538] hover:underline"
                    >
                      Browse Ministries
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {ministries.map((min) => (
                      <Link
                        key={min.id}
                        to="/directory/ministries/$ministryId"
                        params={{ ministryId: min.id }}
                        className="block p-4 border border-gray-200 rounded-lg hover:border-[#8B1538] transition-colors"
                      >
                        <p className="font-medium text-gray-900">{min.name}</p>
                        {min.department && (
                          <p className="text-sm text-gray-500">{min.department}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Contact Info */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Contact Info</h2>
                <div className="space-y-3">
                  {member.email && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{member.email}</span>
                    </div>
                  )}
                  {member.phone && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span>{member.phone}</span>
                    </div>
                  )}
                  {member.birthday && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.701 2.701 0 00-1.5-.454M9 6v2m3-2v2m3-2v2M9 3h.01M12 3h.01M15 3h.01M21 21v-7a2 2 0 00-2-2H5a2 2 0 00-2 2v7h18zm-3-9v-2a2 2 0 00-2-2H8a2 2 0 00-2 2v2h12z" />
                      </svg>
                      <span>{new Date(member.birthday).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                    </div>
                  )}
                  {member.address && (
                    <div className="flex items-start gap-2 text-gray-600">
                      <svg className="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{member.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Edit Profile Button */}
              <Link
                to="/profile/settings"
                className="block w-full text-center px-4 py-3 bg-[#8B1538] text-white rounded-lg hover:bg-[#6D1029] transition-colors"
              >
                Edit Profile
              </Link>

              {/* Prayer Needs */}
              {member.prayer_needs && (
                <div className="bg-blue-50 rounded-lg p-6 border border-blue-100">
                  <h2 className="text-sm font-semibold text-blue-800 uppercase tracking-wider mb-3">
                    My Prayer Needs
                  </h2>
                  <p className="text-blue-900">{member.prayer_needs}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* No Profile State */
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Complete Your Profile</h2>
            <p className="text-gray-500 mb-6">
              Your account is set up, but you haven't linked a member profile yet.
              Contact an admin to link your account to your member record.
            </p>
            <Link
              to="/directory"
              className="inline-block px-6 py-3 bg-[#8B1538] text-white rounded-lg hover:bg-[#6D1029] transition-colors"
            >
              Browse Directory
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
