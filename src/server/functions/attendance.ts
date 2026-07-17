// Quest Laguna - Service Attendance Server Functions
//
// Weekly service check-in: session lifecycle, public QR check-in with a
// backend name-matching engine, an admin match-review queue, and analytics.
//
// Every function uses the service-role admin client (the new tables are RLS
// service-role-only) and is gated with requirePermission on 'registration.*',
// except the two PUBLIC check-in endpoints which validate the QR token +
// open-session state instead of an access token.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, requirePermission } from './_authGuard'
import { resolveMemberMatch } from '../../lib/nameMatch'
import { MATCH_SIMILARITY_THRESHOLD } from '../../lib/constants'
import type {
  ServiceType,
  ServiceSession,
  ServiceSessionWithRelations,
  AttendanceRecord,
  AttendanceRecordWithMember,
  MatchCandidate,
  PendingMatch,
  CheckinResult,
  AttendanceStats,
  MemberAttendanceSummary,
  MemberAttendanceEntry,
  CheckinMethod,
} from '../../lib/types'

// ============================================
// HELPERS
// ============================================

// Lightweight member shape used by the matching engine.
interface LiteMember {
  id: string
  name: string
  phone: string | null
  satellite_id: string | null
}

// Load the un-archived directory (id, name, phone, satellite) for in-memory
// exact/phone matching. The directory is ~200 rows for this church, so a single
// fetch is cheaper and more predictable than per-check-in queries.
async function loadDirectory(
  admin: ReturnType<typeof createServerAdminClient>,
): Promise<LiteMember[]> {
  const { data, error } = await admin
    .from('members')
    .select('id, name, phone, satellite_id')
    .eq('is_archived', false)
  if (error) {
    console.error('Error loading member directory:', error)
    throw new Error('Failed to load member directory')
  }
  return (data ?? []) as LiteMember[]
}

// Fetch fuzzy candidate members for a typed name via the trigram RPC.
async function fuzzyCandidates(
  admin: ReturnType<typeof createServerAdminClient>,
  rawName: string | null,
): Promise<MatchCandidate[]> {
  if (!rawName || !rawName.trim()) return []
  const { data, error } = await admin.rpc('search_members_similar', {
    q: rawName,
    threshold: MATCH_SIMILARITY_THRESHOLD,
    max_results: 5,
  })
  if (error) {
    console.error('Error fetching fuzzy candidates:', error)
    return []
  }
  return (data ?? []) as MatchCandidate[]
}

// ============================================
// SERVICE TYPES
// ============================================

export const getServiceTypes = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<ServiceType[]> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()
    const { data: types, error } = await admin
      .from('service_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('Error fetching service types:', error)
      throw new Error('Failed to fetch service types')
    }
    return (types ?? []) as ServiceType[]
  })

// ============================================
// SESSIONS
// ============================================

const createSessionSchema = z.object({
  accessToken: z.string(),
  serviceTypeId: z.string().uuid('Select a service'),
  sessionDate: z.string().min(1, 'Date is required'),
  satelliteId: z.string().uuid().optional().nullable(),
  title: z.string().max(120).optional().nullable(),
})

