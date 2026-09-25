// Quest Laguna Directory - Spreadsheet Data Import
// Transforms and imports member data from the church spreadsheet

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requireAdmin } from './_authGuard'
import { getSimpleStageFromJourney } from '../../lib/constants'
import type { DiscipleshipJourney, FollowThrough, LeadershipLevel, CivilStatus, MemberCategory } from '../../lib/types'

// Raw member data from spreadsheet
interface RawMember {
  name: string
  discipler?: string
  new_name?: string
  birthdate?: string
  gender?: string
  civil_status?: string
  spouse?: string
  wedding_anniversary?: string
  num_children?: string
  contact?: string
  address?: string
  email?: string
  monitoring?: string
  category?: string
  membership?: string
  follow_through?: string
  discipleship_journey?: string
  satellite?: string
  community?: string
  ministry?: string
  status_journey?: string
  vision_keeper?: string
  full_timers?: string
  ministries_active?: string[]
}

// ============================================
// DATA TRANSFORMATION HELPERS
// ============================================

/**
 * Parse name from "SURNAME, Given, Middle." → "Given Middle Surname"
 */
function parseName(rawName: string): string {
  if (!rawName) return 'Unknown'
  const trimmed = rawName.trim()

  // If no comma, it's a single name or already "First Last"
  if (!trimmed.includes(',')) {
    return titleCase(trimmed)
  }

  const parts = trimmed.split(',').map(p => p.trim())
  const surname = parts[0]
  const given = parts[1] || ''
  const middle = parts[2]?.replace(/\.+$/, '') || '' // Strip trailing periods

  const fullName = [given, middle, surname].filter(Boolean).join(' ')
  return titleCase(fullName)
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Convert birthdate from "18-May-2007" or "D-MMM-YYYY" → "2007-05-18"
 */
function parseBirthdate(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null

  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  }

  const parts = raw.trim().split('-')
  if (parts.length !== 3) return null

  const day = parts[0].padStart(2, '0')
  const monthStr = parts[1].toLowerCase().slice(0, 3)
  const month = months[monthStr]
  const year = parts[2]

  if (!month || !year) return null

  return `${year}-${month}-${day}`
}

/**
 * Convert Excel serial date number to YYYY-MM-DD
 * Excel dates are days since 1900-01-01 (with the Lotus 1-2-3 leap year bug)
 */
function excelSerialToDate(serial: number): string | null {
  if (serial < 1 || serial > 100000) return null
  // Excel epoch: Jan 1, 1900 = serial 1, but has a bug treating 1900 as leap year
  const utcDays = serial - 1 // serial 1 = Jan 1, 1900
  const ms = Date.UTC(1900, 0, 1) + (utcDays - 1) * 86400000
  const date = new Date(ms)
  if (isNaN(date.getTime())) return null
  return date.toISOString().split('T')[0]
}

/**
 * Parse wedding anniversary — handles Excel serial dates, D-MMM-YYYY, and partial dates
 */
function parseWeddingAnniversary(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  const trimmed = raw.trim()

  // Check if it's a pure number (Excel serial date)
  if (/^\d+$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10)
    return excelSerialToDate(serial)
  }

  // Try D-MMM-YYYY format (same as birthdate)
  const parsed = parseBirthdate(trimmed)
  if (parsed) return parsed

  // Partial dates like "12/4" (month/day without year) - not a valid DATE, skip
  return null
}

/**
 * Compute age from birthday
 */
function computeAge(birthday: string | null): number | null {
  if (!birthday) return null
  const birth = new Date(birthday)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age > 0 && age < 120 ? age : null
}

/**
 * Normalize gender
 */
function normalizeGender(raw: string | undefined): 'male' | 'female' | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()
  if (lower === 'male') return 'male'
  if (lower === 'female') return 'female'
  return null
}

/**
 * Normalize civil status
 */
function normalizeCivilStatus(raw: string | undefined): CivilStatus | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()
  if (lower === 'single') return 'single'
  if (lower === 'married') return 'married'
  if (lower === 'widowed') return 'widowed'
  return null
}

/**
 * Format phone number with +63 prefix
 */
