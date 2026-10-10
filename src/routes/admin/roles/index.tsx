// Quest Laguna — Account Management: Roles & Permissions
// Admin-only editable matrix of role -> permission. The `admin` role is locked
// to full access. Toggles persist immediately via the server (roles.manage).

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { getRolePermissions, toggleRolePermission } from '../../../server/functions/rolePermissions'
import { PERMISSION_CATALOG } from '../../../lib/constants'
import { ROLE_ORDER, hasPermission, getRoleDisplayName, getRoleDescription } from '../../../lib/auth'
import type { UserRole } from '../../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'

export const Route = createFileRoute('/admin/roles/')({
  component: RolesPage,
})

function RolesPage() {
  const navigate = useNavigate()
  const { profile, session, isAuthenticated, isLoading: authLoading } = useAuth()
  const accessToken = session?.access_token
  const canManage = profile ? hasPermission(profile.role, 'roles.manage') : false

  const [matrix, setMatrix] = useState<Record<UserRole, string[]>>({
    admin: ['*'], finance: [], satellite: [], registration: [], discipleship: [], member: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/admin/roles')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  const load = useCallback(async () => {
    if (!accessToken || !canManage) return
    setLoading(true)
    setError('')
    try {
      const m = await getRolePermissions({ data: { accessToken } })
      setMatrix(m)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permissions')
    } finally {
      setLoading(false)
    }
  }, [accessToken, canManage])

  useEffect(() => { load() }, [load])

  const roleHas = (role: UserRole, permission: string): boolean => {
    if (role === 'admin') return true
    return (matrix[role] ?? []).includes(permission)
  }

  const handleToggle = async (role: UserRole, permission: string) => {
    if (!accessToken || role === 'admin') return
    const key = `${role}:${permission}`
    const enabled = !roleHas(role, permission)
    // optimistic update
    setMatrix((prev) => {
      const current = new Set(prev[role] ?? [])
      if (enabled) current.add(permission)
      else current.delete(permission)
      return { ...prev, [role]: [...current] }
    })
    setSavingKey(key)
    setError('')
    try {
      await toggleRolePermission({ data: { accessToken, role, permission, enabled } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update permission')
      await load() // revert to server truth
    } finally {
      setSavingKey(null)
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
            <p className="text-gray-600 mb-4">Only administrators can manage role permissions.</p>
            <Link to="/admin"><Button>Back to Dashboard</Button></Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link to="/admin" className="hover:text-[#8B1538]">Dashboard</Link>
              <span>/</span>
              <Link to="/admin/users" className="hover:text-[#8B1538]">Users</Link>
              <span>/</span>
              <span>Roles</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Roles &amp; Permissions</h1>
            <p className="text-gray-600 text-sm">
              Toggle what each role can do. Changes save automatically. The Administrator role always has full access.
            </p>
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

        {/* Role summaries */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLE_ORDER.map((role) => (
            <div key={role} className="rounded-lg border bg-white p-3">
              <p className="font-semibold text-gray-900">{getRoleDisplayName(role)}</p>
              <p className="text-xs text-gray-500">{getRoleDescription(role)}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Permission matrix</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {loading ? (
              <div className="py-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1538]" /></div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-gray-700 sticky left-0 bg-white">Permission</th>
                    {ROLE_ORDER.map((role) => (
                      <th key={role} className="px-2 py-2 text-center font-medium text-gray-700 whitespace-nowrap">
                        {getRoleDisplayName(role)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_CATALOG.map((group) => (
                    <RolesGroupRows
                      key={group.group}
                      group={group.group}
                      permissions={group.permissions}
                      roleHas={roleHas}
                      onToggle={handleToggle}
                      savingKey={savingKey}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface GroupRowsProps {
  group: string
  permissions: { value: string; label: string; description: string }[]
  roleHas: (role: UserRole, permission: string) => boolean
  onToggle: (role: UserRole, permission: string) => void
  savingKey: string | null
}

function RolesGroupRows({ group, permissions, roleHas, onToggle, savingKey }: GroupRowsProps) {
  return (
    <>
      <tr className="bg-gray-50">
        <td colSpan={ROLE_ORDER.length + 1} className="py-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {group}
        </td>
      </tr>
      {permissions.map((perm) => (
        <tr key={perm.value} className="border-b hover:bg-gray-50/60">
          <td className="py-2 pr-4 sticky left-0 bg-white">
            <span className="font-medium text-gray-800">{perm.label}</span>
            {perm.description && <span className="block text-xs text-gray-400">{perm.description}</span>}
          </td>
          {ROLE_ORDER.map((role) => {
            const checked = roleHas(role, perm.value)
            const locked = role === 'admin'
            const key = `${role}:${perm.value}`
            return (
              <td key={role} className="px-2 py-2 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked || savingKey === key}
                  onChange={() => onToggle(role, perm.value)}
                  aria-label={`${getRoleDisplayName(role)} — ${perm.label}`}
                  className="h-4 w-4 accent-[#8B1538] disabled:opacity-50"
                />
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}