export const createSession = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof createSessionSchema>) => createSessionSchema.parse(data))
  .handler(async ({ data }): Promise<ServiceSession> => {
    const caller = await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()

    const { data: session, error } = await admin
      .from('service_sessions')
      .insert({
        service_type_id: data.serviceTypeId,
        session_date: data.sessionDate,
        satellite_id: data.satelliteId ?? null,
        title: data.title ?? null,
        created_by: caller.userId,
        // qr_token + is_open use DB defaults (random token, open).
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating session:', error)
      throw new Error('Failed to create session')
    }
    return session as ServiceSession
  })

const sessionListSchema = z.object({
  accessToken: z.string(),
  serviceTypeId: z.string().uuid().optional(),
  limit: z.number().min(1).max(200).default(50),
})

export const getSessions = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof sessionListSchema>) => sessionListSchema.parse(data))
  .handler(async ({ data }): Promise<ServiceSessionWithRelations[]> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()

    let query = admin
      .from('service_sessions')
      .select(
        '*, service_type:service_types!service_sessions_service_type_id_fkey(id, name, slug, default_day, default_time, sort_order, is_active, created_at, updated_at), satellite:satellites!service_sessions_satellite_id_fkey(id, name)',
      )
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(data.limit)

    if (data.serviceTypeId) query = query.eq('service_type_id', data.serviceTypeId)

    const { data: sessions, error } = await query
    if (error) {
      console.error('Error fetching sessions:', error)
      throw new Error('Failed to fetch sessions')
    }

    const rows = (sessions ?? []) as ServiceSessionWithRelations[]
    if (rows.length === 0) return rows

    // Attach check-in / pending counts in one aggregate RPC call.
    const ids = rows.map((r) => r.id)
    const { data: counts, error: countErr } = await admin.rpc('attendance_session_counts', {
      p_session_ids: ids,
    })
    if (countErr) {
      console.error('Error fetching session counts:', countErr)
    }
    const countMap = new Map<string, { checkin_count: number; pending_count: number }>()
    for (const c of (counts ?? []) as { session_id: string; checkin_count: number; pending_count: number }[]) {
      countMap.set(c.session_id, {
        checkin_count: Number(c.checkin_count),
        pending_count: Number(c.pending_count),
      })
    }
    return rows.map((r) => ({
      ...r,
      checkin_count: countMap.get(r.id)?.checkin_count ?? 0,
      pending_count: countMap.get(r.id)?.pending_count ?? 0,
    }))
  })

export const getSessionDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string; sessionId: string }) =>
    z.object({ accessToken: z.string(), sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<ServiceSessionWithRelations | null> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()
    const { data: session, error } = await admin
      .from('service_sessions')
      .select(
        '*, service_type:service_types!service_sessions_service_type_id_fkey(id, name, slug, default_day, default_time, sort_order, is_active, created_at, updated_at), satellite:satellites!service_sessions_satellite_id_fkey(id, name)',
      )
      .eq('id', data.sessionId)
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      console.error('Error fetching session detail:', error)
      throw new Error('Failed to fetch session')
    }
    return session as ServiceSessionWithRelations
  })

export const setSessionOpen = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; sessionId: string; isOpen: boolean }) =>
    z
      .object({ accessToken: z.string(), sessionId: z.string().uuid(), isOpen: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data }): Promise<ServiceSession> => {
    await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const { data: session, error } = await admin
      .from('service_sessions')
      .update({
        is_open: data.isOpen,
        closed_at: data.isOpen ? null : new Date().toISOString(),
      })
      .eq('id', data.sessionId)
      .select()
      .single()
    if (error) {
      console.error('Error updating session open state:', error)
      throw new Error('Failed to update session')
    }
    return session as ServiceSession
  })

// ============================================
// PUBLIC CHECK-IN  (no access token required)
// ============================================

// Public: resolve QR token -> minimal session info for the check-in page.
export const getCheckinSession = createServerFn({ method: 'GET' })
  .inputValidator((input: { qrToken: string }) =>
    z.object({ qrToken: z.string().min(1) }).parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      sessionId: string
      serviceName: string
      sessionDate: string
      satelliteName: string | null
      title: string | null
      isOpen: boolean
    } | null> => {
      const admin = createServerAdminClient()
      const { data: session, error } = await admin
        .from('service_sessions')
        .select(
          'id, session_date, title, is_open, service_type:service_types!service_sessions_service_type_id_fkey(name), satellite:satellites!service_sessions_satellite_id_fkey(name)',
        )
        .eq('qr_token', data.qrToken)
        .single()
      if (error || !session) return null

      const svc = session.service_type as { name: string } | null
      const sat = session.satellite as { name: string } | null
      return {
        sessionId: session.id as string,
        serviceName: svc?.name ?? 'Service',
        sessionDate: session.session_date as string,
        satelliteName: sat?.name ?? null,
        title: (session.title as string | null) ?? null,
        isOpen: session.is_open as boolean,
      }
    },
  )

