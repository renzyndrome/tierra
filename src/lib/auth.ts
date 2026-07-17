// Quest Laguna Directory - Authentication Utilities

import type { User, Session } from '@supabase/supabase-js'
import type { UserProfile, UserRole, Permission } from './types'
import { ROLE_PERMISSIONS } from './types'

// Re-export types for convenience
export type { UserProfile, UserRole, Permission }

// ============================================
// AUTH CONTEXT TYPE
// ============================================

export interface AuthState {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  isLoading: boolean
  isAuthenticated: boolean
}

export const initialAuthState: AuthState = {
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
}

// ============================================
// PERMISSION UTILITIES
// ============================================

// A role -> permissions lookup. Usually the editable `role_permissions` table
// fetched from Supabase; when absent, callers fall back to ROLE_PERMISSIONS.
export type PermissionMatrix = Partial<Record<UserRole, string[]>>

/**
 * Resolve the effective permission list for a role. Prefers the supplied
 * (DB-backed) matrix and falls back to the code defaults in ROLE_PERMISSIONS.
 */
export function permissionsForRole(role: UserRole, matrix?: PermissionMatrix): string[] {
  const fromMatrix = matrix?.[role]
  if (fromMatrix && fromMatrix.length > 0) return fromMatrix
  return ROLE_PERMISSIONS[role] ?? []
}

/**
 * Core matcher: does a granted permission list satisfy `permission`?
 * Honours the '*' wildcard and hierarchical prefixes
 * (e.g. 'members.write' grants 'members.write.self'). Shared by client and server.
 */
export function permissionMatches(granted: string[], permission: string): boolean {
  if (granted.includes('*')) return true
  if (granted.includes(permission)) return true

  const parts = permission.split('.')
  for (let i = parts.length - 1; i > 0; i--) {
    const broader = parts.slice(0, i).join('.')
    if (granted.includes(broader)) return true
  }
  return false
}

/**
 * Check if a role has a specific permission. Pass a matrix to honour
 * runtime (admin-edited) permissions; omit it to use code defaults.
 */
export function hasPermission(role: UserRole, permission: Permission, matrix?: PermissionMatrix): boolean {
  return permissionMatches(permissionsForRole(role, matrix), permission)
}

export function hasAllPermissions(role: UserRole, permissions: Permission[], matrix?: PermissionMatrix): boolean {
  return permissions.every(permission => hasPermission(role, permission, matrix))
}

export function hasAnyPermission(role: UserRole, permissions: Permission[], matrix?: PermissionMatrix): boolean {
  return permissions.some(permission => hasPermission(role, permission, matrix))
}

// ============================================
// ROLE UTILITIES
// ============================================

// Coarse privilege level. `admin` is highest; the domain roles are peers.
// Used only for blunt gating (e.g. "can enter the admin area"); precise access
// is decided by permissions, not this number.
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 100,
  finance: 50,
  satellite: 50,
  registration: 50,
  discipleship: 50,
  member: 10,
}

// Display order for role pickers and the permission matrix.
export const ROLE_ORDER: UserRole[] = [
  'admin', 'finance', 'satellite', 'registration', 'discipleship', 'member',
]

/**
 * Check if a role meets the minimum required role level.
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Get human-readable role name
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    admin: 'Administrator',
    finance: 'Finance',
    satellite: 'Satellite Manager',
    registration: 'Registration',
    discipleship: 'Discipleship',
    member: 'Member',
  }
  return names[role] ?? role
}

/**
 * Short description of what a role can do (shown in role pickers / matrix).
 */
export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    admin: 'Full access to every part of the system.',
    finance: 'Manage church finances and financial reports.',
    satellite: 'Manage satellite locations and their details.',
    registration: 'Manage weekly Sunday registration (coming soon).',
    discipleship: 'Manage Quest Circles and members.',
    member: 'Basic access — view own profile.',
  }
  return descriptions[role] ?? ''
}

/**
 * Get role badge color for UI
 */
export function getRoleBadgeColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    admin: 'bg-[#8B1538]',
    finance: 'bg-emerald-600',
    satellite: 'bg-amber-500',
    registration: 'bg-blue-500',
    discipleship: 'bg-teal-500',
    member: 'bg-gray-500',
  }
  return colors[role] ?? 'bg-gray-500'
}

// ============================================
// AUTH HELPERS
// ============================================

/**
 * Check if user can access the admin area at all (any privileged, active role).
 * Precise per-section access is still decided by permissions.
 */
export function canAccessAdmin(profile: UserProfile | null): boolean {
  if (!profile || profile.is_active === false) return false
  return ROLE_HIERARCHY[profile.role] >= 50
}

/**
 * Check if user can manage a specific satellite
 */
export function canManageSatellite(profile: UserProfile | null, satelliteId: string): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  if (profile.role === 'satellite' && profile.satellite_id === satelliteId) return true
  return false
}

/**
 * Check if user can edit a specific member
 */
export function canEditMember(profile: UserProfile | null, memberId: string): boolean {
  if (!profile) return false
  if (profile.role === 'admin') return true
  if (hasPermission(profile.role, 'members.write')) return true
  // Members can edit themselves
  if (profile.member_id === memberId) return true
  return false
}

// ============================================
// SESSION STORAGE KEYS
// ============================================

export const AUTH_STORAGE_KEYS = {
  adminPin: 'quest_admin_pin_verified',
  lastRoute: 'quest_last_route',
} as const
