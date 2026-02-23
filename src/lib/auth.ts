// Quest Laguna Directory - Authentication Utilities

import { createClient } from '@supabase/supabase-js'
import type { User, Session } from '@supabase/supabase-js'
import type { UserProfile, UserRole, Permission, ROLE_PERMISSIONS } from './types'

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

const ROLE_PERMISSIONS_MAP: Record<UserRole, Permission[]> = {
  super_admin: ['*'],
  satellite_leader: [
    'members.read', 'members.write', 'members.delete',
    'cell_groups.read', 'cell_groups.write', 'cell_groups.delete',
    'ministries.read', 'ministries.write',
    'analytics.read', 'ai.generate'
  ],
  cell_leader: [
    'members.read', 'members.write.own_group',
    'cell_groups.read', 'cell_groups.write.own',
    'ministries.read'
  ],
  member: [
    'members.read.public', 'members.write.self',
    'cell_groups.read', 'ministries.read'
  ]
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS_MAP[role]

  // Super admin has all permissions
  if (permissions.includes('*')) {
    return true
  }

  // Check exact permission match
  if (permissions.includes(permission)) {
    return true
  }

  // Check if user has broader permission (e.g., 'members.write' covers 'members.write.self')
  const permissionParts = permission.split('.')
  for (let i = permissionParts.length - 1; i > 0; i--) {
    const broaderPermission = permissionParts.slice(0, i).join('.') as Permission
    if (permissions.includes(broaderPermission)) {
      return true
    }
  }

  return false
}

/**
 * Check if a role has all specified permissions
 */
export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every(permission => hasPermission(role, permission))
}

/**
 * Check if a role has any of the specified permissions
 */
export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some(permission => hasPermission(role, permission))
}

// ============================================
// ROLE UTILITIES
// ============================================

const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 4,
  satellite_leader: 3,
  cell_leader: 2,
  member: 1,
}

/**
 * Check if a role meets the minimum required role level
 */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

/**
 * Get human-readable role name
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    satellite_leader: 'Satellite Leader',
    cell_leader: 'Cell Group Leader',
    member: 'Member',
  }
  return names[role]
}

/**
 * Get role badge color for UI
 */
export function getRoleBadgeColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    super_admin: 'bg-[#8B1538]',
    satellite_leader: 'bg-amber-500',
    cell_leader: 'bg-teal-500',
    member: 'bg-gray-500',
  }
  return colors[role]
}

// ============================================
// AUTH HELPERS
// ============================================

/**
 * Check if user can access admin features
 */
export function canAccessAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false
  return hasMinimumRole(profile.role, 'cell_leader')
}

/**
 * Check if user can manage a specific satellite
 */
export function canManageSatellite(profile: UserProfile | null, satelliteId: string): boolean {
  if (!profile) return false
  if (profile.role === 'super_admin') return true
  if (profile.role === 'satellite_leader' && profile.satellite_id === satelliteId) return true
  return false
}

/**
 * Check if user can edit a specific member
 */
export function canEditMember(profile: UserProfile | null, memberId: string): boolean {
  if (!profile) return false
  if (profile.role === 'super_admin') return true
  if (profile.role === 'satellite_leader') return true
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
