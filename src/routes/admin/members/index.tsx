// Quest Laguna Directory - Admin Member Management

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { getMembers, archiveMember, restoreMember, deleteMember } from '../../../server/functions/members'
import { getSatellites } from '../../../server/functions/satellites'
import { getPlaceholderAvatar } from '../../../lib/storage'
import type { Member, SatelliteRow, PaginatedResult } from '../../../lib/types'
import { ADMIN_PIN, MEMBER_CATEGORIES, LEADERSHIP_LEVELS } from '../../../lib/constants'

// shadcn/ui components
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu'

export const Route = createFileRoute('/admin/members/')({
  component: AdminMembersPage,
})

function AdminMembersPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Check session storage for existing auth
  useEffect(() => {
    const storedAuth = sessionStorage.getItem('admin_authenticated')
    if (storedAuth === 'true') {
      setIsAuthenticated(true)
    }
  }, [])

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true)
      sessionStorage.setItem('admin_authenticated', 'true')
      setPinError('')
    } else {
      setPinError('Invalid PIN. Please try again.')
    }
  }

  if (!isAuthenticated) {
    return <PinScreen pin={pin} setPin={setPin} error={pinError} onSubmit={handlePinSubmit} />
  }

  return <MembersManagement />
}

// PIN Entry Screen
function PinScreen({
  pin,
  setPin,
  error,
  onSubmit,
}: {
  pin: string
  setPin: (pin: string) => void
  error: string
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-red-900/30">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Member Management</CardTitle>
          <CardDescription>Enter your PIN to access member management</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="text-center text-2xl tracking-widest"
              maxLength={10}
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <Button type="submit" className="w-full bg-[#8B1538] hover:bg-[#6B0F2B]">
              Access Members
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// Members Management Dashboard
function MembersManagement() {
  const [membersData, setMembersData] = useState<PaginatedResult<Member> | null>(null)
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [filterSatellite, setFilterSatellite] = useState<string>('')
  const [filterStage, setFilterStage] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterLeadership, setFilterLeadership] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showArchived, _setShowArchived] = useState(false)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [members, sats] = await Promise.all([
        getMembers({
          data: {
            query: searchQuery || undefined,
            satelliteId: filterSatellite || undefined,
            discipleshipStage: (filterStage as 'Newbie' | 'Growing' | 'Leader') || undefined,
            membershipStatus: (filterStatus as 'visitor' | 'regular' | 'active' | 'inactive') || undefined,
            page: currentPage,
            limit: 20,
            sortBy: 'name',
            sortOrder: 'asc',
          },
        }),
        getSatellites({ data: true }),
      ])
      setMembersData(members)
      setSatellites(sats)
    } catch (error) {
      console.error('Error fetching members:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [searchQuery, filterSatellite, filterStage, filterStatus, currentPage, showArchived])

  // Client-side filtering for new fields (category, leadership)
  const filteredMembers = membersData?.data.filter((member) => {
    if (filterCategory && member.member_category !== filterCategory) return false
    if (filterLeadership && member.leadership_level !== filterLeadership) return false
    return true
  }) || []

  const handleArchive = async (member: Member) => {
    try {
      await archiveMember({ data: { id: member.id } })
      fetchData()
    } catch (error) {
      console.error('Error archiving member:', error)
      alert('Failed to archive member')
    }
  }

  const handleRestore = async (member: Member) => {
    try {
      await restoreMember({ data: { id: member.id } })
      fetchData()
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
      fetchData()
    } catch (error) {
      console.error('Error deleting member:', error)
      alert('Failed to delete member')
    } finally {
      setIsDeleting(false)
    }
  }

  const getSatelliteName = (satelliteId: string | null) => {
    if (!satelliteId) return 'N/A'
    const sat = satellites.find((s) => s.id === satelliteId)
    return sat?.name?.replace('Quest ', '') || 'N/A'
  }

  const clearFilters = () => {
    setSearchQuery('')
    setFilterSatellite('')
    setFilterStage('')
    setFilterStatus('')
    setFilterCategory('')
    setFilterLeadership('')
    setCurrentPage(1)
  }

  const hasFilters = searchQuery || filterSatellite || filterStage || filterStatus || filterCategory || filterLeadership

  if (isLoading && !membersData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading members...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/admin"
                className="text-white/80 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white">Member Management</h1>
                <p className="text-red-200 text-xs">Quest Laguna Directory</p>
              </div>
            </div>
            <Link to="/admin/members/new">
              <Button className="bg-white text-[#8B1538] hover:bg-gray-100">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Member
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Members ({membersData?.pagination.total || 0})</CardTitle>
                <CardDescription>Manage church members and their profiles</CardDescription>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mt-4">
              <Input
                placeholder="Search by name, email, or city..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-64"
              />
              <select
                value={filterSatellite}
                onChange={(e) => {
                  setFilterSatellite(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">All Satellites</option>
                {satellites
                  .filter((s) => s.is_active)
                  .map((sat) => (
                    <option key={sat.id} value={sat.id}>
                      {sat.name}
                    </option>
                  ))}
              </select>
              <select
                value={filterStage}
                onChange={(e) => {
                  setFilterStage(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">All Stages</option>
                <option value="Newbie">Newbie</option>
                <option value="Growing">Growing</option>
                <option value="Leader">Leader</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">All Statuses</option>
                <option value="visitor">Visitor</option>
                <option value="regular">Regular</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">All Categories</option>
                {MEMBER_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <select
                value={filterLeadership}
                onChange={(e) => {
                  setFilterLeadership(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 border rounded-md text-sm bg-white"
              >
                <option value="">All Leadership</option>
                {LEADERSHIP_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
                  Clear filters
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {hasFilters && (
              <p className="text-sm text-gray-500 mb-3">
                Showing {membersData?.data.length || 0} of {membersData?.pagination.total || 0} members
              </p>
            )}

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
                  {!filteredMembers.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        {hasFilters ? 'No members match your filters' : 'No members found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMembers.map((member) => (
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
                                <p className="font-medium text-gray-900">{member.name}</p>
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
                                <Link to={`/directory/members/${member.id}`}>View Profile</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/admin/members/${member.id}/edit`}>Edit</Link>
                              </DropdownMenuItem>
                              {member.is_archived ? (
                                <DropdownMenuItem onClick={() => handleRestore(member)}>
                                  Restore
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleArchive(member)}>
                                  Archive
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedMember(member)
                                  setShowDeleteDialog(true)
                                }}
                              >
                                Delete Permanently
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {membersData && membersData.pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-gray-500">
                  Page {membersData.pagination.page} of {membersData.pagination.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === membersData.pagination.totalPages}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

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
    </div>
  )
}
