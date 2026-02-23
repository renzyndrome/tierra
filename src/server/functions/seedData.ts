// Quest Laguna Directory - Seed Data Server Functions
// Provides test data for development and demonstration

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
// Note: All seed functions use adminClient to bypass RLS policies

// Test accounts to create
const testAccounts = [
  { email: 'admin@quest.test', password: 'admin123', role: 'super_admin' as const, name: 'Super Admin' },
  { email: 'leader@quest.test', password: 'leader123', role: 'satellite_leader' as const, name: 'Satellite Leader' },
  { email: 'cell@quest.test', password: 'cell123', role: 'cell_leader' as const, name: 'Cell Leader' },
  { email: 'member@quest.test', password: 'member123', role: 'member' as const, name: 'Test Member' },
]

// Seed data for satellites (9 real locations from church spreadsheet)
const seedSatellites = [
  { name: 'Quest Laguna Main', description: 'Main church - San Pedro/Biñan area', is_active: true },
  { name: 'Quest Biñan', description: 'Biñan satellite - Dela Paz & San Vicente communities', is_active: true },
  { name: 'Quest Sta. Rosa', description: 'Santa Rosa, Laguna satellite', is_active: true },
  { name: 'Quest Las Piñas', description: 'Las Piñas City satellite', is_active: true },
  { name: 'Quest San Pedro', description: 'San Pedro City satellite', is_active: true },
  { name: 'Quest Cavinti', description: 'Cavinti, Laguna satellite', is_active: true },
  { name: 'Quest Southville', description: 'Southville 3A, San Antonio, San Pedro satellite', is_active: true },
  { name: 'Quest Los Baños', description: 'Los Baños, Laguna satellite', is_active: true },
  { name: 'Quest Ondoy', description: 'Ondoy area satellite', is_active: true },
]

// Demo seed members (small set for development/testing)
const seedMembers = [
  { name: 'Demo Admin', email: 'demo.admin@quest.test', phone: '09171234567', age: 35, city: 'San Pedro', discipleship_stage: 'Leader', membership_status: 'active', gender: 'male', leadership_level: 'Pastor' },
  { name: 'Demo Leader', email: 'demo.leader@quest.test', phone: '09181234567', age: 30, city: 'Biñan', discipleship_stage: 'Growing', membership_status: 'active', gender: 'female', leadership_level: 'Disciple Maker' },
  { name: 'Demo Member', email: 'demo.member@quest.test', phone: '09191234567', age: 22, city: 'Santa Rosa', discipleship_stage: 'Newbie', membership_status: 'active', gender: 'male', leadership_level: 'Member' },
]

// Cell groups (no data from spreadsheet yet - empty for now)
const seedCellGroups: { name: string; description: string; meeting_day: string; meeting_time: string; meeting_location: string; max_members: number; is_active: boolean }[] = []

// Seed data for ministries (17 real ministries from church spreadsheet)
const seedMinistries = [
  { name: 'Praise and Worship', description: 'Music and worship team', department: 'Worship', is_active: true },
  { name: 'Dance Ministry', description: 'Dance and creative arts ministry', department: 'Worship', is_active: true },
  { name: 'Preaching', description: 'Preaching and sermon delivery', department: 'Teaching', is_active: true },
  { name: 'Teaching (SOD)', description: 'School of Disciples teaching team', department: 'Discipleship', is_active: true },
  { name: 'Pastoral', description: 'Pastoral care and counseling', department: 'Leadership', is_active: true },
  { name: 'Church Planting', description: 'Church planting and expansion', department: 'Missions', is_active: true },
  { name: 'Campus Harvest', description: 'Campus ministry and student outreach', department: 'Outreach', is_active: true },
  { name: 'Ushering Team', description: 'Ushers, greeters, and hospitality', department: 'Service', is_active: true },
  { name: 'Kitchen Ministry', description: 'Food preparation and hospitality', department: 'Service', is_active: true },
  { name: 'Church Admin and Finance', description: 'Church administration and finances', department: 'Administration', is_active: true },
  { name: 'Events', description: 'Event planning and coordination', department: 'Administration', is_active: true },
  { name: 'Counters', description: 'Offering counters and finance support', department: 'Administration', is_active: true },
  { name: 'BTS/Tech', description: 'Behind the scenes, sound, media, and tech', department: 'Technical', is_active: true },
  { name: 'AHALTA (Men)', description: 'Men\'s fellowship and discipleship', department: 'Fellowship', is_active: true },
  { name: 'EBA (Women)', description: 'Women\'s fellowship and discipleship', department: 'Fellowship', is_active: true },
  { name: 'Prayer Warrior Ministry', description: 'Intercessory prayer team', department: 'Prayer', is_active: true },
  { name: 'Kids Ministry', description: 'Children\'s ministry and Sunday school', department: 'Children', is_active: true },
]

