// Quest Laguna Directory - Cell Group Detail Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { supabase } from '../../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { getPlaceholderAvatar } from '../../../lib/storage'
import { addMemberToCellGroup, removeMemberFromCellGroup, updateMemberCellGroupRole } from '../../../server/functions/cellGroups'
import { searchMembers } from '../../../server/functions/members'
import type { CellGroupWithRelations, Member } from '../../../lib/types'

export const Route = createFileRoute('/admin/cell-groups/$groupId')({
  component: CellGroupDetailPage,
})

// Type for member in cell group query result
interface CellGroupMember {
  id: string
  role: string
  joined_at: string
  is_active: boolean
  member: {
    id: string
    name: string
    photo_url: string | null
    phone: string | null
    email: string | null
    discipleship_stage: string | null
  }
}

// Extended type for the detailed query
interface CellGroupDetail extends Omit<CellGroupWithRelations, 'members'> {
  members?: CellGroupMember[]
}

function CellGroupDetailPage() {
  const navigate = useNavigate()
  const { groupId } = Route.useParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [cellGroup, setCellGroup] = useState<CellGroupDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Member management state
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [addRole, setAddRole] = useState<'leader' | 'co_leader' | 'member'>('member')
  const [memberToRemove, setMemberToRemove] = useState<CellGroupMember | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', `/admin/cell-groups/${groupId}`)
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate, groupId])

  // Fetch cell group details
  const hasFetchedRef = useRef(false)

  const fetchCellGroup = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('cell_groups')
        .select(`
          *,
          satellite:satellites(id, name),
          leader:members!cell_groups_leader_id_fkey(id, name, photo_url, phone, email),
          co_leader:members!cell_groups_co_leader_id_fkey(id, name, photo_url, phone, email),
          members:member_cell_groups(
            id,
            role,
            joined_at,
            is_active,
            member:members(id, name, photo_url, phone, email, discipleship_stage)
          )
        `)
        .eq('id', groupId)
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          setError('Cell group not found')
        } else {
          console.error('Error fetching cell group:', fetchError)
          setError('Failed to load cell group')
        }
      } else {
        setCellGroup(data as CellGroupDetail)
      }
    } catch (err) {
      console.error('Error fetching cell group:', err)
      setError('Failed to load cell group')
    }

    setIsLoading(false)
    hasFetchedRef.current = true
  }, [groupId])

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    const timer = setTimeout(() => {
      if (!cancelled) fetchCellGroup(!hasFetchedRef.current)
    }, 100)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isAuthenticated, fetchCellGroup])

  // Debounced member search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)

    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await searchMembers({ data: { query: searchQuery.trim(), limit: 20 } })
        setSearchResults(results)
      } catch (err) {
        console.error('Search error:', err)
      }
      setIsSearching(false)
    }, 300)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  // Add member handler
  const handleAddMember = async (memberId: string) => {
    setIsUpdating(true)
    try {
      await addMemberToCellGroup({ data: { memberId, cellGroupId: groupId, role: addRole } })
      await fetchCellGroup(false)
    } catch (err: any) {
      alert(err.message || 'Failed to add member')
    }
    setIsUpdating(false)
  }

  // Remove member handler
  const handleRemoveMember = async () => {
    if (!memberToRemove) return
    setIsUpdating(true)
    try {
      await removeMemberFromCellGroup({ data: { memberId: memberToRemove.member.id, cellGroupId: groupId } })
      setMemberToRemove(null)
      await fetchCellGroup(false)
    } catch (err: any) {
      alert(err.message || 'Failed to remove member')
    }
    setIsUpdating(false)
  }

  // Change role handler
  const handleRoleChange = async (memberId: string, newRole: 'leader' | 'co_leader' | 'member') => {
    setIsUpdating(true)
    try {
      await updateMemberCellGroupRole({ data: { memberId, cellGroupId: groupId, role: newRole } })
      await fetchCellGroup(false)
    } catch (err: any) {
      alert(err.message || 'Failed to update role')
    }
    setIsUpdating(false)
  }

  const dayColors: Record<string, string> = {
    Sunday: 'bg-purple-100 text-purple-800',
    Monday: 'bg-blue-100 text-blue-800',
    Tuesday: 'bg-green-100 text-green-800',
    Wednesday: 'bg-yellow-100 text-yellow-800',
    Thursday: 'bg-orange-100 text-orange-800',
    Friday: 'bg-pink-100 text-pink-800',
    Saturday: 'bg-indigo-100 text-indigo-800',
  }

  // Safety timeout: stop loading after 10 seconds
  useEffect(() => {
    if (!isLoading) return
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('[CellGroupDetail] Loading timed out after 10s')
        setIsLoading(false)
        if (!cellGroup) setError('Loading timed out. Please try refreshing the page.')
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [isLoading, cellGroup])

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  if (error || !cellGroup) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Link to="/admin" search={{ tab: 'cell-groups' }} className="text-white/80 hover:text-white mb-2 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Cell Groups
            </Link>
            <h1 className="text-2xl font-bold">Cell Group Not Found</h1>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600">{error || 'This cell group does not exist.'}</p>
          <Button onClick={() => navigate({ to: '/admin', search: { tab: 'cell-groups' } })} className="mt-4">
            Back to Cell Groups
          </Button>
        </div>
      </div>
    )
  }

  const leaderAvatar = cellGroup.leader?.photo_url || (cellGroup.leader ? getPlaceholderAvatar(cellGroup.leader.name) : null)
  const coLeaderAvatar = cellGroup.co_leader?.photo_url || (cellGroup.co_leader ? getPlaceholderAvatar(cellGroup.co_leader.name) : null)
  const activeMembers = cellGroup.members?.filter(m => m.is_active && m.member) || []
  const activeMemberIds = new Set(activeMembers.map(m => m.member.id))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner + Header */}
      <div className="relative">
        {/* Banner Image / Placeholder */}
        <div className="h-48 md:h-64 w-full overflow-hidden">
          {cellGroup.banner_url ? (
            <img
              src={cellGroup.banner_url}
              alt={`${cellGroup.name} group photo`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#8B1538] via-[#B91C3C] to-[#6B0F2B] relative">
              {/* Decorative pattern */}
              <div className="absolute inset-0 opacity-10">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="cell-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                      <circle cx="20" cy="20" r="8" fill="white" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#cell-pattern)" />
                </svg>
              </div>
              {/* Center icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-white/10 backdrop-blur-sm rounded-full p-6">
                  <svg className="w-16 h-16 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>
          )}
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>

        {/* Header content overlaid on banner */}
        <div className="absolute inset-0 flex flex-col justify-between">
          <div className="max-w-7xl mx-auto w-full px-4 pt-4">
            <Link to="/admin" search={{ tab: 'cell-groups' }} className="text-white/80 hover:text-white inline-flex items-center gap-1 text-sm bg-black/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Cell Groups
            </Link>
          </div>
          <div className="max-w-7xl mx-auto w-full px-4 pb-5">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">{cellGroup.name}</h1>
                {cellGroup.satellite && (
                  <p className="text-white/80 text-sm mt-1">{cellGroup.satellite.name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cellGroup.meeting_day && (
                  <span className={`px-3 py-1 text-sm font-medium rounded-full ${dayColors[cellGroup.meeting_day] || 'bg-gray-100 text-gray-800'}`}>
                    {cellGroup.meeting_day}s
                  </span>
                )}
                {cellGroup.is_active === false && (
                  <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {cellGroup.description && (
              <Card>
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{cellGroup.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Analytics */}
            <Card>
              <CardHeader>
                <CardTitle>Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                {activeMembers.length === 0 ? (
                  <p className="text-gray-500 text-center py-2 text-sm">No members to analyze</p>
                ) : (
                  <div className="space-y-4">
                    {/* Stage Distribution */}
                    <div>
                      <p className="text-sm font-medium text-gray-500 mb-2">Discipleship Stages</p>
                      <div className="space-y-2">
                        {(['Newbie', 'Growing', 'Leader'] as const).map((stage) => {
                          const count = activeMembers.filter(m => m.member.discipleship_stage === stage).length
                          const pct = activeMembers.length > 0 ? Math.round((count / activeMembers.length) * 100) : 0
                          const colors = {
                            Newbie: { bar: 'bg-amber-500', text: 'text-amber-700' },
                            Growing: { bar: 'bg-teal-500', text: 'text-teal-700' },
                            Leader: { bar: 'bg-slate-500', text: 'text-slate-700' },
                          }
                          return (
                            <div key={stage}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className={`font-medium ${colors[stage].text}`}>{stage}</span>
                                <span className="text-gray-500">{count} ({pct}%)</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className={`${colors[stage].bar} h-2 rounded-full transition-all`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Role Breakdown */}
                    <div className="pt-3 border-t">
                      <p className="text-sm font-medium text-gray-500 mb-2">Roles</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { role: 'leader', label: 'Leaders', color: 'bg-[#8B1538]/10 text-[#8B1538]' },
                          { role: 'co_leader', label: 'Co-Leaders', color: 'bg-amber-50 text-amber-700' },
                          { role: 'member', label: 'Members', color: 'bg-gray-50 text-gray-700' },
                        ].map(({ role, label, color }) => {
                          const count = activeMembers.filter(m => m.role === role).length
                          return (
                            <div key={role} className={`${color} rounded-lg p-3 text-center`}>
                              <p className="text-2xl font-bold">{count}</p>
                              <p className="text-xs">{label}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Meeting Info */}
            <Card>
              <CardHeader>
                <CardTitle>Meeting Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Day</p>
                    <p className="font-medium">{cellGroup.meeting_day || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Time</p>
                    <p className="font-medium">{cellGroup.meeting_time || 'Not set'}</p>
                  </div>
                </div>
                {cellGroup.meeting_location && (
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <div className="flex items-center gap-2 mt-1">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="font-medium">{cellGroup.meeting_location}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Members List */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Members ({activeMembers.length}/{cellGroup.max_members})</CardTitle>
                    <CardDescription>Active members of this cell group</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => { setShowAddDialog(true); setSearchQuery(''); setSearchResults([]) }}>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {activeMembers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No members yet</p>
                ) : (
                  <div className="space-y-3">
                    {activeMembers.map((membership) => {
                      const memberAvatar = membership.member.photo_url || getPlaceholderAvatar(membership.member.name)
                      return (
                        <div key={membership.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <img
                              src={memberAvatar}
                              alt={membership.member.name}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <Link
                                to="/admin/members/$memberId/edit"
                                params={{ memberId: membership.member.id }}
                                className="font-medium text-gray-900 hover:text-[#8B1538] block truncate"
                              >
                                {membership.member.name}
                              </Link>
                              <p className="text-sm text-gray-500 truncate">
                                {membership.member.email || membership.member.phone || 'No contact info'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {membership.member.discipleship_stage && (
                              <span className={`hidden sm:inline-block px-2 py-1 text-xs font-medium rounded-full ${
                                membership.member.discipleship_stage === 'Newbie'
                                  ? 'bg-amber-100 text-amber-800'
                                  : membership.member.discipleship_stage === 'Growing'
                                    ? 'bg-teal-100 text-teal-800'
                                    : 'bg-slate-200 text-slate-800'
                              }`}>
                                {membership.member.discipleship_stage}
                              </span>
                            )}
                            <select
                              value={membership.role}
                              onChange={(e) => handleRoleChange(membership.member.id, e.target.value as 'leader' | 'co_leader' | 'member')}
                              disabled={isUpdating}
                              className="text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer bg-gray-100 text-gray-700 focus:ring-2 focus:ring-[#8B1538]"
                            >
                              <option value="member">Member</option>
                              <option value="co_leader">Co-Leader</option>
                              <option value="leader">Leader</option>
                            </select>
                            <button
                              onClick={() => setMemberToRemove(membership)}
                              disabled={isUpdating}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                              title="Remove member"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Leadership */}
          <div className="space-y-6">
            {/* Leadership Card */}
            <Card>
              <CardHeader>
                <CardTitle>Leadership</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Leader */}
                {cellGroup.leader ? (
                  <div className="flex items-center gap-3 p-3 bg-[#8B1538]/5 rounded-lg border border-[#8B1538]/20">
                    <img
                      src={leaderAvatar!}
                      alt={cellGroup.leader.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        to="/admin/members/$memberId/edit"
                        params={{ memberId: cellGroup.leader.id }}
                        className="font-medium text-gray-900 hover:text-[#8B1538] block truncate"
                      >
                        {cellGroup.leader.name}
                      </Link>
                      <p className="text-sm text-[#8B1538] font-medium">Cell Leader</p>
                      {cellGroup.leader.phone && (
                        <p className="text-xs text-gray-500">{cellGroup.leader.phone}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-lg text-center text-gray-500">
                    No leader assigned
                  </div>
                )}

                {/* Co-Leader */}
                {cellGroup.co_leader ? (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <img
                      src={coLeaderAvatar!}
                      alt={cellGroup.co_leader.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        to="/admin/members/$memberId/edit"
                        params={{ memberId: cellGroup.co_leader.id }}
                        className="font-medium text-gray-900 hover:text-[#8B1538] block truncate"
                      >
                        {cellGroup.co_leader.name}
                      </Link>
                      <p className="text-sm text-amber-600 font-medium">Co-Leader</p>
                      {cellGroup.co_leader.phone && (
                        <p className="text-xs text-gray-500">{cellGroup.co_leader.phone}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-lg text-center text-gray-500 text-sm">
                    No co-leader assigned
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle>Group Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Capacity</span>
                    <span className="font-medium">{activeMembers.length} / {cellGroup.max_members}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[#8B1538] h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (activeMembers.length / cellGroup.max_members) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-medium ${cellGroup.is_active ? 'text-green-600' : 'text-red-600'}`}>
                      {cellGroup.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {cellGroup.created_at && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Created</span>
                      <span className="text-gray-700">
                        {new Date(cellGroup.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Activities */}
            <Card>
              <CardHeader>
                <CardTitle>Activities</CardTitle>
                <CardDescription>Upcoming schedule & activities</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Next Meeting */}
                {cellGroup.meeting_day ? (
                  <div className="flex items-start gap-3 p-3 bg-[#8B1538]/5 rounded-lg border border-[#8B1538]/10">
                    <div className="w-10 h-10 rounded-lg bg-[#8B1538] text-white flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-sm">Weekly Meeting</p>
                      <p className="text-xs text-gray-500">
                        Every {cellGroup.meeting_day}{cellGroup.meeting_time ? ` at ${cellGroup.meeting_time}` : ''}
                      </p>
                      {cellGroup.meeting_location && (
                        <p className="text-xs text-gray-400 mt-0.5">{cellGroup.meeting_location}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-lg text-center text-gray-500 text-sm">
                    No meeting schedule set
                  </div>
                )}

                {/* Activity Log */}
                <div className="border-t pt-3">
                  <p className="text-sm font-medium text-gray-500 mb-3">Recent Activity</p>
                  <div className="space-y-3">
                    {/* Group Creation */}
                    {cellGroup.created_at && (
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-gray-700">Group created</p>
                          <p className="text-xs text-gray-400">
                            {new Date(cellGroup.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Latest member joins */}
                    {activeMembers
                      .sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime())
                      .slice(0, 3)
                      .map((m) => (
                        <div key={m.id} className="flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">{m.member.name}</span> joined
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(m.joined_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>
                      ))
                    }

                    {activeMembers.length === 0 && !cellGroup.created_at && (
                      <p className="text-sm text-gray-400 text-center">No activity yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>Search for a member to add to {cellGroup.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Role</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as 'leader' | 'co_leader' | 'member')}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="member">Member</option>
                <option value="co_leader">Co-Leader</option>
                <option value="leader">Leader</option>
              </select>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!isSearching && searchQuery.trim() && searchResults.length === 0 && (
                <p className="text-center text-sm text-gray-500 py-4">No members found</p>
              )}
              {!isSearching && searchResults.map((member) => {
                const alreadyAdded = activeMemberIds.has(member.id)
                const avatar = member.photo_url || getPlaceholderAvatar(member.name)
                return (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={avatar} alt={member.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {member.city || ''}{member.discipleship_stage ? ` · ${member.discipleship_stage}` : ''}
                        </p>
                      </div>
                    </div>
                    {alreadyAdded ? (
                      <span className="text-xs text-gray-400 flex-shrink-0">Already added</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddMember(member.id)}
                        disabled={isUpdating}
                        className="flex-shrink-0"
                      >
                        Add
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={(open) => { if (!open) setMemberToRemove(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Remove <strong>{memberToRemove?.member.name}</strong> from {cellGroup.name}? They will be marked as inactive in this group.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberToRemove(null)} disabled={isUpdating}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemoveMember} disabled={isUpdating}>
              {isUpdating ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