const publicCheckInSchema = z.object({
  qrToken: z.string().min(1),
  name: z.string().max(100).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  accessToken: z.string().optional().nullable(),
})

// Public: record a check-in for an open session, running the matching engine.
export const publicCheckIn = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof publicCheckInSchema>) => publicCheckInSchema.parse(data))
  .handler(async ({ data }): Promise<CheckinResult> => {
    const admin = createServerAdminClient()

    // Validate the session via the token (not RLS) and require it to be open.
    const { data: session, error: sErr } = await admin
      .from('service_sessions')
      .select('id, is_open')
      .eq('qr_token', data.qrToken)
      .single()
    if (sErr || !session) throw new Error('This check-in link is invalid.')
    if (!session.is_open) throw new Error('Check-in for this service is closed.')
    const sessionId = session.id as string

    // Self check-in: a logged-in user with a linked member profile.
    let selfMemberId: string | null = null
    if (data.accessToken) {
      try {
        const caller = await getCaller(data.accessToken)
        const { data: profile } = await admin
          .from('user_profiles')
          .select('member_id')
          .eq('id', caller.userId)
          .single()
        selfMemberId = profile?.member_id ?? null
      } catch {
        // Ignore an invalid/expired token on the public path; fall through to guest.
        selfMemberId = null
      }
    }

    if (selfMemberId) {
      return linkCheckIn(admin, {
        sessionId,
        memberId: selfMemberId,
        method: 'qr_self',
        matchStatus: 'auto_matched',
        rawName: null,
        rawPhone: null,
      })
    }

    // Guest flow requires a typed name.
    const rawName = (data.name ?? '').trim()
    if (rawName.length < 2) throw new Error('Please enter your name.')
    const rawPhone = data.phone?.trim() || null

    const directory = await loadDirectory(admin)
    const matched = resolveMemberMatch(rawName, rawPhone, directory)

    if (matched) {
      return linkCheckIn(admin, {
        sessionId,
        memberId: matched.id,
        method: 'qr_guest',
        matchStatus: 'auto_matched',
        rawName,
        rawPhone,
        displayName: matched.name,
      })
    }

    // No confident match -> pending for the admin queue.
    const { data: record, error } = await admin
      .from('attendance_records')
      .insert({
        session_id: sessionId,
        member_id: null,
        raw_name: rawName,
        raw_phone: rawPhone,
        checkin_method: 'qr_guest',
        match_status: 'pending',
      })
      .select('id')
      .single()
    if (error) {
      console.error('Error recording pending check-in:', error)
      throw new Error('Could not record your check-in. Please try again.')
    }
    return {
      status: 'checked_in',
      matched: false,
      displayName: rawName,
      recordId: record.id as string,
    }
  })