function formatPhone(raw: string | undefined): string | null {
  if (!raw || raw.trim() === '') return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.startsWith('63')) return `+${digits}`
  if (digits.startsWith('0')) return `+63${digits.slice(1)}`
  if (digits.length === 10) return `+63${digits}`
  return raw.trim() // Return as-is if format is unclear
}

/**
 * Normalize monitoring status → membership_status
 */
function normalizeMonitoring(raw: string | undefined): 'active' | 'inactive' {
  if (!raw) return 'active'
  const lower = raw.toLowerCase().trim()
  return lower === 'inactive' ? 'inactive' : 'active'
}

/**
 * Normalize follow-through stage
 */
function normalizeFollowThrough(raw: string | undefined): FollowThrough | null {
  if (!raw || raw.trim() === '') return null
  const lower = raw.toLowerCase().trim()

  if (lower === 'salvation') return 'Salvation'
  if (lower === 'prayer') return 'Prayer'
  if (lower.includes('bible') || lower.includes('devotion')) return 'Bible and Devotion'
  if (lower === 'transformation') return 'Transformation'
  if (lower.includes('cell') || lower.includes('church')) return 'Cell and Church'

  return null
}

/**
 * Normalize discipleship journey
 */
function normalizeDiscipleshipJourney(raw: string | undefined): DiscipleshipJourney | null {
  if (!raw || raw.trim() === '') return null
  const lower = raw.toLowerCase().trim()

  if (lower === 'consolidations') return 'Consolidations'
  if (lower === 'pre encounter') return 'Pre Encounter'
  if (lower === 'encounter') return 'Encounter'
  if (lower === 'post-encounter' || lower === 'post encounter') return 'Post-Encounter'
  if (lower === 'sod1') return 'SOD1'
  if (lower === 'sod2') return 'SOD2'
  if (lower === 'sod3') return 'SOD3'
  if (lower === 'bible school') return 'Bible School'
  if (lower.includes('theology')) return 'QBS Theology 101'
  if (lower.includes('preaching')) return 'QBS Preaching 101'

  return null
}

/**
 * Normalize leadership level from status_journey
 */
function normalizeLeadershipLevel(raw: string | undefined): LeadershipLevel {
  if (!raw || raw.trim() === '') return 'Member'
  const lower = raw.toLowerCase().trim()

  if (lower === 'head pastor') return 'Head Pastor'
  if (lower === 'pastor') return 'Pastor'
  if (lower === 'eagle') return 'Eagle'
  if (lower === 'disciple maker') return 'Disciple Maker'
  return 'Member'
}

/**
 * Normalize member category
 */
function normalizeMemberCategory(raw: string | undefined): MemberCategory | null {
  if (!raw || raw.trim() === '') return null
  const lower = raw.toLowerCase().trim()

  if (lower === 'kid') return 'Kid'
  if (lower === 'student') return 'Student'
  if (lower === 'young pro') return 'Young Pro'
  if (lower === 'mother') return 'Mother'
  if (lower === 'father') return 'Father'

  return null
}

/**
 * Extract city from address or satellite
 */
function extractCity(address: string | undefined, satelliteName: string | undefined): string {
  // Try to extract from address
  if (address) {
    const lower = address.toLowerCase()
    if (lower.includes('santa rosa') || lower.includes('sta. rosa') || lower.includes('sta rosa')) return 'Santa Rosa'
    if (lower.includes('biñan') || lower.includes('binan')) return 'Biñan'
    if (lower.includes('san pedro')) return 'San Pedro'
    if (lower.includes('las piñas') || lower.includes('las pinas')) return 'Las Piñas'
    if (lower.includes('cavinti')) return 'Cavinti'
    if (lower.includes('los baños') || lower.includes('los banos')) return 'Los Baños'
    if (lower.includes('calamba')) return 'Calamba'
  }

  // Fallback to satellite name
  if (satelliteName) {
    const satLower = satelliteName.toLowerCase()
    if (satLower.includes('losbanos') || satLower.includes('los baños')) return 'Los Baños'
    if (satLower.includes('southville') || satLower.includes('san pedro')) return 'San Pedro'
    if (satLower.includes('ondoy')) return 'Ondoy'
    if (satLower.includes('santa rosa') || satLower.includes('sta. rosa')) return 'Santa Rosa'
    if (satLower.includes('cavinti')) return 'Cavinti'
    if (satLower.includes('las pinas') || satLower.includes('las piñas')) return 'Las Piñas'
    if (satLower.includes('biñan') || satLower.includes('binan')) return 'Biñan'
    if (satLower.includes('laguna')) return 'San Pedro'
  }

  return 'Laguna'
}

