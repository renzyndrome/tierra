// requirePermission (src/server/functions/_authGuard.ts) with a fake admin
// client: the caller's role comes from user_profiles and the live matrix from
// role_permissions.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const createServerAdminClient = vi.fn()
vi.mock('../../lib/supabase', () => ({ createServerAdminClient: () => createServerAdminClient() }))

import { PERMISSION_DENIED, requirePermission } from '../../server/functions/_authGuard'

function fakeAdmin(role: string, matrixRows: { role: string; permission: string }[]) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: null } }, error: null }),
    },
    from(table: string) {
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) builder[m] = () => builder
      builder.single = async () => ({ data: { role, satellite_id: null, is_active: true }, error: null })
      builder.then = (resolve: (v: unknown) => void) =>
        resolve(table === 'role_permissions' ? { data: matrixRows, error: null } : { data: null, error: null })
      return builder
    },
  }
}

beforeEach(() => {
  createServerAdminClient.mockReset()
})

describe('requirePermission', () => {
  it('refuses a caller without the permission in system register', async () => {
    createServerAdminClient.mockReturnValue(fakeAdmin('registration', [{ role: 'registration', permission: 'attendance.write' }]))
    await expect(requirePermission('token', 'members.write')).rejects.toThrow(PERMISSION_DENIED)
    expect(PERMISSION_DENIED).toBe('Not permitted. An admin grants access.')
  })

  it('passes a caller whose role holds the permission', async () => {
    createServerAdminClient.mockReturnValue(fakeAdmin('registration', [{ role: 'registration', permission: 'members.write' }]))
    await expect(requirePermission('token', 'members.write')).resolves.toMatchObject({ userId: 'user-1', role: 'registration' })
  })

  it('always passes an admin', async () => {
    createServerAdminClient.mockReturnValue(fakeAdmin('admin', []))
    await expect(requirePermission('token', 'members.write')).resolves.toMatchObject({ role: 'admin' })
  })
})