// Insert a member-linked check-in, tolerating the "already checked in" unique
// violation (partial unique index on session_id + member_id).
async function linkCheckIn(
  admin: ReturnType<typeof createServerAdminClient>,
  args: {
    sessionId: string
    memberId: string
    method: CheckinMethod
    matchStatus: 'auto_matched' | 'confirmed' | 'new_member'
    rawName: string | null
    rawPhone: string | null
    matchedBy?: string | null
    displayName?: string | null
  },
): Promise<CheckinResult> {
  const { data: record, error } = await admin
    .from('attendance_records')
    .insert({
      session_id: args.sessionId,
      member_id: args.memberId,
      raw_name: args.rawName,
      raw_phone: args.rawPhone,
      checkin_method: args.method,
      match_status: args.matchStatus,
      matched_by: args.matchedBy ?? null,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation -> this member is already checked in.
    if (error.code === '23505') {
      const { data: name } = await admin
        .from('members')
        .select('name')
        .eq('id', args.memberId)
        .single()
      return {
        status: 'already_checked_in',
        matched: true,
        displayName: args.displayName ?? name?.name ?? null,
        recordId: '',
      }
    }
    console.error('Error linking check-in:', error)
    throw new Error('Could not record your check-in. Please try again.')
  }

  let displayName = args.displayName ?? null
  if (!displayName) {
    const { data: name } = await admin
      .from('members')
      .select('name')
      .eq('id', args.memberId)
      .single()
    displayName = name?.name ?? null
  }
  return {
    status: 'checked_in',
    matched: true,
    displayName,
    recordId: record.id as string,
  }
}

// ============================================
// MANUAL CHECK-IN  (staff)
// ============================================

export const manualCheckIn = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; sessionId: string; memberId: string }) =>
    z
      .object({
        accessToken: z.string(),
        sessionId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<CheckinResult> => {
    const caller = await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()

    const { data: session, error: sErr } = await admin
      .from('service_sessions')
      .select('id, is_open')
      .eq('id', data.sessionId)
      .single()
    if (sErr || !session) throw new Error('Session not found')
    if (!session.is_open) throw new Error('This session is closed.')

    return linkCheckIn(admin, {
      sessionId: data.sessionId,
      memberId: data.memberId,
      method: 'manual',
      matchStatus: 'confirmed',
      rawName: null,
      rawPhone: null,
      matchedBy: caller.userId,
    })
  })

// ============================================
// SESSION CHECK-INS LIST
// ============================================

export const getSessionCheckins = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string; sessionId: string }) =>
    z.object({ accessToken: z.string(), sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<AttendanceRecordWithMember[]> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()
    const { data: records, error } = await admin
      .from('attendance_records')
      .select(
        '*, member:members!attendance_records_member_id_fkey(id, name, satellite_id)',
      )
      .eq('session_id', data.sessionId)
      .order('checked_in_at', { ascending: false })
    if (error) {
      console.error('Error fetching session check-ins:', error)
      throw new Error('Failed to fetch check-ins')
    }
    return (records ?? []) as AttendanceRecordWithMember[]
  })

// ============================================
// MATCH QUEUE
// ============================================

export const getPendingMatches = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string; sessionId?: string }) =>
    z.object({ accessToken: z.string(), sessionId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<PendingMatch[]> => {
    await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()

    let query = admin
      .from('attendance_records')
      .select('*')
      .eq('match_status', 'pending')
      .order('checked_in_at', { ascending: true })
    if (data.sessionId) query = query.eq('session_id', data.sessionId)

    const { data: records, error } = await query
    if (error) {
      console.error('Error fetching pending matches:', error)
      throw new Error('Failed to fetch pending matches')
    }

    // Recompute fuzzy candidates per pending record (no candidate table needed).
    const rows = (records ?? []) as AttendanceRecord[]
    const result: PendingMatch[] = []
    for (const rec of rows) {
      const candidates = await fuzzyCandidates(admin, rec.raw_name)
      result.push({ record: rec as AttendanceRecordWithMember, candidates })
    }
    return result
  })

export const confirmMatch = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; recordId: string; memberId: string }) =>
    z
      .object({
        accessToken: z.string(),
        recordId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean; alreadyCheckedIn?: boolean }> => {
    const caller = await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()

    // Load the pending record to get its session.
    const { data: rec, error: recErr } = await admin
      .from('attendance_records')
      .select('id, session_id, member_id')
      .eq('id', data.recordId)
      .single()
    if (recErr || !rec) throw new Error('Check-in record not found')

    // Guard against linking a member already checked in to this session.
    const { data: existing } = await admin
      .from('attendance_records')
      .select('id')
      .eq('session_id', rec.session_id)
      .eq('member_id', data.memberId)
      .maybeSingle()
    if (existing && existing.id !== data.recordId) {
      // Fold this duplicate into the existing record: mark it ignored.
      await admin
        .from('attendance_records')
        .update({ match_status: 'ignored', note: 'Duplicate of an existing check-in', matched_by: caller.userId })
        .eq('id', data.recordId)
      return { success: true, alreadyCheckedIn: true }
    }

    const { error } = await admin
      .from('attendance_records')
      .update({
        member_id: data.memberId,
        match_status: 'confirmed',
        matched_by: caller.userId,
      })
      .eq('id', data.recordId)
    if (error) {
      console.error('Error confirming match:', error)
      throw new Error('Failed to confirm match')
    }
    return { success: true }
  })

