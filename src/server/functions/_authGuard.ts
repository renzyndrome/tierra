// Server-side authorization guard for server functions.
//
// The app's Supabase session lives in the browser (localStorage), so server
// functions receive the caller's access token explicitly and verify it here
// with the service-role client. Permission checks are enforced against the
// editable `role_permissions` table (the runtime source of truth), falling
// back to code defaults when a role has no rows.

import { createServerAdminClient } from '../../lib/supabase'
import type { Permission, UserRole } from '../../lib/types'
import { permissionMatches, permissionsForRole, type PermissionMatrix } from '../../lib/auth'

export interface CallerContext {
  userId: string
  email: string | null
  role: UserRole
  satelliteId: string | null
}

type AdminClient = ReturnType<typeof createServerAdminClient>

/**
 * Verify an access token and load the caller's profile. Throws when the token
 * is missing/invalid, the profile is absent, or the account is deactivated.
 */
export async function getCaller(accessToken: string | undefined | null): Promise<CallerContext> {
  if (!accessToken) throw new Error('Not authenticated')

  const admin = createServerAdminClient()
  const { data: userData, error: userErr } = await admin.auth.getUser(accessToken)
  if (userErr || !userData?.user) throw new Error('Invalid or expired session')

  const { data: profile, error: profErr } = await admin
    .from('user_profiles')
    .select('role, satellite_id, is_active')
    .eq('id', userData.user.id)
    .single()

  if (profErr || !profile) throw new Error('No profile found for this account')
  if (profile.is_active === false) throw new Error('This account has been deactivated')

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    role: profile.role as UserRole,
    satelliteId: profile.satellite_id,
  }
}

/**
 * Load the role -> permission matrix from the DB (source of truth).
 */
export async function getPermissionMatrix(admin: AdminClient): Promise<PermissionMatrix> {
  const { data, error } = await admin.from('role_permissions').select('role, permission')
  if (error || !data) return {}

  const matrix: PermissionMatrix = {}
  for (const row of data) {
    const role = row.role as UserRole
    ;(matrix[role] ??= []).push(row.permission)
  }
  return matrix
}

/**
 * Require the caller to hold a specific permission. Admin always passes.
 */
export async function requirePermission(
  accessToken: string | undefined | null,
  permission: Permission,
): Promise<CallerContext> {
  const caller = await getCaller(accessToken)
  if (caller.role === 'admin') return caller

  const admin = createServerAdminClient()
  const matrix = await getPermissionMatrix(admin)
  const granted = permissionsForRole(caller.role, matrix)

  if (!permissionMatches(granted, permission)) {
    throw new Error('You do not have permission to perform this action')
  }
  return caller
}

/**
 * Require the caller to be an admin.
 */
export async function requireAdmin(accessToken: string | undefined | null): Promise<CallerContext> {
  const caller = await getCaller(accessToken)
  if (caller.role !== 'admin') throw new Error('Admin access required')
  return caller
}