// Seed all data
export const seedAllData = createServerFn({ method: 'POST' })
  .inputValidator((input: { adminPin: string }) => z.object({
    adminPin: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    // Verify admin PIN
    const expectedPin = process.env.VITE_ADMIN_PIN || 'quest2026'
    if (data.adminPin !== expectedPin) {
      throw new Error('Invalid admin PIN')
    }

    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to seed data. Add it to your .env file.')
    }

    // Use admin client to bypass RLS
    const supabase = createServerAdminClient()
    const results = {
      satellites: 0,
      members: 0,
      cellGroups: 0,
      ministries: 0,
      memberships: 0,
    }

    try {
      // 1. Seed satellites
      const { data: satellites, error: satError } = await supabase
        .from('satellites')
        .upsert(seedSatellites, { onConflict: 'name' })
        .select()

      if (satError) throw new Error(`Satellites error: ${satError.message}`)
      results.satellites = satellites?.length || 0

      // Get satellite IDs for foreign keys
      const { data: allSatellites } = await supabase
        .from('satellites')
        .select('id, name')

      const satelliteMap = new Map(allSatellites?.map(s => [s.name, s.id]) || [])

      // 2. Seed members (distribute across all satellites)
      const satelliteIds = Array.from(satelliteMap.values())
      const membersWithSatellites = seedMembers.map((member, index) => ({
        ...member,
        satellite_id: satelliteIds[index % satelliteIds.length],
      }))

      const { data: members, error: memError } = await supabase
        .from('members')
        .upsert(membersWithSatellites, { onConflict: 'email' })
        .select()

      if (memError) throw new Error(`Members error: ${memError.message}`)
      results.members = members?.length || 0

      // Get all members for relationships
      const { data: allMembers } = await supabase
        .from('members')
        .select('id, name, discipleship_stage')

      const leaderMembers = allMembers?.filter(m => m.discipleship_stage === 'Leader') || []

      // 3. Seed cell groups (distribute across all satellites)
      // First check existing cell groups to avoid duplicates
      const { data: existingCellGroups } = await supabase
        .from('cell_groups')
        .select('name')
      const existingCgNames = new Set(existingCellGroups?.map(cg => cg.name) || [])

      const newCellGroups = seedCellGroups
        .filter(cg => !existingCgNames.has(cg.name))
        .map((cg, index) => ({
          ...cg,
          satellite_id: satelliteIds[index % satelliteIds.length],
          leader_id: leaderMembers[index % leaderMembers.length]?.id,
        }))

      if (newCellGroups.length > 0) {
        const { data: cellGroups, error: cgError } = await supabase
          .from('cell_groups')
          .insert(newCellGroups)
          .select()

        if (cgError) throw new Error(`Cell groups error: ${cgError.message}`)
        results.cellGroups = cellGroups?.length || 0
      }

      // 4. Seed ministries
      // First check existing ministries to avoid duplicates
      const { data: existingMinistries } = await supabase
        .from('ministries')
        .select('name')
      const existingMinNames = new Set(existingMinistries?.map(m => m.name) || [])

      const newMinistries = seedMinistries
        .filter(min => !existingMinNames.has(min.name))
        .map((min, index) => ({
          ...min,
          head_id: leaderMembers.length > 0 ? leaderMembers[index % leaderMembers.length]?.id : null,
        }))

      if (newMinistries.length > 0) {
        const { data: ministries, error: minError } = await supabase
          .from('ministries')
          .insert(newMinistries)
          .select()

        if (minError) throw new Error(`Ministries error: ${minError.message}`)
        results.ministries = ministries?.length || 0
      }

      // 5. Create memberships (scaled up for more members)
      const { data: allCellGroups } = await supabase.from('cell_groups').select('id')
      const { data: allMinistries } = await supabase.from('ministries').select('id')

      // Add members to cell groups (most members in a cell group)
      if (allMembers && allCellGroups && allCellGroups.length > 0) {
        const cgMemberships = allMembers.slice(0, 50).map((member, index) => ({
          member_id: member.id,
          cell_group_id: allCellGroups[index % allCellGroups.length].id,
          role: member.discipleship_stage === 'Leader' ? 'leader' : 'member',
          is_active: true,
        }))

        const { data: cgMemResult } = await supabase
          .from('member_cell_groups')
          .upsert(cgMemberships, { onConflict: 'member_id,cell_group_id' })
          .select()

        results.memberships += cgMemResult?.length || 0
      }

      // Add members to ministries (many members serve in ministries)
      if (allMembers && allMinistries && allMinistries.length > 0) {
        const minMemberships = allMembers.slice(0, 45).map((member, index) => ({
          member_id: member.id,
          ministry_id: allMinistries[index % allMinistries.length].id,
          role: member.discipleship_stage === 'Leader' ? 'coordinator' : 'volunteer',
          is_active: true,
        }))

        const { data: minMemResult } = await supabase
          .from('member_ministries')
          .upsert(minMemberships, { onConflict: 'member_id,ministry_id' })
          .select()

        results.memberships += minMemResult?.length || 0
      }

      return { success: true, results }
    } catch (error) {
      console.error('Seed error:', error)
      throw error
    }
  })