const createMemberFromCheckinSchema = z.object({
  accessToken: z.string(),
  recordId: z.string().uuid(),
  name: z.string().min(2).max(100),
  phone: z.string().max(20).optional().nullable(),
  satelliteId: z.string().uuid().optional().nullable(),
})

export const createMemberFromCheckin = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof createMemberFromCheckinSchema>) =>
    createMemberFromCheckinSchema.parse(data),
  )
  .handler(async ({ data }): Promise<{ success: boolean; memberId: string }> => {
    const caller = await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()

    // Determine satellite from the session when not provided.
    const { data: rec, error: recErr } = await admin
      .from('attendance_records')
      .select('id, session_id')
      .eq('id', data.recordId)
      .single()
    if (recErr || !rec) throw new Error('Check-in record not found')

    let satelliteId = data.satelliteId ?? null
    if (!satelliteId) {
      const { data: session } = await admin
        .from('service_sessions')
        .select('satellite_id')
        .eq('id', rec.session_id)
        .single()
      satelliteId = session?.satellite_id ?? null
    }

    const { data: member, error: memErr } = await admin
      .from('members')
      .insert({
        name: data.name,
        phone: data.phone ?? null,
        satellite_id: satelliteId,
        discipleship_stage: 'Newbie',
        membership_status: 'visitor',
      })
      .select('id')
      .single()
    if (memErr) {
      console.error('Error creating member from check-in:', memErr)
      throw new Error('Failed to create member')
    }

    const { error: updErr } = await admin
      .from('attendance_records')
      .update({
        member_id: member.id,
        match_status: 'new_member',
        matched_by: caller.userId,
      })
      .eq('id', data.recordId)
    if (updErr) {
      console.error('Error linking new member to check-in:', updErr)
      throw new Error('Member created but failed to link the check-in')
    }
    return { success: true, memberId: member.id as string }
  })

export const ignoreCheckin = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; recordId: string; note?: string | null }) =>
    z
      .object({
        accessToken: z.string(),
        recordId: z.string().uuid(),
        note: z.string().max(200).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const caller = await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const { error } = await admin
      .from('attendance_records')
      .update({ match_status: 'ignored', note: data.note ?? null, matched_by: caller.userId })
      .eq('id', data.recordId)
    if (error) {
      console.error('Error ignoring check-in:', error)
      throw new Error('Failed to update check-in')
    }
    return { success: true }
  })

export const deleteCheckin = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; recordId: string }) =>
    z.object({ accessToken: z.string(), recordId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const { error } = await admin.from('attendance_records').delete().eq('id', data.recordId)
    if (error) {
      console.error('Error deleting check-in:', error)
      throw new Error('Failed to delete check-in')
    }
    return { success: true }
  })

// ============================================
// ANALYTICS
// ============================================

// Raw joined row used to compute analytics in JS.
interface AnalyticsRow {
  id: string
  session_id: string
  member_id: string | null
  match_status: string
  checked_in_at: string
  checkin_method: string
  session: {
    session_date: string
    satellite_id: string | null
    service_type_id?: string | null
    service_type: { name: string; slug: string } | null
    satellite: { name: string } | null
  } | null
}