// Satellite name mapping: spreadsheet value → DB name
const SATELLITE_NAME_MAP: Record<string, string> = {
  'quest losbanos': 'Quest Los Baños',
  'quest southville': 'Quest Southville',
  'quest santa rosa': 'Quest Sta. Rosa',
  'quest las pinas': 'Quest Las Piñas',
  'quest cavinti': 'Quest Cavinti',
  'quest ondoy': 'Quest Ondoy',
  'quest laguna main': 'Quest Laguna Main',
  'quest laguna': 'Quest Laguna Main',
  'quest biñan': 'Quest Biñan',
  'quest binan': 'Quest Biñan',
  'quest san pedro': 'Quest San Pedro',
}

// Ministry name mapping: spreadsheet value → DB name
// Includes: uppercase (COMMUNITY/SATELIGHTS), snake_case (QUEST_LAGUNA), and misc variants
const MINISTRY_NAME_MAP: Record<string, string> = {
  // Praise and Worship
  'praise and worship': 'Praise and Worship',
  'praise_worship': 'Praise and Worship',
  'p&w': 'Praise and Worship',
  // Dance Ministry
  'dance ministry': 'Dance Ministry',
  'dance_ministry': 'Dance Ministry',
  // Preaching
  'preaching': 'Preaching',
  'preaching_ministry': 'Preaching',
  // Teaching (SOD)
  'teaching (sod)': 'Teaching (SOD)',
  'teaching_sod': 'Teaching (SOD)',
  // Pastoral
  'pastoral': 'Pastoral',
  'pastoral_ministry': 'Pastoral',
  // Church Planting
  'church planting': 'Church Planting',
  'church_planting': 'Church Planting',
  // Campus Harvest
  'campus harvest': 'Campus Harvest',
  'campus_harvest': 'Campus Harvest',
  // Ushering Team
  'ushering team': 'Ushering Team',
  'ushering_team': 'Ushering Team',
  // Kitchen Ministry
  'kitchen ministry': 'Kitchen Ministry',
  'kitchen_ministry': 'Kitchen Ministry',
  // Church Admin and Finance
  'church admin and finance': 'Church Admin and Finance',
  'church_admin_finance': 'Church Admin and Finance',
  'admin and finance': 'Church Admin and Finance',
  // Events
  'events': 'Events',
  'events_ministry': 'Events',
  // Counters
  'counters': 'Counters',
  'counters_ministry': 'Counters',
  // BTS/Tech
  'bts/tech': 'BTS/Tech',
  'bts_tech': 'BTS/Tech',
  'bts': 'BTS/Tech',
  // AHALTA (Men)
  'ahalta (men)': 'AHALTA (Men)',
  'ahalta_men': 'AHALTA (Men)',
  'ahalta': 'AHALTA (Men)',
  // EBA (Women)
  'eba (women)': 'EBA (Women)',
  'eba_women': 'EBA (Women)',
  'eba': 'EBA (Women)',
  // Prayer Warrior Ministry
  'prayer warrior ministry': 'Prayer Warrior Ministry',
  'prayer_warrior': 'Prayer Warrior Ministry',
  'prayer warrior': 'Prayer Warrior Ministry',
  'prayer_warrior_ministry': 'Prayer Warrior Ministry',
  // Kids Ministry
  'kids ministry': 'Kids Ministry',
  'kids_ministry': 'Kids Ministry',
}

function mapSatelliteName(raw: string | undefined): string {
  if (!raw) return 'Quest Laguna Main'
  return SATELLITE_NAME_MAP[raw.toLowerCase().trim()] || raw.trim()
}

function mapMinistryName(raw: string): string | null {
  const mapped = MINISTRY_NAME_MAP[raw.toLowerCase().trim()]
  return mapped || null
}

// ============================================
// IMPORT SERVER FUNCTION
// ============================================

