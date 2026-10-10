// Whether the signed-in caller holds a permission, by the live role ->
// permission matrix (the role_permissions table, which the server guards
// read; editable in Admin -> Manage Roles). A failed matrix read falls back
// to the code defaults (ROLE_PERMISSIONS), like the admin dashboard tabs.
//
// For forms that call a second guarded server function as a side step (the
// member form's Quest Circle field needs cell_groups.write): hiding the step
// when the caller lacks the permission keeps a save from half-failing.

import { useEffect, useState } from 'react'
import { getRolePermissions } from '../server/functions/rolePermissions'
import { hasPermission, type PermissionMatrix } from './auth'
import type { Permission, UserRole } from './types'

/** The matrix once loaded, 'fallback' after a failed read, null while loading. */
export type LiveMatrixState = PermissionMatrix | 'fallback' | null

/**
 * true or false once the role and the matrix are known; null while either
 * is still loading. Admin always holds every permission, as in the server
 * guard (requirePermission).
 */
export function livePermission(
  role: UserRole | null | undefined,
  permission: Permission,
  matrix: LiveMatrixState,
): boolean | null {
  if (role === 'admin') return true
  if (!role || matrix === null) return null
  return hasPermission(role, permission, matrix === 'fallback' ? undefined : matrix)
}

/** livePermission for the caller, loading the matrix with their access token. */
export function useLivePermission(
  accessToken: string | undefined,
  role: UserRole | null | undefined,
  permission: Permission,
): boolean | null {
  const [matrix, setMatrix] = useState<LiveMatrixState>(null)

  useEffect(() => {
    if (!accessToken) return
    let cancelled = false
    getRolePermissions({ data: { accessToken } })
      .then((m) => {
        if (!cancelled) setMatrix(m)
      })
      .catch((err) => {
        console.error('Error loading role permissions:', err)
        if (!cancelled) setMatrix('fallback')
      })
    return () => {
      cancelled = true
    }
  }, [accessToken])

  return livePermission(role, permission, matrix)
}