const statsSchema = z.object({
  accessToken: z.string(),
  serviceTypeId: z.string().uuid().optional(),
  satelliteId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

export const getAttendanceStats = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof statsSchema>) => statsSchema.parse(data))
  .handler(async ({ data }): Promise<AttendanceStats> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()

    // Pull counted (non-ignored) records joined to session/service/satellite.
    const { data: rowsRaw, error } = await admin
      .from('attendance_records')
      .select(
        'id, session_id, member_id, match_status, checked_in_at, session:service_sessions!attendance_records_session_id_fkey(session_date, satellite_id, service_type_id, service_type:service_types!service_sessions_service_type_id_fkey(name, slug), satellite:satellites!service_sessions_satellite_id_fkey(name))',
      )
      .neq('match_status', 'ignored')
    if (error) {
      console.error('Error fetching attendance stats:', error)
      throw new Error('Failed to fetch attendance stats')
    }

    let rows = (rowsRaw ?? []) as unknown as AnalyticsRow[]

    // Apply filters in JS (keeps the joined query simple and index-friendly).
    if (data.from) rows = rows.filter((r) => (r.session?.session_date ?? '') >= data.from!)
    if (data.to) rows = rows.filter((r) => (r.session?.session_date ?? '') <= data.to!)
    if (data.satelliteId) rows = rows.filter((r) => r.session?.satellite_id === data.satelliteId)
    if (data.serviceTypeId) rows = rows.filter((r) => r.session?.service_type_id === data.serviceTypeId)

    // First-ever check-in per member (across all counted records, unfiltered)
    // so first-timer detection is accurate regardless of the date window.
    const firstSessionByMember = new Map<string, string>()
    const allCounted = (rowsRaw ?? []) as unknown as AnalyticsRow[]
    const sortedByTime = [...allCounted].sort((a, b) =>
      a.checked_in_at < b.checked_in_at ? -1 : 1,
    )
    for (const r of sortedByTime) {
      if (r.member_id && !firstSessionByMember.has(r.member_id)) {
        firstSessionByMember.set(r.member_id, r.session_id)
      }
    }

    // Aggregations over the filtered rows.
    const byServiceMap = new Map<string, { service_name: string; count: number }>()
    const bySatelliteMap = new Map<string, { satellite_name: string; count: number; satellite_id: string | null }>()
    const trendMap = new Map<
      string,
      { session_date: string; service_slug: string; service_name: string; count: number; first_timers: number }
    >()
    const memberCount = new Map<string, number>()
    const uniqueMembers = new Set<string>()
    let matchedCheckins = 0
    let pendingCount = 0

    for (const r of rows) {
      const svcName = r.session?.service_type?.name ?? 'Unknown'
      const svcSlug = r.session?.service_type?.slug ?? 'unknown'
      const satName = r.session?.satellite?.name ?? 'Unassigned'
      const satId = r.session?.satellite_id ?? null

      const svc = byServiceMap.get(svcSlug) ?? { service_name: svcName, count: 0 }
      svc.count += 1
      byServiceMap.set(svcSlug, svc)

      const satKey = satId ?? 'none'
      const sat = bySatelliteMap.get(satKey) ?? { satellite_name: satName, count: 0, satellite_id: satId }
      sat.count += 1
      bySatelliteMap.set(satKey, sat)

      const isFirstTimer = r.member_id
        ? firstSessionByMember.get(r.member_id) === r.session_id
        : false
      const tr =
        trendMap.get(r.session_id) ??
        {
          session_date: r.session?.session_date ?? '',
          service_slug: svcSlug,
          service_name: svcName,
          count: 0,
          first_timers: 0,
        }
      tr.count += 1
      if (isFirstTimer) tr.first_timers += 1
      trendMap.set(r.session_id, tr)

      if (r.member_id) {
        uniqueMembers.add(r.member_id)
        memberCount.set(r.member_id, (memberCount.get(r.member_id) ?? 0) + 1)
        matchedCheckins += 1
      }
      if (r.match_status === 'pending') pendingCount += 1
    }

    // Top attendees need member names.
    const topEntries = [...memberCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    let topAttendees: { member_id: string; name: string; count: number }[] = []
    if (topEntries.length > 0) {
      const { data: names } = await admin
        .from('members')
        .select('id, name')
        .in(
          'id',
          topEntries.map(([id]) => id),
        )
      const nameMap = new Map((names ?? []).map((m) => [m.id as string, m.name as string]))
      topAttendees = topEntries.map(([id, count]) => ({
        member_id: id,
        name: nameMap.get(id) ?? 'Unknown',
        count,
      }))
    }

    const trend = [...trendMap.entries()]
      .map(([session_id, v]) => ({ session_id, ...v }))
      .sort((a, b) => (a.session_date < b.session_date ? -1 : 1))

    return {
      totalCheckins: rows.length,
      matchedCheckins,
      pendingCount,
      uniqueMembers: uniqueMembers.size,
      byService: [...byServiceMap.entries()].map(([slug, v]) => ({
        service_slug: slug,
        service_name: v.service_name,
        count: v.count,
      })),
      bySatellite: [...bySatelliteMap.values()].map((v) => ({
        satellite_id: v.satellite_id,
        satellite_name: v.satellite_name,
        count: v.count,
      })),
      trend,
      topAttendees,
    }
  })

