// Unit tests for the live permission check behind the member form's Quest
// Circle field (src/lib/useLivePermission.ts).

import { describe, it, expect, vi } from 'vitest'

vi.mock('../../server/functions/rolePermissions', () => ({ getRolePermissions: vi.fn() }))

import { livePermission } from '../../lib/useLivePermission'

describe('livePermission', () => {
  it('is null while the role or the matrix is unknown', () => {
    expect(livePermission(null, 'cell_groups.write', { discipleship: ['cell_groups.write'] })).toBeNull()
    expect(livePermission('discipleship', 'cell_groups.write', null)).toBeNull()
  })

  it('reads the live matrix', () => {
    expect(livePermission('registration', 'cell_groups.write', { registration: ['members.write', 'cell_groups.write'] })).toBe(true)
    expect(livePermission('discipleship', 'cell_groups.write', { discipleship: ['members.write'] })).toBe(false)
  })

  it('falls back to the code defaults after a failed read', () => {
    expect(livePermission('discipleship', 'cell_groups.write', 'fallback')).toBe(true)
    expect(livePermission('member', 'cell_groups.write', 'fallback')).toBe(false)
  })

  it('always grants admin, as the server guard does', () => {
    expect(livePermission('admin', 'cell_groups.write', null)).toBe(true)
    expect(livePermission('admin', 'cell_groups.write', { admin: ['members.write'] })).toBe(true)
  })
})
