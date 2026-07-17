// Quest Laguna — Account Management: Users
// Admin-only page to invite users, assign roles, and (de)activate accounts.

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import {
  listUsers,
  inviteUser,
  updateUserRole,
  setUserActive,
  deleteUser,
  listInvitations,
  revokeInvitation,
  resendInvitation,
} from '../../../server/functions/users'
import { clearFinancePin } from '../../../server/functions/financePin'
import { getSatellites } from '../../../server/functions/satellites'
import { getAllMinistries } from '../../../server/functions/ministries'
import type { AdminUserListItem, UserInvitation, UserRole, SatelliteRow } from '../../../lib/types'
import { ASSIGNABLE_ROLES } from '../../../lib/constants'
import { hasPermission, getRoleDisplayName, getRoleBadgeColor, getRoleDescription } from '../../../lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Switch } from '../../../components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog'

export const Route = createFileRoute('/admin/users/')({
  component: UsersPage,
})

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${getRoleBadgeColor(role)}`}>
      {getRoleDisplayName(role)}
    </span>
  )
}

function UsersPage() {
  const navigate = useNavigate()
  const { profile, session, isAuthenticated, isLoading: authLoading } = useAuth()
  const accessToken = session?.access_token
  const canManage = profile ? hasPermission(profile.role, 'users.manage') : false

  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [ministries, setMinistries] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Invite dialog
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('member')
  const [inviteSatelliteId, setInviteSatelliteId] = useState('')
  const [inviteMinistryId, setInviteMinistryId] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteNotice, setInviteNotice] = useState('')
  const [inviteSent, setInviteSent] = useState(false)

  // Edit-role dialog
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('member')
  const [editSatelliteId, setEditSatelliteId] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')

  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

  // Delete-user confirmation
  const [userToDelete, setUserToDelete] = useState<AdminUserListItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/admin/users')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  const loadData = useCallback(async () => {
    if (!accessToken || !canManage) return
    setLoading(true)
    setLoadError('')
    try {
      const [u, inv, sats, mins] = await Promise.all([
        listUsers({ data: { accessToken } }),
        listInvitations({ data: { accessToken } }),
        getSatellites({ data: true }),
        getAllMinistries({ data: { activeOnly: true } }),
      ])
      setUsers(u)
      setInvitations(inv)
      setSatellites(sats)
      setMinistries(mins.map((m) => ({ id: m.id, name: m.name })))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [accessToken, canManage])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setInviteBusy(true)
    setInviteError('')
    setInviteLink(null)
    setInviteNotice('')
    try {
      const res = await inviteUser({
        data: {
          accessToken,
          email: inviteEmail.trim(),
          role: inviteRole,
          satelliteId: inviteSatelliteId || null,
          ministryId: inviteMinistryId || null,
        },
      })
      setInviteNotice(
        res.emailed
          ? `Invitation email sent to ${inviteEmail.trim()}.`
          : `Account created for ${inviteEmail.trim()}. Email could not be sent automatically — share the invite link below.`,
      )
      setInviteLink(res.actionLink)
      setInviteSent(true)
      setInviteEmail('')
      setInviteRole('member')
      setInviteSatelliteId('')
      setInviteMinistryId('')
      await loadData()
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to invite user')
    } finally {
      setInviteBusy(false)
    }
  }

  const openEdit = (u: AdminUserListItem) => {
    setEditingUser(u)
    setEditRole(u.role)
    setEditSatelliteId(u.satellite_id ?? '')
    setEditError('')
  }

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken || !editingUser) return
    setEditBusy(true)
    setEditError('')
    try {
      await updateUserRole({
        data: {
          accessToken,
          userId: editingUser.id,
          role: editRole,
          satelliteId: editSatelliteId || null,
        },
      })
      setEditingUser(null)
      await loadData()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setEditBusy(false)
    }
  }

  const handleToggleActive = async (u: AdminUserListItem) => {
    if (!accessToken) return
    setRowBusyId(u.id)
    try {
      await setUserActive({ data: { accessToken, userId: u.id, isActive: !u.is_active } })
      await loadData()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to update account')
    } finally {
      setRowBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!accessToken || !userToDelete) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await deleteUser({ data: { accessToken, userId: userToDelete.id } })
      setUserToDelete(null)
      await loadData()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to remove user')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleResetPin = async (u: AdminUserListItem) => {
    if (!accessToken) return
    setRowBusyId(u.id)
    try {
      await clearFinancePin({ data: { accessToken, userId: u.id } })
      await loadData()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to reset PIN')
    } finally {
      setRowBusyId(null)
    }
  }

  const handleResend = async (inv: UserInvitation) => {
    if (!accessToken) return
    setRowBusyId(inv.id)
    try {
      const res = await resendInvitation({ data: { accessToken, invitationId: inv.id } })
      if (!res.emailed && res.actionLink) {
        setInviteLink(res.actionLink)
        setInviteNotice(`Email could not be sent. Share this link with ${inv.email}.`)
        setShowInvite(true)
      }
      await loadData()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to resend invitation')
    } finally {
      setRowBusyId(null)
    }
  }

  const handleRevoke = async (inv: UserInvitation) => {
    if (!accessToken) return
    setRowBusyId(inv.id)
    try {
      await revokeInvitation({ data: { accessToken, invitationId: inv.id } })
      await loadData()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to revoke invitation')
    } finally {
      setRowBusyId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1538]" />
      </div>
    )
  }
  if (!isAuthenticated) return null

  if (!canManage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-medium text-gray-900 mb-2">Access Restricted</p>
            <p className="text-gray-600 mb-4">Only administrators can manage user accounts.</p>
            <Link to="/admin">
              <Button>Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pendingInvites = invitations.filter((i) => i.status === 'pending')
  // Emails with an outstanding invite — their account exists but isn't accepted yet.
  const pendingEmails = new Set(pendingInvites.map((i) => i.email.toLowerCase()))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link to="/admin" className="hover:text-[#8B1538]">Dashboard</Link>
              <span>/</span>
              <span>Users</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">User Accounts</h1>
            <p className="text-gray-600 text-sm">Invite people and manage their roles &amp; access.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/roles">
              <Button variant="outline">Manage Roles</Button>
            </Link>
            <Button onClick={() => { setShowInvite(true); setInviteError(''); setInviteLink(null); setInviteNotice(''); setInviteSent(false); setInviteSatelliteId(''); setInviteMinistryId('') }} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
              Invite User
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{loadError}</div>
        )}

        <Card>
          <CardHeader><CardTitle>Users ({users.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="py-10 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1538]" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Satellite</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Finance PIN</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.email ?? '—'}
                        {u.member_name && <span className="block text-xs text-gray-500">{u.member_name}</span>}
                      </TableCell>
                      <TableCell><RoleBadge role={u.role} /></TableCell>
                      <TableCell className="text-sm text-gray-600">{u.satellite_name ?? '—'}</TableCell>
                      <TableCell>
                        {pendingEmails.has((u.email ?? '').toLowerCase()) ? (
                          <span className="text-xs font-medium text-amber-600">Invited</span>
                        ) : (
                          <span className={`text-xs font-medium ${u.is_active ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {u.has_finance_pin ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-emerald-600">Set</span>
                            <button onClick={() => handleResetPin(u)} disabled={rowBusyId === u.id} className="text-xs text-gray-500 underline hover:text-[#8B1538]">reset</button>
                          </span>
                        ) : (
                          <span className="text-gray-400">Not set</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => openEdit(u)} className="text-sm text-[#8B1538] hover:underline">Edit role</button>
                          <Switch checked={u.is_active} onCheckedChange={() => handleToggleActive(u)} disabled={rowBusyId === u.id} />
                          <button
                            onClick={() => { setUserToDelete(u); setDeleteError('') }}
                            disabled={u.id === profile?.id}
                            title={u.id === profile?.id ? "You can't remove your own account" : 'Remove user'}
                            className="text-sm text-red-600 hover:underline disabled:text-gray-300 disabled:no-underline"
                          >
                            Remove
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-gray-500 py-6">No users yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {pendingInvites.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Pending Invitations ({pendingInvites.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell><RoleBadge role={inv.role} /></TableCell>
                      <TableCell className="text-sm text-gray-600">{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => handleResend(inv)} disabled={rowBusyId === inv.id} className="text-sm text-[#8B1538] hover:underline">Resend</button>
                          <button onClick={() => handleRevoke(inv)} disabled={rowBusyId === inv.id} className="text-sm text-red-600 hover:underline">Revoke</button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>They'll receive an email to set their password and sign in.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="person@example.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role">Role</Label>
              <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className="w-full border rounded-md h-10 px-3 text-sm">
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{getRoleDisplayName(r)}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">{getRoleDescription(inviteRole)}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="invite-sat">Satellite (optional)</Label>
                <select id="invite-sat" value={inviteSatelliteId} onChange={(e) => setInviteSatelliteId(e.target.value)} className="w-full border rounded-md h-10 px-3 text-sm">
                  <option value="">Not assigned</option>
                  {satellites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="invite-min">Ministry (optional)</Label>
                <select id="invite-min" value={inviteMinistryId} onChange={(e) => setInviteMinistryId(e.target.value)} className="w-full border rounded-md h-10 px-3 text-sm">
                  <option value="">Not assigned</option>
                  {ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">Pre-assign now, or the invitee picks these during onboarding.</p>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
            {inviteNotice && <p className="text-sm text-emerald-700">{inviteNotice}</p>}
            {inviteLink && (
              <div className="space-y-1">
                <Label>Invite link</Label>
                <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
              </div>
            )}
            <DialogFooter>
              {inviteSent ? (
                <>
                  <Button type="button" variant="outline" onClick={() => { setInviteSent(false); setInviteNotice(''); setInviteLink(null); setInviteError('') }}>
                    Invite another
                  </Button>
                  <Button type="button" onClick={() => setShowInvite(false)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Close</Button>
                  <Button type="submit" disabled={inviteBusy} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                    {inviteBusy ? 'Sending…' : 'Send invite'}
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit-role dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateRole} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-role">Role</Label>
              <select id="edit-role" value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className="w-full border rounded-md h-10 px-3 text-sm">
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{getRoleDisplayName(r)}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500">{getRoleDescription(editRole)}</p>
            </div>
            {editRole === 'satellite' && (
              <div className="space-y-1">
                <Label htmlFor="edit-sat">Satellite (optional)</Label>
                <select id="edit-sat" value={editSatelliteId} onChange={(e) => setEditSatelliteId(e.target.value)} className="w-full border rounded-md h-10 px-3 text-sm">
                  <option value="">All / none</option>
                  {satellites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {editError && <p className="text-sm text-red-600">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button type="submit" disabled={editBusy} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                {editBusy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove-user confirmation */}
      <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Remove user</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{userToDelete?.email}</strong> and their access
              (login, role, and finance PIN). Their directory member record is kept. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUserToDelete(null)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={deleteBusy} onClick={handleDelete}>
              {deleteBusy ? 'Removing…' : 'Remove user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