export const importSpreadsheetData = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; data: { COMMUNITY?: { members?: RawMember[] }; SATELIGHTS?: { members?: RawMember[] }; QUEST_LAGUNA?: { members?: RawMember[] } } }) =>
    z.object({
      accessToken: z.string(),
      data: z.object({
        COMMUNITY: z.object({ members: z.array(z.any()).optional() }).optional(),
        SATELIGHTS: z.object({ members: z.array(z.any()).optional() }).optional(),
        QUEST_LAGUNA: z.object({ members: z.array(z.any()).optional() }).optional(),
      }),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    // Bulk import rewrites the directory: admins only.
    await requireAdmin(data.accessToken)

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for import')
    }

    const supabase = createServerAdminClient()

    // Step 1: Get satellite mapping
    const { data: satellites } = await supabase.from('satellites').select('id, name')
    const satelliteMap = new Map(satellites?.map(s => [s.name, s.id]) || [])

    // Step 2: Get ministry mapping — auto-create any missing ministries
    const knownMinistryNames = [...new Set(Object.values(MINISTRY_NAME_MAP))]
    const { data: existingMinistries } = await supabase.from('ministries').select('id, name')
    const existingNames = new Set(existingMinistries?.map(m => m.name) || [])

    const missingMinistries = knownMinistryNames
      .filter(name => !existingNames.has(name))
      .map(name => ({ name, is_active: true }))

    if (missingMinistries.length > 0) {
      await supabase.from('ministries').insert(missingMinistries)
      console.log('[Import] Auto-created', missingMinistries.length, 'ministries:', missingMinistries.map(m => m.name).join(', '))
    }

    const { data: ministries } = await supabase.from('ministries').select('id, name')
    const ministryMap = new Map(ministries?.map(m => [m.name, m.id]) || [])

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
      disciplerLinks: 0,
      ministryLinks: 0,
    }

    // Collect all raw members with their source tab
    const allRawMembers: { raw: RawMember; source: string; defaultSatellite?: string }[] = []

    if (data.data.COMMUNITY?.members) {
      for (const m of data.data.COMMUNITY.members) {
        allRawMembers.push({
          raw: m,
          source: 'COMMUNITY',
          defaultSatellite: 'Quest Biñan',
        })
      }
    }

    if (data.data.SATELIGHTS?.members) {
      for (const m of data.data.SATELIGHTS.members) {
        allRawMembers.push({ raw: m, source: 'SATELIGHTS' })
      }
    }

    if (data.data.QUEST_LAGUNA?.members) {
      for (const m of data.data.QUEST_LAGUNA.members) {
        allRawMembers.push({
          raw: m,
          source: 'QUEST_LAGUNA',
          defaultSatellite: 'Quest Laguna Main',
        })
      }
    }

    // Step 3: Transform all members
    const transformedMembers = allRawMembers.map(({ raw, defaultSatellite }) => {
      const name = parseName(raw.name)
      const birthday = parseBirthdate(raw.birthdate)
      const age = computeAge(birthday)
      const gender = normalizeGender(raw.gender)
      const civilStatus = normalizeCivilStatus(raw.civil_status)
      const phone = formatPhone(raw.contact)
      const membershipStatus = normalizeMonitoring(raw.monitoring)
      const followThrough = normalizeFollowThrough(raw.follow_through)
      const discipleshipJourney = normalizeDiscipleshipJourney(raw.discipleship_journey)
      const discipleshipStage = getSimpleStageFromJourney(discipleshipJourney)
      const leadershipLevel = normalizeLeadershipLevel(raw.status_journey)
      const memberCategory = normalizeMemberCategory(raw.category)

      // Satellite resolution
      const satelliteName = raw.satellite
        ? mapSatelliteName(raw.satellite)
        : (defaultSatellite || 'Quest Laguna Main')
      const satelliteId = satelliteMap.get(satelliteName) || null

      // Community (for Biñan sub-areas)
      const community = raw.community || null

      // City from address or satellite
      const city = extractCity(raw.address, satelliteName)

      // Email cleanup
      let email = raw.email?.trim() || null
      if (email && !email.includes('@')) email = null
      // Fix common typos
      if (email) email = email.replace('@gmai.com', '@gmail.com').replace(' ', '')

      // Num children
      const numChildren = raw.num_children ? parseInt(raw.num_children, 10) || null : null

      // Spouse
      const spouseName = raw.spouse?.trim() || null

      // Wedding anniversary — may be Excel serial date, D-MMM-YYYY, or partial
      const weddingAnniversary = parseWeddingAnniversary(raw.wedding_anniversary)

      // Spiritual name
      const spiritualName = raw.new_name?.trim() || null

      // Vision keeper / full timer
      const isVisionKeeper = raw.vision_keeper?.trim()?.toLowerCase() === 'yes' || raw.vision_keeper === '1' || false
      const isFullTime = raw.full_timers?.trim()?.toLowerCase() === 'yes' || raw.full_timers === '1' || false

      // Collect ministry names for this member
      const memberMinistries: string[] = []
      if (raw.ministries_active) {
        for (const m of raw.ministries_active) {
          const mapped = mapMinistryName(m)
          if (mapped) memberMinistries.push(mapped)
        }
      }
      if (raw.ministry) {
        const mapped = mapMinistryName(raw.ministry)
        if (mapped && !memberMinistries.includes(mapped)) {
          memberMinistries.push(mapped)
        }
      }

      return {
        memberData: {
          name,
          email,
          phone,
          age,
          birthday,
          gender,
          city,
          address: raw.address?.trim() || null,
          satellite_id: satelliteId,
          discipleship_stage: discipleshipStage,
          membership_status: membershipStatus,
          civil_status: civilStatus,
          spouse_name: spouseName,
          wedding_anniversary: weddingAnniversary,
          num_children: numChildren,
          member_category: memberCategory,
          follow_through: followThrough,
          discipleship_journey: discipleshipJourney,
          leadership_level: leadershipLevel,
          spiritual_name: spiritualName,
          is_vision_keeper: isVisionKeeper,
          is_full_time: isFullTime,
          community,
        },
        rawName: raw.name,
        disciplerName: raw.discipler || null,
        ministryNames: memberMinistries,
      }
    })

    // Step 4: Insert members individually to handle duplicate emails gracefully
    const insertedMembers: { id: string; name: string; rawName: string }[] = []

    for (let i = 0; i < transformedMembers.length; i++) {
      const tm = transformedMembers[i]

      const { data: inserted, error } = await supabase
        .from('members')
        .insert(tm.memberData)
        .select('id, name')
        .single()

      if (error) {
        // Only log non-duplicate errors to keep error list manageable
        if (error.code === '23505') {
          // Duplicate email — retry with email set to null
          const retryData = { ...tm.memberData, email: null }
          const { data: retryInserted, error: retryError } = await supabase
            .from('members')
            .insert(retryData)
            .select('id, name')
            .single()

          if (retryError) {
            results.errors.push(`${tm.memberData.name}: ${retryError.message}`)
            results.skipped++
          } else if (retryInserted) {
            insertedMembers.push({
              id: retryInserted.id,
              name: retryInserted.name,
              rawName: tm.rawName,
            })
            results.imported++
          }
        } else {
          results.errors.push(`${tm.memberData.name}: ${error.message}`)
          results.skipped++
        }
        continue
      }

      if (inserted) {
        insertedMembers.push({
          id: inserted.id,
          name: inserted.name,
          rawName: tm.rawName,
        })
        results.imported++
      }
    }

    // Step 5: Set up discipler relationships (second pass)
    // Build a lookup map of names → member IDs with multiple key variants
    const nameToId = new Map<string, string>()

    function addNameVariants(name: string, id: string) {
      const lower = name.toLowerCase().trim()
      nameToId.set(lower, id)
      // Also store without extra spaces
      const collapsed = lower.replace(/\s+/g, ' ')
      if (collapsed !== lower) nameToId.set(collapsed, id)
      // Store sorted words for order-independent matching
      const sorted = collapsed.split(' ').sort().join(' ')
      nameToId.set('sorted:' + sorted, id)
    }

    for (const m of insertedMembers) {
      addNameVariants(m.name, m.id)
      addNameVariants(m.rawName, m.id)
    }

    // Also fetch all existing members
    const { data: existingMembers } = await supabase
      .from('members')
      .select('id, name')
    if (existingMembers) {
      for (const m of existingMembers) {
        addNameVariants(m.name, m.id)
      }
    }

    /**
     * Try to find a member ID by name with multiple matching strategies:
     * 1. Exact match on raw name
     * 2. Parsed name ("SURNAME, Given" → "Given Surname")
     * 3. Clean up periods/commas as separators
     * 4. Prefix title removal ("Pastor", "Pastora", "Pas.")
     * 5. Word-order-independent matching
     */
    function findMemberId(rawName: string): string | null {
      const lower = rawName.toLowerCase().trim().replace(/\s+/g, ' ')
      if (!lower || lower === 'no discipler') return null

      // 1. Direct match
      if (nameToId.has(lower)) return nameToId.get(lower)!

      // 2. Parsed name
      const parsed = parseName(rawName).toLowerCase()
      if (nameToId.has(parsed)) return nameToId.get(parsed)!

      // 3. Handle period as comma (e.g., "MANAPAT. Erick" → "MANAPAT, Erick")
      const fixedPeriod = rawName.replace(/\.(\s)/, ',$1')
      if (fixedPeriod !== rawName) {
        const parsedFixed = parseName(fixedPeriod).toLowerCase()
        if (nameToId.has(parsedFixed)) return nameToId.get(parsedFixed)!
      }

      // 4. Strip titles like "Pastor", "Pastora", "Pas.", "Ptr."
      const noTitle = lower
        .replace(/^(pastor|pastora|pas\.|ptr\.)\s+/i, '')
        .trim()
      if (noTitle !== lower && nameToId.has(noTitle)) return nameToId.get(noTitle)!
      // Also try parsed version of title-stripped name
      const noTitleRaw = rawName.replace(/^(Pastor|Pastora|Pas\.|Ptr\.)\s+/i, '').trim()
      const noTitleParsed = parseName(noTitleRaw).toLowerCase()
      if (nameToId.has(noTitleParsed)) return nameToId.get(noTitleParsed)!

      // 5. Handle hyphenated/combined names like "EUGENIO-Apple Matabuena"
      const dehyphenated = lower.replace(/-/g, ', ')
      const dehyphenatedParsed = parseName(dehyphenated).toLowerCase()
      if (nameToId.has(dehyphenatedParsed)) return nameToId.get(dehyphenatedParsed)!

      // 6. Word-order-independent matching (handles "First Last" vs "Last, First")
      const sortedKey = 'sorted:' + parsed.split(' ').sort().join(' ')
      if (nameToId.has(sortedKey)) return nameToId.get(sortedKey)!

      return null
    }

    for (const tm of transformedMembers) {
      if (!tm.disciplerName || tm.disciplerName.toUpperCase() === 'NO DISCIPLER') continue

      const memberId = findMemberId(tm.rawName) || findMemberId(parseName(tm.rawName))
      if (!memberId) continue

      const disciplerId = findMemberId(tm.disciplerName)

      if (disciplerId && disciplerId !== memberId) {
        const { error } = await supabase
          .from('members')
          .update({ discipler_id: disciplerId })
          .eq('id', memberId)

        if (!error) results.disciplerLinks++
      }
    }

    // Step 6: Create member_ministries entries
    for (const tm of transformedMembers) {
      if (tm.ministryNames.length === 0) continue

      const memberId = findMemberId(tm.rawName) || findMemberId(parseName(tm.rawName))
      if (!memberId) continue

      for (const ministryName of tm.ministryNames) {
        const ministryId = ministryMap.get(ministryName)
        if (!ministryId) continue

        const { error } = await supabase
          .from('member_ministries')
          .upsert(
            { member_id: memberId, ministry_id: ministryId, role: 'volunteer', is_active: true },
            { onConflict: 'member_id,ministry_id' }
          )

        if (!error) results.ministryLinks++
      }
    }

    return {
      success: true,
      results,
      summary: `Imported ${results.imported} members, linked ${results.disciplerLinks} discipler relationships, created ${results.ministryLinks} ministry assignments. ${results.skipped} skipped. ${results.errors.length} errors.`,
    }
  })

// ============================================
// RE-LINK RELATIONSHIPS (ministry + discipler)
// Runs on existing members without re-importing
// ============================================

// ============================================
// GENERATE CELL GROUPS FROM DISCIPLER RELATIONSHIPS
// Reads spreadsheet data to find discipler-disciple pairs,
// matches names to DB members, creates cell groups.
// Each discipler becomes a cell group leader,
// their disciples become cell group members.
// ============================================

