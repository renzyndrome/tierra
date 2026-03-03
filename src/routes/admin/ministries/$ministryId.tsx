// Quest Laguna Directory - Ministry Detail Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { supabase } from '../../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog'
import { Input } from '../../../components/ui/input'
import { getPlaceholderAvatar } from '../../../lib/storage'
import { addMemberToMinistry, removeMemberFromMinistry, updateMemberMinistryRole } from '../../../server/functions/ministries'
import { searchMembers } from '../../../server/functions/members'
import type { MinistryWithRelations, Member } from '../../../lib/types'

export const Route = createFileRoute('/admin/ministries/$ministryId')({
  component: MinistryDetailPage,
})

// Type for member in ministry query result
interface MinistryMember {
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
  }
}

// Extended type for the detailed query
interface MinistryDetail extends Omit<MinistryWithRelations, 'members'> {
  members?: MinistryMember[]
}

// Department colors
const departmentColors: Record<string, string> = {
  Worship: 'bg-purple-100 text-purple-800',
  Media: 'bg-blue-100 text-blue-800',
  Creative: 'bg-pink-100 text-pink-800',
  Kids: 'bg-green-100 text-green-800',
  Youth: 'bg-orange-100 text-orange-800',
  Admin: 'bg-gray-100 text-gray-800',
  Hospitality: 'bg-yellow-100 text-yellow-800',
  Outreach: 'bg-red-100 text-red-800',
  Discipleship: 'bg-indigo-100 text-indigo-800',
  Prayer: 'bg-teal-100 text-teal-800',
}