// ============================================
// MEMBER ATTENDANCE HISTORY
// ============================================

async function loadMemberAttendance(
  admin: ReturnType<typeof createServerAdminClient>,
  memberId: string,
): Promise<MemberAttendanceSummary> {
  const { data, error } = await admin
    .from('attendance_records')
    .select(
      'id, session_id, checked_in_at, checkin_method, match_status, session:service_sessions!attendance_records_session_id_fkey(session_date, service_type:service_types!service_sessions_service_type_id_fkey(name, slug), satellite:satellites!service_sessions_satellite_id_fkey(name))',
    )
    .eq('member_id', memberId)
    .neq('match_status', 'ignored')
    .order('checked_in_at', { ascending: false })
  if (error) {
    console.error('Error loading member attendance:', error)
    throw new Error('Failed to load attendance history')
  }

  const rows = (data ?? []) as unknown as AnalyticsRow[]
  const byServiceMap = new Map<string, { service_name: string; count: number }>()
  const recent: MemberAttendanceEntry[] = []
  for (const r of rows) {
    const svcName = r.session?.service_type?.name ?? 'Service'
    const svcSlug = r.session?.service_type?.slug ?? 'unknown'
    const svc = byServiceMap.get(svcSlug) ?? { service_name: svcName, count: 0 }
    svc.count += 1
    byServiceMap.set(svcSlug, svc)
    recent.push({
      record_id: r.id,
      session_id: r.session_id,
      session_date: r.session?.session_date ?? '',
      service_name: svcName,
      service_slug: svcSlug,
      satellite_name: r.session?.satellite?.name ?? null,
      checked_in_at: r.checked_in_at,
      checkin_method: r.checkin_method as CheckinMethod,
    })
  }

  return {
    totalCheckins: rows.length,
    byService: [...byServiceMap.entries()].map(([slug, v]) => ({
      service_slug: slug,
      service_name: v.service_name,
      count: v.count,
    })),
    recent: recent.slice(0, 25),
  }
}

// Staff-facing: attendance history for any member (registration.read).
export const getMemberAttendance = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string; memberId: string }) =>
    z.object({ accessToken: z.string(), memberId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<MemberAttendanceSummary> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()
    return loadMemberAttendance(admin, data.memberId)
  })

// Member self-view: attendance for the caller's own linked member profile.
export const getMyAttendance = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<MemberAttendanceSummary | null> => {
    const caller = await getCaller(data.accessToken)
    const admin = createServerAdminClient()
    const { data: profile } = await admin
      .from('user_profiles')
      .select('member_id')
      .eq('id', caller.userId)
      .single()
    if (!profile?.member_id) return null
    return loadMemberAttendance(admin, profile.member_id)
  })
