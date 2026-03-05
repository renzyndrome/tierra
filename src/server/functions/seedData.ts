// Quest Laguna Directory - Seed Data Server Functions
// Provides test data for development and demonstration

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
// Note: All seed functions use adminClient to bypass RLS policies

// Admin account - credentials from env vars, never hardcoded
function getAdminAccount() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env')
  }
  return { email, password, role: 'super_admin' as const, name: 'Quest Admin' }
}

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

// Setup admin account
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
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Add it to your .env file.')
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

    for (const account of [getAdminAccount()]) {
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

// ============================================
// SEED FINANCIAL TEST DATA
// ============================================

export const seedFinancialData = createServerFn({ method: 'POST' })
  .inputValidator((input: { adminPin: string }) => z.object({
    adminPin: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    const expectedPin = process.env.VITE_ADMIN_PIN || 'quest2026'
    if (data.adminPin !== expectedPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = createServerAdminClient()

    // Get satellites
    const { data: satellites } = await supabase
      .from('satellites')
      .select('id, name')
      .eq('is_active', true)

    if (!satellites?.length) {
      throw new Error('No satellites found. Seed satellites first.')
    }

    // Get some members to link to income
    const { data: members } = await supabase
      .from('members')
      .select('id, name')
      .eq('is_archived', false)
      .limit(10)

    const mainSat = satellites.find(s => s.name === 'Quest Laguna Main') || satellites[0]
    const binanSat = satellites.find(s => s.name === 'Quest Biñan')
    const staRosaSat = satellites.find(s => s.name === 'Quest Sta. Rosa')

    const satIds = [mainSat, binanSat, staRosaSat].filter(Boolean).map(s => s!.id)
    const satNames: Record<string, string> = {}
    for (const s of [mainSat, binanSat, staRosaSat].filter(Boolean)) {
      satNames[s!.id] = s!.name
    }

    const memberIds = members?.map(m => m.id) || []

    // Generate 6 months of realistic financial data
    const transactions: {
      transaction_date: string
      transaction_type: 'income' | 'expense'
      category: string
      amount: number
      description: string | null
      reference_number: string | null
      satellite_id: string
      member_id: string | null
      notes: string | null
    }[] = []

    const incomeCategories = ['Tithe', 'Offering', 'Missions']
    const expenseCategories = ['Utilities', 'Supplies', 'Equipment', 'Events', 'Programs']

    // Generate data for 6 months back
    for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() - monthsAgo

      const targetDate = new Date(year, month, 1)
      const targetYear = targetDate.getFullYear()
      const targetMonth = targetDate.getMonth()

      // 4 Sundays of tithes per month across satellites
      for (let week = 1; week <= 4; week++) {
        const sunday = new Date(targetYear, targetMonth, week * 7)
        if (sunday.getMonth() !== targetMonth) continue
        const dateStr = sunday.toISOString().split('T')[0]

        for (const satId of satIds) {
          const isMain = satId === mainSat.id

          // Tithes (main satellite gets more)
          const titheAmount = isMain
            ? 8000 + Math.round(Math.random() * 7000)
            : 2000 + Math.round(Math.random() * 4000)

          transactions.push({
            transaction_date: dateStr,
            transaction_type: 'income',
            category: 'Tithe',
            amount: titheAmount,
            description: `Sunday tithe - Week ${week}`,
            reference_number: `TH-${targetYear}${String(targetMonth + 1).padStart(2, '0')}-W${week}`,
            satellite_id: satId,
            member_id: memberIds.length > 0 ? memberIds[Math.floor(Math.random() * memberIds.length)] : null,
            notes: null,
          })

          // Offerings (most Sundays)
          if (Math.random() > 0.2) {
            const offeringAmount = isMain
              ? 3000 + Math.round(Math.random() * 5000)
              : 1000 + Math.round(Math.random() * 2500)

            transactions.push({
              transaction_date: dateStr,
              transaction_type: 'income',
              category: 'Offering',
              amount: offeringAmount,
              description: `Sunday offering - Week ${week}`,
              reference_number: `OF-${targetYear}${String(targetMonth + 1).padStart(2, '0')}-W${week}`,
              satellite_id: satId,
              member_id: memberIds.length > 0 ? memberIds[Math.floor(Math.random() * memberIds.length)] : null,
              notes: null,
            })
          }
        }
      }

      // Missions giving (once per month, main satellite only)
      const midMonth = new Date(targetYear, targetMonth, 15)
      if (midMonth.getMonth() === targetMonth) {
        transactions.push({
          transaction_date: midMonth.toISOString().split('T')[0],
          transaction_type: 'income',
          category: 'Missions',
          amount: 5000 + Math.round(Math.random() * 10000),
          description: 'Monthly missions offering',
          reference_number: `MS-${targetYear}${String(targetMonth + 1).padStart(2, '0')}`,
          satellite_id: mainSat.id,
          member_id: null,
          notes: 'Collected during missions Sunday',
        })
      }

      // Expenses throughout the month
      // Utilities (monthly, per satellite)
      for (const satId of satIds) {
        const isMain = satId === mainSat.id
        const utilDate = new Date(targetYear, targetMonth, 5 + Math.floor(Math.random() * 5))
        if (utilDate.getMonth() === targetMonth) {
          transactions.push({
            transaction_date: utilDate.toISOString().split('T')[0],
            transaction_type: 'expense',
            category: 'Utilities',
            amount: isMain ? 4500 + Math.round(Math.random() * 2000) : 1500 + Math.round(Math.random() * 1000),
            description: `Electricity & water - ${new Date(targetYear, targetMonth).toLocaleDateString('en', { month: 'long' })}`,
            reference_number: `UTIL-${targetYear}${String(targetMonth + 1).padStart(2, '0')}`,
            satellite_id: satId,
            member_id: null,
            notes: null,
          })
        }
      }

      // Supplies (1-2 times per month, random satellite)
      const supplyCount = 1 + Math.floor(Math.random() * 2)
      for (let i = 0; i < supplyCount; i++) {
        const supplyDate = new Date(targetYear, targetMonth, 10 + Math.floor(Math.random() * 15))
        if (supplyDate.getMonth() === targetMonth) {
          const descriptions = ['Communion supplies', 'Printing materials', 'Office supplies', 'Cleaning supplies', 'Paper and ink']
          transactions.push({
            transaction_date: supplyDate.toISOString().split('T')[0],
            transaction_type: 'expense',
            category: 'Supplies',
            amount: 500 + Math.round(Math.random() * 2500),
            description: descriptions[Math.floor(Math.random() * descriptions.length)],
            reference_number: null,
            satellite_id: satIds[Math.floor(Math.random() * satIds.length)],
            member_id: null,
            notes: null,
          })
        }
      }

      // Equipment (every other month, main satellite)
      if (monthsAgo % 2 === 0) {
        const equipDate = new Date(targetYear, targetMonth, 20 + Math.floor(Math.random() * 5))
        if (equipDate.getMonth() === targetMonth) {
          const equipItems = ['Mic cable replacement', 'Speaker stand', 'Projector bulb', 'Guitar strings', 'Keyboard stand']
          transactions.push({
            transaction_date: equipDate.toISOString().split('T')[0],
            transaction_type: 'expense',
            category: 'Equipment',
            amount: 2000 + Math.round(Math.random() * 8000),
            description: equipItems[Math.floor(Math.random() * equipItems.length)],
            reference_number: `EQ-${targetYear}${String(targetMonth + 1).padStart(2, '0')}`,
            satellite_id: mainSat.id,
            member_id: null,
            notes: 'Sound ministry request',
          })
        }
      }

      // Events expense (some months)
      if (Math.random() > 0.4) {
        const eventDate = new Date(targetYear, targetMonth, 22 + Math.floor(Math.random() * 5))
        if (eventDate.getMonth() === targetMonth) {
          const eventItems = ['Youth night food & drinks', 'Worship night setup', 'Guest speaker honorarium', 'Outreach materials', 'Cell group leaders fellowship']
          transactions.push({
            transaction_date: eventDate.toISOString().split('T')[0],
            transaction_type: 'expense',
            category: 'Events',
            amount: 3000 + Math.round(Math.random() * 7000),
            description: eventItems[Math.floor(Math.random() * eventItems.length)],
            reference_number: null,
            satellite_id: satIds[Math.floor(Math.random() * satIds.length)],
            member_id: null,
            notes: null,
          })
        }
      }

      // Programs expense (some months)
      if (Math.random() > 0.5) {
        const progDate = new Date(targetYear, targetMonth, 12 + Math.floor(Math.random() * 10))
        if (progDate.getMonth() === targetMonth) {
          const progItems = ['SOD materials printing', 'Encounter weekend food', 'Discipleship booklets', 'QBS module printing']
          transactions.push({
            transaction_date: progDate.toISOString().split('T')[0],
            transaction_type: 'expense',
            category: 'Programs',
            amount: 2000 + Math.round(Math.random() * 5000),
            description: progItems[Math.floor(Math.random() * progItems.length)],
            reference_number: null,
            satellite_id: mainSat.id,
            member_id: null,
            notes: 'Discipleship program',
          })
        }
      }
    }

    // Insert all transactions
    const { data: inserted, error } = await supabase
      .from('financial_transactions')
      .insert(transactions)
      .select('id')

    if (error) {
      console.error('Seed financial data error:', error)
      throw new Error(`Failed to seed financial data: ${error.message}`)
    }

    return {
      success: true,
      count: inserted?.length || 0,
      summary: {
        income: transactions.filter(t => t.transaction_type === 'income').length,
        expenses: transactions.filter(t => t.transaction_type === 'expense').length,
      },
    }
  })

// ============================================
// PURGE FINANCIAL DATA
// ============================================

export const purgeFinancialData = createServerFn({ method: 'POST' })
  .inputValidator((input: { adminPin: string }) => z.object({
    adminPin: z.string(),
  }).parse(input))
  .handler(async ({ data }) => {
    const expectedPin = process.env.VITE_ADMIN_PIN || 'quest2026'
    if (data.adminPin !== expectedPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = createServerAdminClient()

    const { data: deleted, error } = await supabase
      .from('financial_transactions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id')

    if (error) {
      console.error('Purge financial data error:', error)
      throw new Error(`Failed to purge financial data: ${error.message}`)
    }

    return { success: true, deleted: deleted?.length || 0 }
  })