function MinistryDetailPage() {
  const navigate = useNavigate()
  const { ministryId } = Route.useParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [ministry, setMinistry] = useState<MinistryDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Member management state
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Member[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [addRole, setAddRole] = useState<'head' | 'coordinator' | 'volunteer'>('volunteer')
  const [memberToRemove, setMemberToRemove] = useState<MinistryMember | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [selectedMembers, setSelectedMembers] = useState<Map<string, string>>(new Map()) // id → name
  const [isBulkAdding, setIsBulkAdding] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', `/admin/ministries/${ministryId}`)
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate, ministryId])

  // Fetch ministry details
  const hasFetchedRef = useRef(false)

  const fetchMinistry = useCallback(async (showLoader = true) => {
    if (showLoader) setIsLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('ministries')
        .select(`
          *,
          head:members!ministries_head_id_fkey(id, name, photo_url, phone, email),
          members:member_ministries(
            id,
            role,
            joined_at,
            is_active,
            member:members(id, name, photo_url, phone, email)
          )
        `)
        .eq('id', ministryId)
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          setError('Ministry not found')
        } else {
          console.error('Error fetching ministry:', fetchError)
          setError('Failed to load ministry')
        }
      } else {
        setMinistry(data as MinistryDetail)
      }
    } catch (err) {
      console.error('Error fetching ministry:', err)
      setError('Failed to load ministry')
    }

    setIsLoading(false)
    hasFetchedRef.current = true
  }, [ministryId])

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    const timer = setTimeout(() => {
      if (!cancelled) fetchMinistry(!hasFetchedRef.current)
    }, 100)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isAuthenticated, fetchMinistry])

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
      await addMemberToMinistry({ data: { memberId, ministryId, role: addRole } })
      await fetchMinistry(false)
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
      await removeMemberFromMinistry({ data: { memberId: memberToRemove.member.id, ministryId } })
      setMemberToRemove(null)
      await fetchMinistry(false)
    } catch (err: any) {
      alert(err.message || 'Failed to remove member')
    }
    setIsUpdating(false)
  }

  // Change role handler
  const handleRoleChange = async (memberId: string, newRole: 'head' | 'coordinator' | 'volunteer') => {
    setIsUpdating(true)
    try {
      await updateMemberMinistryRole({ data: { memberId, ministryId, role: newRole } })
      await fetchMinistry(false)
    } catch (err: any) {
      alert(err.message || 'Failed to update role')
    }
    setIsUpdating(false)
  }

  // Bulk add handlers
  const toggleMemberSelection = (memberId: string, memberName: string) => {
    setSelectedMembers(prev => {
      const next = new Map(prev)
      if (next.has(memberId)) {
        next.delete(memberId)
      } else {
        next.set(memberId, memberName)
      }
      return next
    })
  }

  const handleBulkAddMembers = async () => {
    if (selectedMembers.size === 0) return
    setIsBulkAdding(true)

    const errors: string[] = []
    for (const [memberId, memberName] of selectedMembers) {
      try {
        await addMemberToMinistry({ data: { memberId, ministryId, role: addRole } })
      } catch (err: any) {
        errors.push(`${memberName}: ${err.message || 'Failed'}`)
      }
    }

    setSelectedMembers(new Map())
    setIsBulkAdding(false)
    await fetchMinistry(false)

    if (errors.length > 0) {
      alert(`Some members could not be added:\n${errors.join('\n')}`)
    }
  }

  // Safety timeout: stop loading after 10 seconds
  useEffect(() => {
    if (!isLoading) return
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('[MinistryDetail] Loading timed out after 10s')
        setIsLoading(false)
        if (!ministry) setError('Loading timed out. Please try refreshing the page.')
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [isLoading, ministry])

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

  if (error || !ministry) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Link to="/admin" search={{ tab: 'ministries' }} className="text-white/80 hover:text-white mb-2 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Ministries
            </Link>
            <h1 className="text-2xl font-bold">Ministry Not Found</h1>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600">{error || 'This ministry does not exist.'}</p>
          <Button onClick={() => navigate({ to: '/admin', search: { tab: 'ministries' } })} className="mt-4">
            Back to Ministries
          </Button>
        </div>
      </div>
    )
  }

  const headAvatar = ministry.head?.photo_url || (ministry.head ? getPlaceholderAvatar(ministry.head.name) : null)
  const activeMembers = ministry.members?.filter(m => m.is_active && m.member) || []
  const activeMemberIds = new Set(activeMembers.map(m => m.member.id))
  const deptColor = departmentColors[ministry.department || ''] || 'bg-gray-100 text-gray-800'

  // Group members by role
  const coordinators = activeMembers.filter(m => m.role === 'coordinator')
  const volunteers = activeMembers.filter(m => m.role === 'volunteer')

  // Helper to render a member row with management controls
  const renderMemberRow = (membership: MinistryMember, bgClass = 'bg-gray-50') => {
    const memberAvatar = membership.member.photo_url || getPlaceholderAvatar(membership.member.name)
    return (
      <div key={membership.id} className={`flex items-center justify-between p-3 ${bgClass} rounded-lg`}>
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
          <select
            value={membership.role}
            onChange={(e) => handleRoleChange(membership.member.id, e.target.value as 'head' | 'coordinator' | 'volunteer')}
            disabled={isUpdating}
            className="text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer bg-white/80 text-gray-700 focus:ring-2 focus:ring-[#8B1538]"
          >
            <option value="volunteer">Volunteer</option>
            <option value="coordinator">Coordinator</option>
            <option value="head">Head</option>
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
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Link to="/admin" search={{ tab: 'ministries' }} className="text-white/80 hover:text-white mb-2 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Ministries
          </Link>
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-2xl font-bold">{ministry.name}</h1>
              {ministry.department && (
                <span className={`inline-block mt-2 px-3 py-1 text-sm font-medium rounded-full ${deptColor}`}>
                  {ministry.department}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {ministry.is_active === false && (
                <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
                  Inactive
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {ministry.description && (
              <Card>
                <CardHeader>
                  <CardTitle>About</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">{ministry.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Coordinators */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Coordinators ({coordinators.length})</CardTitle>
                    <CardDescription>Ministry coordinators</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {coordinators.length === 0 ? (
                  <p className="text-gray-500 text-center py-4 text-sm">No coordinators yet</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {coordinators.map((membership) => renderMemberRow(membership, 'bg-blue-50'))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Volunteers */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Volunteers ({volunteers.length})</CardTitle>
                    <CardDescription>Active ministry volunteers</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => { setShowAddDialog(true); setSearchQuery(''); setSearchResults([]); setSelectedMembers(new Map()) }}>
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add Member
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {volunteers.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No volunteers yet</p>
                ) : (
                  <div className="space-y-3">
                    {volunteers.map((membership) => renderMemberRow(membership))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Leadership & Stats */}
          <div className="space-y-6">
            {/* Ministry Head Card */}
            <Card>
              <CardHeader>
                <CardTitle>Ministry Head</CardTitle>
              </CardHeader>
              <CardContent>
                {ministry.head ? (
                  <div className="flex items-center gap-3 p-3 bg-[#8B1538]/5 rounded-lg border border-[#8B1538]/20">
                    <img
                      src={headAvatar!}
                      alt={ministry.head.name}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <Link
                        to="/admin/members/$memberId/edit"
                        params={{ memberId: ministry.head.id }}
                        className="font-medium text-gray-900 hover:text-[#8B1538] block truncate text-lg"
                      >
                        {ministry.head.name}
                      </Link>
                      <p className="text-sm text-[#8B1538] font-medium">Ministry Head</p>
                      {ministry.head.phone && (
                        <p className="text-xs text-gray-500 mt-1">{ministry.head.phone}</p>
                      )}
                      {ministry.head.email && (
                        <p className="text-xs text-gray-500">{ministry.head.email}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                    No head assigned
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle>Ministry Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-600">Total Volunteers</span>
                    <span className="text-2xl font-bold text-[#8B1538]">{activeMembers.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-amber-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-amber-600">{coordinators.length}</p>
                      <p className="text-xs text-amber-600">Coordinators</p>
                    </div>
                    <div className="p-3 bg-teal-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-teal-600">{volunteers.length}</p>
                      <p className="text-xs text-teal-600">Volunteers</p>
                    </div>
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Status</span>
                      <span className={`font-medium ${ministry.is_active ? 'text-green-600' : 'text-red-600'}`}>
                        {ministry.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {ministry.department && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Department</span>
                        <span className="text-gray-700">{ministry.department}</span>
                      </div>
                    )}
                    {ministry.created_at && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Created</span>
                        <span className="text-gray-700">
                          {new Date(ministry.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open)
        if (!open) setSelectedMembers(new Map())
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Members</DialogTitle>
            <DialogDescription>Search for members to add to {ministry.name}</DialogDescription>
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
                onChange={(e) => setAddRole(e.target.value as 'head' | 'coordinator' | 'volunteer')}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="volunteer">Volunteer</option>
                <option value="coordinator">Coordinator</option>
                <option value="head">Head</option>
              </select>
            </div>
            {/* Selected members chips */}
            {selectedMembers.size > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border">
                {Array.from(selectedMembers).map(([id, name]) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#8B1538]/10 text-[#8B1538] rounded-full"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => toggleMemberSelection(id, name)}
                      className="hover:text-red-700"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
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
                const isSelected = selectedMembers.has(member.id)
                const avatar = member.photo_url || getPlaceholderAvatar(member.name)
                return (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                    <div className="flex items-center gap-3 min-w-0">
                      {!alreadyAdded && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMemberSelection(member.id, member.name)}
                          className="w-4 h-4 text-[#8B1538] rounded border-gray-300 focus:ring-[#8B1538] flex-shrink-0"
                        />
                      )}
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
                        disabled={isUpdating || isBulkAdding}
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
          <DialogFooter className="flex justify-between sm:justify-between">
            <div className="text-sm text-gray-500">
              {selectedMembers.size > 0 && `${selectedMembers.size} selected`}
            </div>
            <div className="flex gap-2">
              {selectedMembers.size > 0 && (
                <Button
                  onClick={handleBulkAddMembers}
                  disabled={isBulkAdding || isUpdating}
                  className="bg-[#8B1538] hover:bg-[#6B0F2B]"
                >
                  {isBulkAdding ? 'Adding...' : `Add Selected (${selectedMembers.size})`}
                </Button>
              )}
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog open={!!memberToRemove} onOpenChange={(open) => { if (!open) setMemberToRemove(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              Remove <strong>{memberToRemove?.member.name}</strong> from {ministry.name}? They will be marked as inactive in this ministry.
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