// Seed test accounts
export const seedTestAccounts = createServerFn({ method: 'POST' })
  .inputValidator((input: { adminPin: string }) => z.object({
    adminPin: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    // Verify admin PIN
    const expectedPin = process.env.VITE_ADMIN_PIN || 'quest2026'
    if (data.adminPin !== expectedPin) {
      throw new Error('Invalid admin PIN')
    }

    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to create test accounts. Add it to your .env file.')
    }

    // Use admin client for all operations to bypass RLS
    const adminClient = createServerAdminClient()
    const results: { email: string; status: string; memberId?: string }[] = []

    // Get a satellite for members (using admin client to bypass RLS)
    const { data: satellites } = await adminClient
      .from('satellites')
      .select('id')
      .limit(1)

    const satelliteId = satellites?.[0]?.id

    for (const account of testAccounts) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await adminClient.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(u => u.email === account.email)

        let userId: string

        if (existingUser) {
          // User exists - update their member/profile records
          userId = existingUser.id

          // Check if member record exists
          const { data: existingMember } = await adminClient
            .from('members')
            .select('id')
            .eq('email', account.email)
            .single()

          let memberId: string

          if (existingMember) {
            memberId = existingMember.id
          } else {
            // Create member record
            const { data: memberData, error: memberError } = await adminClient
              .from('members')
              .insert({
                name: account.name,
                email: account.email,
                satellite_id: satelliteId,
                membership_status: 'active',
                discipleship_stage: account.role === 'super_admin' ? 'Leader' : 'Growing',
                city: 'Santa Rosa',
              })
              .select()
              .single()

            if (memberError) {
              results.push({ email: account.email, status: `member error: ${memberError.message}` })
              continue
            }
            memberId = memberData.id
          }

          // Update user_profile with role and member_id
          const { error: profileError } = await adminClient
            .from('user_profiles')
            .update({
              role: account.role,
              member_id: memberId,
              satellite_id: satelliteId,
            })
            .eq('id', userId)

          if (profileError) {
            results.push({ email: account.email, status: `profile error: ${profileError.message}` })
            continue
          }

          results.push({ email: account.email, status: 'updated', memberId })
          continue
        }

        // Create new user in Supabase Auth
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true, // Auto-confirm email for test accounts
        })

        if (authError) {
          results.push({ email: account.email, status: `auth error: ${authError.message}` })
          continue
        }

        if (!authData.user) {
          results.push({ email: account.email, status: 'no user returned' })
          continue
        }

        userId = authData.user.id

        // Create member record (using admin client to bypass RLS)
        const { data: memberData, error: memberError } = await adminClient
          .from('members')
          .insert({
            name: account.name,
            email: account.email,
            satellite_id: satelliteId,
            membership_status: 'active',
            discipleship_stage: account.role === 'super_admin' ? 'Leader' : 'Growing',
            city: 'Santa Rosa', // Required field
          })
          .select()
          .single()

        if (memberError) {
          results.push({ email: account.email, status: `member error: ${memberError.message}` })
          continue
        }

        // Update user_profile with role and member_id
        // Note: user_profile is auto-created by trigger on auth.users insert
        // Using admin client to bypass RLS infinite recursion
        const { error: profileError } = await adminClient
          .from('user_profiles')
          .update({
            role: account.role,
            member_id: memberData.id,
            satellite_id: satelliteId,
          })
          .eq('id', userId)

        if (profileError) {
          results.push({ email: account.email, status: `profile error: ${profileError.message}`, memberId: memberData.id })
          continue
        }

        results.push({ email: account.email, status: 'created', memberId: memberData.id })
      } catch (error) {
        results.push({ email: account.email, status: `error: ${error instanceof Error ? error.message : 'unknown'}` })
      }
    }

    return { success: true, accounts: results }
  })

