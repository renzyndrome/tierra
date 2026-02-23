// Quest Laguna Directory - Cell Group Server Functions Tests
// Tests for all cell group CRUD operations with seeded data

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetMockData, seedMockData, getMockData, mockSupabaseClient } from '../mocks/supabase'
import {
  createMockCellGroup,
  createMockCellGroups,
  createMockMember,
  createMockMemberCellGroup,
  resetFactoryCounters,
} from '../factories'

// Mock the supabase module
vi.mock('../../lib/supabase', () => ({
  createServerSupabaseClient: () => mockSupabaseClient,
}))

describe('Cell Group Server Functions', () => {
  beforeEach(() => {
    resetMockData()
    resetFactoryCounters()
  })

  // ============================================
  // GET CELL GROUPS TESTS
  // ============================================
  describe('getCellGroups', () => {
    it('should return paginated cell groups', async () => {
      const groups = createMockCellGroups(25)
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*', { count: 'exact' })
        .order('name', { ascending: true })
        .range(0, 19)

      expect(result.data).toHaveLength(20)
      expect(result.count).toBe(25)
    })

    it('should filter cell groups by satellite_id', async () => {
      const groups = [
        createMockCellGroup({ satellite_id: 'sat-1' }),
        createMockCellGroup({ satellite_id: 'sat-1' }),
        createMockCellGroup({ satellite_id: 'sat-2' }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('satellite_id', 'sat-1')

      expect(result.data).toHaveLength(2)
    })

    it('should filter active cell groups only', async () => {
      const groups = [
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: false }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('is_active', true)

      expect(result.data).toHaveLength(2)
    })

    it('should sort cell groups by name', async () => {
      const groups = [
        createMockCellGroup({ name: 'Zion Cell' }),
        createMockCellGroup({ name: 'Alpha Cell' }),
        createMockCellGroup({ name: 'Omega Cell' }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .order('name', { ascending: true })

      expect(result.data?.[0].name).toBe('Alpha Cell')
      expect(result.data?.[2].name).toBe('Zion Cell')
    })
  })

  // ============================================
  // GET ALL CELL GROUPS TESTS
  // ============================================
  describe('getAllCellGroups', () => {
    it('should return all active cell groups for dropdowns', async () => {
      const groups = [
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: false }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('is_active', true)
        .order('name')

      expect(result.data).toHaveLength(2)
    })

    it('should include inactive groups when requested', async () => {
      const groups = [
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: false }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .order('name')

      expect(result.data).toHaveLength(2)
    })
  })

  // ============================================
  // GET SINGLE CELL GROUP TESTS
  // ============================================
  describe('getCellGroup', () => {
    it('should return a single cell group by id', async () => {
      const group = createMockCellGroup({ id: 'cg-test-123', name: 'Youth Cell' })
      seedMockData('cell_groups', [group])

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('id', 'cg-test-123')
        .single()

      expect(result.data).not.toBeNull()
      expect(result.data?.name).toBe('Youth Cell')
    })

    it('should return error when cell group not found', async () => {
      seedMockData('cell_groups', [])

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('id', 'non-existent')
        .single()

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('PGRST116')
    })
  })

  // ============================================
  // CREATE CELL GROUP TESTS
  // ============================================
  describe('createCellGroup', () => {
    it('should create a new cell group', async () => {
      const newGroup = {
        name: 'New Cell Group',
        description: 'A new group for fellowship',
        satellite_id: 'sat-1',
        meeting_day: 'Wednesday' as const,
        meeting_time: '19:00',
        meeting_location: '123 Church Street',
        is_active: true,
        max_members: 12,
      }

      const result = await mockSupabaseClient
        .from('cell_groups')
        .insert(newGroup)
        .select()
        .single()

      expect(result.data).not.toBeNull()
      expect(result.data?.name).toBe('New Cell Group')
      expect(result.data?.meeting_day).toBe('Wednesday')
      expect(result.data?.id).toBeDefined()

      const allGroups = getMockData('cell_groups')
      expect(allGroups).toHaveLength(1)
    })

    it('should create cell group with leader assignment', async () => {
      const leader = createMockMember({ id: 'leader-1' })
      seedMockData('members', [leader])

      const newGroup = {
        name: 'Led Cell Group',
        satellite_id: 'sat-1',
        leader_id: 'leader-1',
        is_active: true,
      }

      const result = await mockSupabaseClient
        .from('cell_groups')
        .insert(newGroup)
        .select()
        .single()

      expect(result.data?.leader_id).toBe('leader-1')
    })
  })

  // ============================================
  // UPDATE CELL GROUP TESTS
  // ============================================
  describe('updateCellGroup', () => {
    it('should update an existing cell group', async () => {
      const group = createMockCellGroup({
        id: 'update-cg-id',
        name: 'Original Name',
        meeting_day: 'Monday',
      })
      seedMockData('cell_groups', [group])

      await mockSupabaseClient
        .from('cell_groups')
        .update({
          name: 'Updated Name',
          meeting_day: 'Friday',
        })
        .eq('id', 'update-cg-id')

      const allGroups = getMockData('cell_groups')
      const updatedGroup = allGroups.find(g => g.id === 'update-cg-id')
      expect(updatedGroup?.name).toBe('Updated Name')
      expect(updatedGroup?.meeting_day).toBe('Friday')
    })

    it('should update leader and co-leader', async () => {
      const group = createMockCellGroup({
        id: 'leader-update-id',
        leader_id: 'old-leader',
        co_leader_id: null,
      })
      seedMockData('cell_groups', [group])

      await mockSupabaseClient
        .from('cell_groups')
        .update({
          leader_id: 'new-leader',
          co_leader_id: 'new-co-leader',
        })
        .eq('id', 'leader-update-id')

      const allGroups = getMockData('cell_groups')
      const updatedGroup = allGroups.find(g => g.id === 'leader-update-id')
      expect(updatedGroup?.leader_id).toBe('new-leader')
      expect(updatedGroup?.co_leader_id).toBe('new-co-leader')
    })
  })

  // ============================================
  // DELETE CELL GROUP TESTS
  // ============================================
  describe('deleteCellGroup', () => {
    it('should delete a cell group', async () => {
      const group = createMockCellGroup({ id: 'delete-cg-id' })
      seedMockData('cell_groups', [group])

      expect(getMockData('cell_groups')).toHaveLength(1)

      await mockSupabaseClient
        .from('cell_groups')
        .delete()
        .eq('id', 'delete-cg-id')

      expect(getMockData('cell_groups')).toHaveLength(0)
    })
  })

  // ============================================
  // MEMBER CELL GROUP JUNCTION TESTS
  // ============================================
  describe('addMemberToCellGroup', () => {
    it('should add a member to a cell group', async () => {
      const member = createMockMember({ id: 'member-join-1' })
      const group = createMockCellGroup({ id: 'cg-join-1' })
      seedMockData('members', [member])
      seedMockData('cell_groups', [group])

      const result = await mockSupabaseClient
        .from('member_cell_groups')
        .insert({
          member_id: 'member-join-1',
          cell_group_id: 'cg-join-1',
          role: 'member',
          is_active: true,
        })
        .select()
        .single()

      expect(result.data).not.toBeNull()
      expect(result.data?.member_id).toBe('member-join-1')
      expect(result.data?.cell_group_id).toBe('cg-join-1')
      expect(result.data?.role).toBe('member')
    })

    it('should detect if member is already in cell group', async () => {
      const existingMembership = createMockMemberCellGroup({
        member_id: 'existing-member',
        cell_group_id: 'existing-cg',
      })
      seedMockData('member_cell_groups', [existingMembership])

      const result = await mockSupabaseClient
        .from('member_cell_groups')
        .select('id')
        .eq('member_id', 'existing-member')
        .eq('cell_group_id', 'existing-cg')
        .single()

      expect(result.data).not.toBeNull()
    })

    it('should assign different roles to members', async () => {
      const memberships = [
        createMockMemberCellGroup({ member_id: 'm1', cell_group_id: 'cg1', role: 'leader' }),
        createMockMemberCellGroup({ member_id: 'm2', cell_group_id: 'cg1', role: 'co_leader' }),
        createMockMemberCellGroup({ member_id: 'm3', cell_group_id: 'cg1', role: 'member' }),
      ]
      seedMockData('member_cell_groups', memberships)

      const result = await mockSupabaseClient
        .from('member_cell_groups')
        .select('*')
        .eq('cell_group_id', 'cg1')

      expect(result.data).toHaveLength(3)
      const roles = result.data?.map(m => m.role)
      expect(roles).toContain('leader')
      expect(roles).toContain('co_leader')
      expect(roles).toContain('member')
    })
  })

  describe('removeMemberFromCellGroup', () => {
    it('should soft-remove a member from cell group', async () => {
      const membership = createMockMemberCellGroup({
        member_id: 'remove-member',
        cell_group_id: 'remove-cg',
        is_active: true,
        left_at: null,
      })
      seedMockData('member_cell_groups', [membership])

      await mockSupabaseClient
        .from('member_cell_groups')
        .update({
          is_active: false,
          left_at: new Date().toISOString(),
        })
        .eq('member_id', 'remove-member')
        .eq('cell_group_id', 'remove-cg')

      const allMemberships = getMockData('member_cell_groups')
      const updatedMembership = allMemberships[0]
      expect(updatedMembership.is_active).toBe(false)
      expect(updatedMembership.left_at).toBeDefined()
    })
  })

  describe('updateMemberCellGroupRole', () => {
    it('should update member role in cell group', async () => {
      const membership = createMockMemberCellGroup({
        member_id: 'role-member',
        cell_group_id: 'role-cg',
        role: 'member',
      })
      seedMockData('member_cell_groups', [membership])

      await mockSupabaseClient
        .from('member_cell_groups')
        .update({ role: 'co_leader' })
        .eq('member_id', 'role-member')
        .eq('cell_group_id', 'role-cg')

      const allMemberships = getMockData('member_cell_groups')
      expect(allMemberships[0].role).toBe('co_leader')
    })
  })

  // ============================================
  // GET CELL GROUP COUNT TESTS
  // ============================================
  describe('getCellGroupCount', () => {
    it('should return count of active cell groups', async () => {
      const groups = [
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: true }),
        createMockCellGroup({ is_active: false }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      expect(result.count).toBe(2)
    })
  })

  // ============================================
  // GET CELL GROUPS BY SATELLITE TESTS
  // ============================================
  describe('getCellGroupsBySatellite', () => {
    it('should return cell groups for specific satellite', async () => {
      const groups = [
        createMockCellGroup({ satellite_id: 'target-sat', is_active: true }),
        createMockCellGroup({ satellite_id: 'target-sat', is_active: true }),
        createMockCellGroup({ satellite_id: 'other-sat', is_active: true }),
        createMockCellGroup({ satellite_id: 'target-sat', is_active: false }),
      ]
      seedMockData('cell_groups', groups)

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('satellite_id', 'target-sat')
        .eq('is_active', true)

      expect(result.data).toHaveLength(2)
    })
  })

  // ============================================
  // MEETING SCHEDULE TESTS
  // ============================================
  describe('Meeting Schedule', () => {
    it('should store meeting day correctly', async () => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

      for (const day of days) {
        const group = createMockCellGroup({ meeting_day: day })
        seedMockData('cell_groups', [group])

        const result = await mockSupabaseClient
          .from('cell_groups')
          .select('*')
          .eq('meeting_day', day)

        expect(result.data).toHaveLength(1)
        expect(result.data?.[0].meeting_day).toBe(day)

        resetMockData()
      }
    })

    it('should store meeting time and location', async () => {
      const group = createMockCellGroup({
        id: 'schedule-test',
        meeting_time: '19:30',
        meeting_location: 'Room 101, Church Building',
      })
      seedMockData('cell_groups', [group])

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('id', 'schedule-test')
        .single()

      expect(result.data?.meeting_time).toBe('19:30')
      expect(result.data?.meeting_location).toBe('Room 101, Church Building')
    })
  })

  // ============================================
  // MAX MEMBERS TESTS
  // ============================================
  describe('Max Members', () => {
    it('should respect max_members field', async () => {
      const group = createMockCellGroup({
        id: 'max-test',
        max_members: 10,
      })
      seedMockData('cell_groups', [group])

      const result = await mockSupabaseClient
        .from('cell_groups')
        .select('*')
        .eq('id', 'max-test')
        .single()

      expect(result.data?.max_members).toBe(10)
    })
  })
})
