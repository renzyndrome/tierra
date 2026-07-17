// Account management — editable role -> permission matrix.
// Reads are open to any authenticated user (for UI gating); writes require the
// `roles.manage` permission. The `admin` role is locked to full access.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission, getCaller } from './_authGuard'
import { ALL_PERMISSIONS } from '../../lib/constants'
import type { UserRole } from '../../lib/types'

const ROLE_VALUES = ['admin', 'finance', 'satellite', 'registration', 'discipleship', 'member'] as const
const ALLOWED_PERMISSIONS = new Set<string>(ALL_PERMISSIONS as string[])

function emptyMatrix(): Record<UserRole, string[]> {
  return { admin: [], finance: [], satellite: [], registration: [], discipleship: [], member: [] }
}

// ============================================
// READ MATRIX
// ============================================

export const getRolePermissions = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<Record<UserRole, string[]>> => {
    await getCaller(data.accessToken) // any active authenticated user
    const admin = createServerAdminClient()

    const { data: rows, error } = await admin.from('role_permissions').select('role, permission')
    if (error) throw new Error('Failed to load role permissions')

    const matrix = emptyMatrix()
    for (const r of rows ?? []) {
      const role = r.role as UserRole
      if (matrix[role]) matrix[role].push(r.permission)
    }
    return matrix
  })

// ============================================
// TOGGLE A SINGLE PERMISSION
// ============================================

const toggleSchema = z.object({
  accessToken: z.string(),
  role: z.enum(ROLE_VALUES),
  permission: z.string(),
  enabled: z.boolean(),
})

export const toggleRolePermission = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof toggleSchema>) => toggleSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'roles.manage')
    if (data.role === 'admin') {
      throw new Error('The admin role always has full access and cannot be edited')
    }
    if (!ALLOWED_PERMISSIONS.has(data.permission)) {
      throw new Error('Unknown permission')
    }

    const admin = createServerAdminClient()
    if (data.enabled) {
      const { error } = await admin
        .from('role_permissions')
        .upsert({ role: data.role, permission: data.permission }, { onConflict: 'role,permission' })
      if (error) throw new Error('Failed to update permission')
    } else {
      const { error } = await admin
        .from('role_permissions')
        .delete()
        .eq('role', data.role)
        .eq('permission', data.permission)
      if (error) throw new Error('Failed to update permission')
    }
    return { success: true }
  })

// ============================================
// REPLACE A ROLE'S ENTIRE PERMISSION SET
// ============================================

const setSchema = z.object({
  accessToken: z.string(),
  role: z.enum(ROLE_VALUES),
  permissions: z.array(z.string()),
})

export const setRolePermissions = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof setSchema>) => setSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'roles.manage')
    if (data.role === 'admin') {
      throw new Error('The admin role always has full access and cannot be edited')
    }

    const perms = [...new Set(data.permissions)].filter((p) => ALLOWED_PERMISSIONS.has(p))
    const admin = createServerAdminClient()

    const { error: delErr } = await admin.from('role_permissions').delete().eq('role', data.role)
    if (delErr) throw new Error('Failed to update permissions')

    if (perms.length > 0) {
      const { error: insErr } = await admin
        .from('role_permissions')
        .insert(perms.map((permission) => ({ role: data.role, permission })))
      if (insErr) throw new Error('Failed to update permissions')
    }
    return { success: true, role: data.role, permissions: perms }
  })
