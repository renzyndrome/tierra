// Quest Laguna Directory - Members Tab Content (Card/Table Toggle)

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { MemberCard, MemberCardSkeleton } from './MemberCard'
import { archiveMember, restoreMember, deleteMember } from '../server/functions/members'
import { getPlaceholderAvatar } from '../lib/storage'
import { MEMBER_CATEGORIES, LEADERSHIP_LEVELS, DISCIPLESHIP_JOURNEY_STAGES } from '../lib/constants'
import type { Member, Satellite } from '../lib/types'

// shadcn/ui
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

// ============================================
// TYPES
// ============================================

interface MembersTabContentProps {
  members: Member[]
  satellites: Satellite[]
  isLoading: boolean
  onDataChanged: () => void
}

type ViewMode = 'card' | 'table'

// ============================================
// COMPONENT
// ============================================

export function MembersTabContent({ members, satellites, isLoading, onDataChanged }: MembersTabContentProps) {
  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('card')

  // Filters (internal — separate from dashboard shared filters)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSatellite, setFilterSatellite] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLeadership, setFilterLeadership] = useState('')
  const [filterJourney, setFilterJourney] = useState('')

  // Sort
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Actions
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Derived data
  const uniqueCities = [...new Set(members.map(m => m.city).filter(Boolean))].sort()

  const hasFilters = filterSatellite || filterStage || filterStatus || filterCity || filterCategory || filterLeadership || filterJourney || sortBy !== 'name' || sortOrder !== 'asc'

  const clearFilters = () => {
    setFilterSatellite('')
    setFilterStage('')
    setFilterStatus('')
    setFilterCity('')
    setFilterCategory('')
    setFilterLeadership('')
    setFilterJourney('')
    setSortBy('name')
    setSortOrder('asc')
  }

  // Filter + sort
  const filteredMembers = members
    .filter((member) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match = member.name.toLowerCase().includes(q) ||
          member.city.toLowerCase().includes(q) ||
          member.email?.toLowerCase().includes(q)
        if (!match) return false
      }
      if (filterSatellite && member.satellite_id !== filterSatellite) return false
      if (filterStage && member.discipleship_stage !== filterStage) return false
      if (filterStatus && member.membership_status !== filterStatus) return false
      if (filterCity && member.city !== filterCity) return false
      if (filterCategory && member.member_category !== filterCategory) return false
      if (filterLeadership && member.leadership_level !== filterLeadership) return false
      if (filterJourney && member.discipleship_journey !== filterJourney) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      switch (sortBy) {
        case 'name': cmp = a.name.localeCompare(b.name); break
        case 'age': cmp = (a.age || 0) - (b.age || 0); break
        case 'city': cmp = a.city.localeCompare(b.city); break
        case 'stage': cmp = a.discipleship_stage.localeCompare(b.discipleship_stage); break
        case 'status': cmp = (a.membership_status || '').localeCompare(b.membership_status || ''); break
        case 'newest': cmp = new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); break
      }
      return sortOrder === 'desc' ? -cmp : cmp
    })

  // Actions
  const getSatelliteName = (satelliteId: string | null) => {
    if (!satelliteId) return 'N/A'
    const sat = satellites.find(s => s.id === satelliteId)
    return sat?.name?.replace('Quest ', '') || 'N/A'
  }

  const handleArchive = async (member: Member) => {
    try {
      await archiveMember({ data: { id: member.id } })
      onDataChanged()
    } catch (error) {
      console.error('Error archiving member:', error)
      alert('Failed to archive member')
    }
  }

  const handleRestore = async (member: Member) => {
    try {
      await restoreMember({ data: { id: member.id } })
      onDataChanged()
    } catch (error) {
      console.error('Error restoring member:', error)
      alert('Failed to restore member')
    }
  }

  const handleDelete = async () => {
    if (!selectedMember) return
    setIsDeleting(true)
    try {
      await deleteMember({ data: { id: selectedMember.id } })
      setShowDeleteDialog(false)
      setSelectedMember(null)
      onDataChanged()
    } catch (error) {
      console.error('Error deleting member:', error)
      alert('Failed to delete member')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>Members Directory</CardTitle>
              <CardDescription>{isLoading ? 'Loading members...' : `${filteredMembers.length} members found`}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-1.5 text-sm ${viewMode === 'card' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Card view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 text-sm ${viewMode === 'table' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  title="Table view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </button>
              </div>
              <Link to="/admin/members/new">
                <Button size="sm">Add Member</Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and Sort */}
          <div className="flex flex-col md:flex-row gap-3 mb-3">
            <div className="flex-1">
              <Input
                placeholder="Search by name, city, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                <option value="name">Sort: Name</option>
                <option value="age">Sort: Age</option>
                <option value="city">Sort: City</option>
                <option value="stage">Sort: Stage</option>
                <option value="status">Sort: Status</option>
                <option value="newest">Sort: Newest</option>
              </select>
              <button
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-6">
            <select
              value={filterSatellite}
              onChange={(e) => setFilterSatellite(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Satellites</option>
              {satellites.filter(s => s.is_active).map((sat) => (
                <option key={sat.id} value={sat.id}>{sat.name}</option>
              ))}
            </select>
            <select
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Stages</option>
              <option value="Newbie">Newbie</option>
              <option value="Growing">Growing</option>
              <option value="Leader">Leader</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Statuses</option>
              <option value="visitor">Visitor</option>
              <option value="regular">Regular</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Cities</option>
              {uniqueCities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Categories</option>
              {MEMBER_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
            <select
              value={filterLeadership}
              onChange={(e) => setFilterLeadership(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Leadership</option>
              {LEADERSHIP_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>{level.label}</option>
              ))}
            </select>
            <select
              value={filterJourney}
              onChange={(e) => setFilterJourney(e.target.value)}
              className="px-3 py-1.5 border rounded-md text-sm bg-white"
            >
              <option value="">All Journey Stages</option>
              {DISCIPLESHIP_JOURNEY_STAGES.map((stage) => (
                <option key={stage.value} value={stage.value}>{stage.label}</option>
              ))}
            </select>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md border border-red-200"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <MemberCardSkeleton key={i} />)}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No members found</p>
            </div>
          ) : viewMode === 'card' ? (
            /* ===== CARD VIEW ===== */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMembers.map((member) => (
                <div key={member.id} className="group relative">
                  <MemberCard member={member} />
                  {/* Action menu overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MemberActionMenu
                      member={member}
                      onArchive={() => handleArchive(member)}
                      onRestore={() => handleRestore(member)}
                      onDelete={() => { setSelectedMember(member); setShowDeleteDialog(true) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ===== TABLE VIEW ===== */
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold">Member</TableHead>
                    <TableHead className="font-semibold">Contact</TableHead>
                    <TableHead className="font-semibold">Satellite</TableHead>
                    <TableHead className="font-semibold">Stage</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => (
                    <TableRow key={member.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <img
                            src={member.photo_url || getPlaceholderAvatar(member.name)}
                            alt={member.name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link
                                to="/directory/members/$memberId"
                                params={{ memberId: member.id }}
                                className="font-medium text-gray-900 hover:text-[#8B1538] hover:underline"
                              >
                                {member.name}
                              </Link>
                              {member.member_category && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">
                                  {member.member_category}
                                </span>
                              )}
                              {member.leadership_level && member.leadership_level !== 'Member' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700">
                                  {member.leadership_level}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">{member.city}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {member.email && <p className="text-gray-600">{member.email}</p>}
                          {member.phone && <p className="text-gray-500 text-xs">{member.phone}</p>}
                          {!member.email && !member.phone && (
                            <span className="text-gray-400">No contact</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                          {getSatelliteName(member.satellite_id)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            member.discipleship_stage === 'Newbie'
                              ? 'bg-amber-100 text-amber-800'
                              : member.discipleship_stage === 'Growing'
                                ? 'bg-teal-100 text-teal-800'
                                : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {member.discipleship_stage}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            member.membership_status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : member.membership_status === 'inactive'
                                ? 'bg-gray-100 text-gray-600'
                                : member.membership_status === 'visitor'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {member.membership_status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <MemberActionMenu
                          member={member}
                          onArchive={() => handleArchive(member)}
                          onRestore={() => handleRestore(member)}
                          onDelete={() => { setSelectedMember(member); setShowDeleteDialog(true) }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Member Permanently</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{selectedMember?.name}</strong>? This action cannot be
              undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================
// MEMBER ACTION MENU (3-dot dropdown)
// ============================================

function MemberActionMenu({
  member,
  onArchive,
  onRestore,
  onDelete,
}: {
  member: Member
  onArchive: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
            />
          </svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/directory/members/$memberId" params={{ memberId: member.id }}>
            View Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/members/$memberId/edit" params={{ memberId: member.id }}>
            Edit
          </Link>
        </DropdownMenuItem>
        {member.is_archived ? (
          <DropdownMenuItem onClick={onRestore}>Restore</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onArchive}>Archive</DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-red-600" onClick={onDelete}>
          Delete Permanently
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