// Purge all data (except satellites)
export const purgeAllData = createServerFn({ method: 'POST' })
  .inputValidator((input: { adminPin: string; confirmText: string }) => z.object({
    adminPin: z.string(),
    confirmText: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    // Verify admin PIN
    const expectedPin = process.env.VITE_ADMIN_PIN || 'quest2026'
    if (data.adminPin !== expectedPin) {
      throw new Error('Invalid admin PIN')
    }

    // Require confirmation text
    if (data.confirmText !== 'DELETE ALL DATA') {
      throw new Error('Invalid confirmation text')
    }

    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to purge data. Add it to your .env file.')
    }

    // Use admin client to bypass RLS
    const supabase = createServerAdminClient()
    const results = {
      member_ministries: 0,
      member_cell_groups: 0,
      ministries: 0,
      cell_groups: 0,
      members: 0,
    }

    try {
      // Delete in order due to foreign key constraints
      // 1. Delete ministry memberships
      const { data: minMem } = await supabase
        .from('member_ministries')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
      results.member_ministries = minMem?.length || 0

      // 2. Delete cell group memberships
      const { data: cgMem } = await supabase
        .from('member_cell_groups')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
      results.member_cell_groups = cgMem?.length || 0

      // 3. Delete ministries
      const { data: mins } = await supabase
        .from('ministries')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
      results.ministries = mins?.length || 0

      // 4. Delete cell groups
      const { data: cgs } = await supabase
        .from('cell_groups')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
      results.cell_groups = cgs?.length || 0

      // 5. Delete members
      const { data: mems } = await supabase
        .from('members')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')
        .select()
      results.members = mems?.length || 0

      return { success: true, results }
    } catch (error) {
      console.error('Purge error:', error)
      throw error
    }
  })
