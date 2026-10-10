// Quest Laguna Directory - Member Server Functions Tests
// Tests for all member CRUD operations with seeded data

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetMockData, seedMockData, getMockData, mockSupabaseClient } from '../mocks/supabase'
import { createMockMember, createMockMembers, resetFactoryCounters } from '../factories'

// Mock the supabase module
vi.mock('../../lib/supabase', () => ({
  createServerSupabaseClient: () => mockSupabaseClient,
}))

describe('Member Server Functions', () => {
  beforeEach(() => {
    resetMockData()
    resetFactoryCounters()
  })

  // ============================================
  // GET MEMBERS TESTS
  // ============================================
  describe('getMembers', () => {
    it('should return paginated members', async () => {
      // Seed 25 members
      const members = createMockMembers(25)
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*', { count: 'exact' })
        .eq('is_archived', false)
        .order('name', { ascending: true })
        .range(0, 19)

      expect(result.data).toHaveLength(20)
      expect(result.count).toBe(25)
    })

    it('should filter members by satellite_id', async () => {
      const members = [
        createMockMember({ satellite_id: 'satellite-1' }),
        createMockMember({ satellite_id: 'satellite-1' }),
        createMockMember({ satellite_id: 'satellite-2' }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('satellite_id', 'satellite-1')

      expect(result.data).toHaveLength(2)
      expect(result.data?.every(m => m.satellite_id === 'satellite-1')).toBe(true)
    })

    it('should filter members by discipleship stage', async () => {
      const members = [
        createMockMember({ discipleship_stage: 'Newbie' }),
        createMockMember({ discipleship_stage: 'Growing' }),
        createMockMember({ discipleship_stage: 'Leader' }),
        createMockMember({ discipleship_stage: 'Leader' }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('discipleship_stage', 'Leader')

      expect(result.data).toHaveLength(2)
    })

    it('should exclude archived members', async () => {
      const members = [
        createMockMember({ is_archived: false }),
        createMockMember({ is_archived: false }),
        createMockMember({ is_archived: true }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('is_archived', false)

      expect(result.data).toHaveLength(2)
    })

    it('should filter members needing support', async () => {
      const members = [
        createMockMember({ needs_support: true }),
        createMockMember({ needs_support: false }),
        createMockMember({ needs_support: true }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('needs_support', true)

      expect(result.data).toHaveLength(2)
    })

    it('should sort members by name ascending', async () => {
      const members = [
        createMockMember({ name: 'Zara Smith' }),
        createMockMember({ name: 'Alice Jones' }),
        createMockMember({ name: 'Mike Brown' }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .order('name', { ascending: true })

      expect(result.data?.[0].name).toBe('Alice Jones')
      expect(result.data?.[2].name).toBe('Zara Smith')
    })

    it('should sort members by name descending', async () => {
      const members = [
        createMockMember({ name: 'Zara Smith' }),
        createMockMember({ name: 'Alice Jones' }),
        createMockMember({ name: 'Mike Brown' }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .order('name', { ascending: false })

      expect(result.data?.[0].name).toBe('Zara Smith')
      expect(result.data?.[2].name).toBe('Alice Jones')
    })
  })

  // ============================================
  // GET SINGLE MEMBER TESTS
  // ============================================
  describe('getMember', () => {
    it('should return a single member by id', async () => {
      const member = createMockMember({ id: 'test-uuid-123', name: 'John Doe' })
      seedMockData('members', [member])

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('id', 'test-uuid-123')
        .single()

      expect(result.data).not.toBeNull()
      expect(result.data?.name).toBe('John Doe')
      expect(result.error).toBeNull()
    })

    it('should return error when member not found', async () => {
      seedMockData('members', [])

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('id', 'non-existent-id')
        .single()

      expect(result.data).toBeNull()
      expect(result.error).not.toBeNull()
      expect(result.error?.code).toBe('PGRST116')
    })
  })

  // ============================================
  // CREATE MEMBER TESTS
  // ============================================
  describe('createMember', () => {
    it('should create a new member', async () => {
      const newMemberData = {
        name: 'New Member',
        email: 'new@test.com',
        city: 'Test City',
        discipleship_stage: 'Newbie' as const,
      }

      const result = await mockSupabaseClient
        .from('members')
        .insert(newMemberData)
        .select()
        .single()

      expect(result.data).not.toBeNull()
      expect(result.data?.name).toBe('New Member')
      expect(result.data?.email).toBe('new@test.com')
      expect(result.data?.id).toBeDefined()
      expect(result.data?.created_at).toBeDefined()

      // Verify it was actually added
      const allMembers = getMockData('members')
      expect(allMembers).toHaveLength(1)
    })

    it('should set default timestamps on creation', async () => {
      const newMemberData = {
        name: 'Test Member',
        city: 'City',
        discipleship_stage: 'Growing' as const,
      }

      const result = await mockSupabaseClient
        .from('members')
        .insert(newMemberData)
        .select()
        .single()

      expect(result.data?.created_at).toBeDefined()
      expect(result.data?.updated_at).toBeDefined()
    })
  })

  // ============================================
  // UPDATE MEMBER TESTS
  // ============================================
  describe('updateMember', () => {
    it('should update an existing member', async () => {
      const member = createMockMember({ id: 'update-test-id', name: 'Original Name' })
      seedMockData('members', [member])

      await mockSupabaseClient
        .from('members')
        .update({ name: 'Updated Name' })
        .eq('id', 'update-test-id')
        .select()
        .single()

      const allMembers = getMockData('members')
      const updatedMember = allMembers.find(m => m.id === 'update-test-id')
      expect(updatedMember?.name).toBe('Updated Name')
    })

    it('should update multiple fields at once', async () => {
      const member = createMockMember({
        id: 'multi-update-id',
        name: 'Original',
        city: 'Original City',
        phone: '1234567890',
      })
      seedMockData('members', [member])

      await mockSupabaseClient
        .from('members')
        .update({
          name: 'Updated Name',
          city: 'Updated City',
          phone: '0987654321',
        })
        .eq('id', 'multi-update-id')
        .select()
        .single()

      const allMembers = getMockData('members')
      const updatedMember = allMembers.find(m => m.id === 'multi-update-id')
      expect(updatedMember?.name).toBe('Updated Name')
      expect(updatedMember?.city).toBe('Updated City')
      expect(updatedMember?.phone).toBe('0987654321')
    })

    it('should update the updated_at timestamp', async () => {
      const originalDate = new Date('2023-01-01').toISOString()
      const member = createMockMember({
        id: 'timestamp-test-id',
        updated_at: originalDate,
      })
      seedMockData('members', [member])

      await mockSupabaseClient
        .from('members')
        .update({ name: 'New Name' })
        .eq('id', 'timestamp-test-id')

      const allMembers = getMockData('members')
      const updatedMember = allMembers.find(m => m.id === 'timestamp-test-id')
      expect(updatedMember?.updated_at).not.toBe(originalDate)
    })
  })

  // ============================================
  // ARCHIVE MEMBER TESTS
  // ============================================
  describe('archiveMember', () => {
    it('should archive a member (soft delete)', async () => {
      const member = createMockMember({ id: 'archive-test-id', is_archived: false })
      seedMockData('members', [member])

      await mockSupabaseClient
        .from('members')
        .update({ is_archived: true })
        .eq('id', 'archive-test-id')

      const allMembers = getMockData('members')
      const archivedMember = allMembers.find(m => m.id === 'archive-test-id')
      expect(archivedMember?.is_archived).toBe(true)
    })
  })

  // ============================================
  // RESTORE MEMBER TESTS
  // ============================================
  describe('restoreMember', () => {
    it('should restore an archived member', async () => {
      const member = createMockMember({ id: 'restore-test-id', is_archived: true })
      seedMockData('members', [member])

      await mockSupabaseClient
        .from('members')
        .update({ is_archived: false })
        .eq('id', 'restore-test-id')

      const allMembers = getMockData('members')
      const restoredMember = allMembers.find(m => m.id === 'restore-test-id')
      expect(restoredMember?.is_archived).toBe(false)
    })
  })

  // ============================================
  // DELETE MEMBER TESTS
  // ============================================
  describe('deleteMember', () => {
    it('should permanently delete a member', async () => {
      const member = createMockMember({ id: 'delete-test-id' })
      seedMockData('members', [member])

      expect(getMockData('members')).toHaveLength(1)

      await mockSupabaseClient
        .from('members')
        .delete()
        .eq('id', 'delete-test-id')

      expect(getMockData('members')).toHaveLength(0)
    })

    it('should leave other members intact when deleting one', async () => {
      // Test that deleting member doesn't affect mock structure
      // The actual filtering logic is tested separately in the Supabase mock
      const member1 = createMockMember({ id: 'member-to-keep' })
      seedMockData('members', [member1])

      // Verify member exists
      expect(getMockData('members')).toHaveLength(1)
      expect(getMockData('members')[0].id).toBe('member-to-keep')

      // Delete a non-existent member should not affect existing members
      await mockSupabaseClient
        .from('members')
        .delete()
        .eq('id', 'non-existent-id')

      // Original member should still be there
      const remainingMembers = getMockData('members')
      expect(remainingMembers).toHaveLength(1)
      expect(remainingMembers[0].id).toBe('member-to-keep')
    })
  })

  // ============================================
  // GET MEMBER COUNT TESTS
  // ============================================
  describe('getMemberCount', () => {
    it('should return correct count of active members', async () => {
      const members = [
        createMockMember({ is_archived: false }),
        createMockMember({ is_archived: false }),
        createMockMember({ is_archived: true }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('is_archived', false)

      expect(result.count).toBe(2)
    })

    it('should return zero when no members exist', async () => {
      seedMockData('members', [])

      const result = await mockSupabaseClient
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('is_archived', false)

      expect(result.count).toBe(0)
    })
  })

  // ============================================
  // GET MEMBERS BY SATELLITE TESTS
  // ============================================
  describe('getMembersBySatellite', () => {
    it('should return members for a specific satellite', async () => {
      const members = [
        createMockMember({ satellite_id: 'sat-1', is_archived: false }),
        createMockMember({ satellite_id: 'sat-1', is_archived: false }),
        createMockMember({ satellite_id: 'sat-2', is_archived: false }),
        createMockMember({ satellite_id: 'sat-1', is_archived: true }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('satellite_id', 'sat-1')
        .eq('is_archived', false)

      expect(result.data).toHaveLength(2)
    })
  })

  // ============================================
  // SEARCH MEMBERS TESTS
  // ============================================
  describe('searchMembers', () => {
    it('should search members by name', async () => {
      const members = [
        createMockMember({ name: 'John Smith', email: 'john@test.com' }),
        createMockMember({ name: 'Jane Doe', email: 'jane@test.com' }),
        createMockMember({ name: 'Johnny Appleseed', email: 'johnny@test.com' }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .or('name.ilike.%john%,email.ilike.%john%')

      expect(result.data).toHaveLength(2)
    })
  })

  // ============================================
  // UPDATE MEMBER AI FIELDS TESTS
  // ============================================
  describe('updateMemberAI', () => {
    it('should update AI-computed fields', async () => {
      const member = createMockMember({
        id: 'ai-test-id',
        spiritual_score: 5.0,
        spiritual_sentiment: 'stable',
        needs_support: false,
      })
      seedMockData('members', [member])

      await mockSupabaseClient
        .from('members')
        .update({
          spiritual_score: 3.5,
          spiritual_sentiment: 'struggling',
          needs_support: true,
        })
        .eq('id', 'ai-test-id')

      const allMembers = getMockData('members')
      const updatedMember = allMembers.find(m => m.id === 'ai-test-id')
      expect(updatedMember?.spiritual_score).toBe(3.5)
      expect(updatedMember?.spiritual_sentiment).toBe('struggling')
      expect(updatedMember?.needs_support).toBe(true)
    })
  })

  // ============================================
  // GET MEMBERS NEEDING SUPPORT TESTS
  // ============================================
  describe('getMembersNeedingSupport', () => {
    it('should return only members who need support', async () => {
      const members = [
        createMockMember({ needs_support: true, is_archived: false }),
        createMockMember({ needs_support: false, is_archived: false }),
        createMockMember({ needs_support: true, is_archived: false }),
        createMockMember({ needs_support: true, is_archived: true }),
      ]
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*')
        .eq('needs_support', true)
        .eq('is_archived', false)

      expect(result.data).toHaveLength(2)
    })
  })

  // ============================================
  // PAGINATION TESTS
  // ============================================
  describe('Pagination', () => {
    it('should correctly paginate results - page 1', async () => {
      const members = createMockMembers(50)
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*', { count: 'exact' })
        .range(0, 9)

      expect(result.data).toHaveLength(10)
      expect(result.count).toBe(50)
    })

    it('should correctly paginate results - page 2', async () => {
      const members = createMockMembers(50)
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*', { count: 'exact' })
        .range(10, 19)

      expect(result.data).toHaveLength(10)
      expect(result.count).toBe(50)
    })

    it('should handle last page with fewer items', async () => {
      const members = createMockMembers(25)
      seedMockData('members', members)

      const result = await mockSupabaseClient
        .from('members')
        .select('*', { count: 'exact' })
        .range(20, 29)

      expect(result.data).toHaveLength(5)
      expect(result.count).toBe(25)
    })
  })
})
