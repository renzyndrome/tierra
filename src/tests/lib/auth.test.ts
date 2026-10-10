import { describe, it, expect } from 'vitest'
import {
  permissionMatches,
  hasPermission,
  hasMinimumRole,
  permissionsForRole,
  canAccessAdmin,
  canManageSatellite,
  canEditMember,
  getRoleDisplayName,
} from '../../lib/auth'
import type { UserProfile } from '../../lib/types'

function profile(overrides: Partial<UserProfile>): UserProfile {
  return {
    id: 'u1',
    member_id: null,
    role: 'member',
    satellite_id: null,
    is_active: true,
    last_login_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('permissionMatches', () => {
  it('wildcard grants everything', () => {
    expect(permissionMatches(['*'], 'finances.read')).toBe(true)
  })
  it('matches exact permissions', () => {
    expect(permissionMatches(['finances.read'], 'finances.read')).toBe(true)
  })
  it('a broader prefix grants a narrower permission', () => {
    expect(permissionMatches(['members.write'], 'members.write.self')).toBe(true)
  })
  it('does not treat siblings as matches', () => {
    expect(permissionMatches(['finances.write'], 'finances.read')).toBe(false)
  })
  it('empty grants nothing', () => {
    expect(permissionMatches([], 'members.read')).toBe(false)
  })
})

describe('hasPermission (code defaults)', () => {
  it('admin has every permission', () => {
    expect(hasPermission('admin', 'users.manage')).toBe(true)
    expect(hasPermission('admin', 'finances.write')).toBe(true)
  })
  it('finance can manage finances but not members', () => {
    expect(hasPermission('finance', 'finances.write')).toBe(true)
    expect(hasPermission('finance', 'members.write')).toBe(false)
  })
  it('discipleship can manage members and circles', () => {
    expect(hasPermission('discipleship', 'members.write')).toBe(true)
    expect(hasPermission('discipleship', 'cell_groups.write')).toBe(true)
    expect(hasPermission('discipleship', 'finances.read')).toBe(false)
  })
  it('member cannot manage users', () => {
    expect(hasPermission('member', 'users.manage')).toBe(false)
  })
})

describe('hasPermission (runtime matrix override)', () => {
  it('uses the matrix when a role has entries', () => {
    const matrix = { finance: ['reports.read'] }
    expect(hasPermission('finance', 'finances.write', matrix)).toBe(false)
    expect(permissionsForRole('finance', matrix)).toEqual(['reports.read'])
  })
  it('falls back to defaults when a role is absent/empty in the matrix', () => {
    expect(hasPermission('finance', 'finances.write', { satellite: [] })).toBe(true)
  })
})

describe('role helpers', () => {
  it('ranks admin above the domain roles and member', () => {
    expect(hasMinimumRole('admin', 'member')).toBe(true)
    expect(hasMinimumRole('finance', 'discipleship')).toBe(true) // peers
    expect(hasMinimumRole('member', 'discipleship')).toBe(false)
  })

  it('canAccessAdmin allows privileged active roles only', () => {
    expect(canAccessAdmin(profile({ role: 'finance' }))).toBe(true)
    expect(canAccessAdmin(profile({ role: 'member' }))).toBe(false)
    expect(canAccessAdmin(profile({ role: 'admin', is_active: false }))).toBe(false)
    expect(canAccessAdmin(null)).toBe(false)
  })

  it('canManageSatellite scopes the satellite role', () => {
    expect(canManageSatellite(profile({ role: 'admin' }), 's1')).toBe(true)
    expect(canManageSatellite(profile({ role: 'satellite', satellite_id: 's1' }), 's1')).toBe(true)
    expect(canManageSatellite(profile({ role: 'satellite', satellite_id: 's2' }), 's1')).toBe(false)
    expect(canManageSatellite(profile({ role: 'finance' }), 's1')).toBe(false)
  })

  it('canEditMember respects role and self-edit', () => {
    expect(canEditMember(profile({ role: 'admin' }), 'm1')).toBe(true)
    expect(canEditMember(profile({ role: 'discipleship' }), 'm1')).toBe(true)
    expect(canEditMember(profile({ role: 'finance' }), 'm1')).toBe(false)
    expect(canEditMember(profile({ role: 'member', member_id: 'm1' }), 'm1')).toBe(true)
  })

  it('has friendly display names for every role', () => {
    expect(getRoleDisplayName('admin')).toBe('Administrator')
    expect(getRoleDisplayName('discipleship')).toBe('Discipleship')
    expect(getRoleDisplayName('registration')).toBe('Registration')
  })
})
