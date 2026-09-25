// Member account claims — "claim your member record" via a Quest Circle QR.
//
// Pilot migration context: member records were bulk-imported first (with giving
// and attendance tagged to them). This lets those members create an account and
// claim their own record instead of an admin hand-linking every one.
//
// Flow: leader enables their circle's sign-up link -> disciple scans the QR and
// submits name/email/phone/birthday -> we create the auth account and email a
// confirmation link -> the submission is scored against the directory
// (src/lib/memberClaim.ts) -> exactly one candidate >= 0.9 auto-links, anything
// else queues for the circle's leader (or an admin) to decide.
//
// AUTHORIZATION
//  - getSignupGroup / submitClaimSignup are PUBLIC: they authorize on the
//    unguessable signup token + `enabled` flag, exactly like publicCheckIn does
//    with a QR token. They deliberately reveal nothing about the directory.
//  - Everything else goes through requireGroupApprover: admin, or a holder of
//    cell_groups.write, or the circle's own leader/co-leader.
//
// A claim NEVER auto-creates a member record — that is what produced duplicate
// members in the old completeOwnProfile path. Creating one is an explicit
// approver action (createMemberFromClaim).

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, getCallerMemberId, getPermissionMatrix } from './_authGuard'
import { permissionMatches, permissionsForRole } from '../../lib/auth'
import { createInvitedAuthUser, findAuthUserByEmail, resendConfirmLink } from '../authInvite'
import { enrollInAgapayIfEligible } from '../agapayEnroll'
import { todayIsoDate } from '../../lib/agapay'
import {
  resolveClaim,
  topScore,
  type ClaimCandidateMember,
  type ClaimSubmission,
  type ScoredClaimCandidate,
} from '../../lib/memberClaim'
import {
  MATCH_SIMILARITY_THRESHOLD,
  CLAIM_RATE_LIMIT,
  CLAIM_RATE_WINDOW_MINUTES,
} from '../../lib/constants'
import type {
  ClaimCandidateView,
  ClaimQueueItem,
  ClaimStatus,
  LedCircle,
  MemberClaimRequest,
  MyClaimStatus,
  UserRole,
} from '../../lib/types'

type AdminClient = ReturnType<typeof createServerAdminClient>

// ============================================
// HELPERS
// ============================================

/** A circle whose sign-up link resolved successfully. */
interface SignupTarget {
  cellGroupId: string
  groupName: string
  satelliteId: string | null
  satelliteName: string | null
}

/**
 * Resolve a public signup token to its circle. Returns null (never throws) when
 * the token is unknown, the link is disabled, or the circle is inactive — the
 * public route shows one generic "link not active" screen for all three so a
 * token cannot be probed for validity.
 */
async function resolveSignupToken(admin: AdminClient, token: string): Promise<SignupTarget | null> {
  const { data: link } = await admin
    .from('cell_group_signup_links')
    .select('cell_group_id, enabled')
    .eq('token', token)
    .maybeSingle()
  if (!link || !link.enabled) return null

  const { data: group } = await admin
    .from('cell_groups')
    .select('id, name, is_active, satellite_id, satellite:satellites!cell_groups_satellite_id_fkey(name)')
    .eq('id', link.cell_group_id)
    .maybeSingle()
  if (!group || group.is_active === false) return null

  const row = group as unknown as {
    id: string
    name: string
    satellite_id: string | null
    satellite: { name: string } | null
  }
  return {
    cellGroupId: row.id,
    groupName: row.name,
    satelliteId: row.satellite_id,
    satelliteName: row.satellite?.name ?? null,
  }
}

/**
 * Member ids belonging to a circle: active memberships, its leaders, and anyone
 * whose discipler is the circle's leader.
 *
 * Two fields describe "who is in a circle" and they drift: tierra's
 * member_cell_groups (used by the directory) and members.discipler_id (used by
 * Agapay, the discipleship app on the same database). A disciple often has one
 * but not the other, so both count as evidence for the "in this circle" bonus.
 */
async function groupMemberIds(admin: AdminClient, cellGroupId: string): Promise<Set<string>> {
  const [membershipRes, groupRes] = await Promise.all([
    admin
      .from('member_cell_groups')
      .select('member_id')
      .eq('cell_group_id', cellGroupId)
      .eq('is_active', true),
    admin.from('cell_groups').select('leader_id, co_leader_id').eq('id', cellGroupId).maybeSingle(),
  ])

  const ids = new Set<string>()
  for (const row of (membershipRes.data ?? []) as unknown as { member_id: string }[]) {
    ids.add(row.member_id)
  }
  const g = groupRes.data as unknown as { leader_id: string | null; co_leader_id: string | null } | null
  if (g?.leader_id) ids.add(g.leader_id)
  if (g?.co_leader_id) ids.add(g.co_leader_id)

  if (g?.leader_id) {
    const { data: disciples } = await admin
      .from('members')
      .select('id')
      .eq('discipler_id', g.leader_id)
      .eq('is_archived', false)
    for (const row of (disciples ?? []) as unknown as { id: string }[]) ids.add(row.id)
  }
  return ids
}

/**
 * Point a member at the circle's leader as their discipler, but ONLY when the
 * member has no discipler yet. Never overwrites an existing assignment (that is
 * an audited change in Agapay via reassign_disciples) and never points a leader
 * at themselves. Best-effort: a failure here must not undo the account link.
 */
async function setDisciplerIfEmpty(
  admin: AdminClient,
  memberId: string,
  cellGroupId: string,
): Promise<void> {
  const { data: group } = await admin
    .from('cell_groups')
    .select('leader_id')
    .eq('id', cellGroupId)
    .maybeSingle()
  const leaderId = (group as unknown as { leader_id: string | null } | null)?.leader_id ?? null
  if (!leaderId || leaderId === memberId) return

  const { error } = await admin
    .from('members')
    .update({ discipler_id: leaderId })
    .eq('id', memberId)
    .is('discipler_id', null)
  if (error) console.error('Error setting discipler from claim:', error)
}

/** Member ids that already back an account (never auto-link to these). */
async function linkedMemberIds(admin: AdminClient): Promise<Set<string>> {
  const { data } = await admin.from('user_profiles').select('member_id').not('member_id', 'is', null)
  const ids = new Set<string>()
  for (const row of (data ?? []) as unknown as { member_id: string | null }[]) {
    if (row.member_id) ids.add(row.member_id)
  }
  return ids
}

/**
 * Trigram similarity by member id for a typed name, via the same RPC the
 * attendance queue uses. Never fatal — a failure just means we fall back to
 * token-based name scoring.
 */
async function trigramSimilarity(admin: AdminClient, name: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!name.trim()) return map
  const { data, error } = await admin.rpc('search_members_similar', {
    q: name,
    threshold: MATCH_SIMILARITY_THRESHOLD,
    max_results: 10,
  })
  if (error) {
    console.error('Error fetching claim trigram candidates:', error)
    return map
  }
  for (const row of (data ?? []) as unknown as { id: string; sim: number }[]) {
    map.set(row.id, Number(row.sim))
  }
  return map
}

/** Load the un-archived directory in the shape the scorer needs (~200 rows). */
async function loadClaimDirectory(admin: AdminClient): Promise<ClaimCandidateMember[]> {
  const { data, error } = await admin
    .from('members')
    .select('id, name, email, phone, birthday, satellite_id')
    .eq('is_archived', false)
  if (error) {
    console.error('Error loading member directory for claims:', error)
    throw new Error('Member directory failed to load.')
  }
  return (data ?? []) as unknown as ClaimCandidateMember[]
}

/** Score one submission against the whole directory. */
async function scoreSubmission(
  admin: AdminClient,
  submission: ClaimSubmission,
  cellGroupId: string | null,
) {
  const [directory, trigramSim, linked, inGroup] = await Promise.all([
    loadClaimDirectory(admin),
    trigramSimilarity(admin, submission.name),
    linkedMemberIds(admin),
    cellGroupId ? groupMemberIds(admin, cellGroupId) : Promise.resolve(new Set<string>()),
  ])
  return resolveClaim(submission, directory, {
    groupMemberIds: inGroup,
    trigramSim,
    linkedMemberIds: linked,
  })
}

/**
 * Decorate scored candidates for an approver: giving total (the thing that makes
 * picking the right record matter) and satellite name.
 */
async function decorateCandidates(
  admin: AdminClient,
  candidates: readonly ScoredClaimCandidate[],
): Promise<ClaimCandidateView[]> {
  if (candidates.length === 0) return []
  const ids = candidates.map((c) => c.member.id)
  const satelliteIds = [
    ...new Set(candidates.map((c) => c.member.satellite_id).filter((v): v is string => Boolean(v))),
  ]

  const [txRes, satRes] = await Promise.all([
    admin
      .from('financial_transactions')
      .select('member_id, amount')
      .eq('transaction_type', 'income')
      .in('member_id', ids),
    satelliteIds.length
      ? admin.from('satellites').select('id, name').in('id', satelliteIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])

  const givingByMember = new Map<string, number>()
  for (const t of (txRes.data ?? []) as unknown as { member_id: string; amount: number | string }[]) {
    givingByMember.set(t.member_id, (givingByMember.get(t.member_id) ?? 0) + Number(t.amount))
  }
  const satName = new Map(
    ((satRes.data ?? []) as unknown as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  )

  return candidates.map((c) => ({
    id: c.member.id,
    name: c.member.name,
    email: c.member.email,
    phone: c.member.phone,
    satellite_name: c.member.satellite_id ? satName.get(c.member.satellite_id) ?? null : null,
    score: Number(c.score.toFixed(3)),
    reasons: c.reasons,
    giving_total: givingByMember.get(c.member.id) ?? 0,
    already_linked: c.alreadyLinked,
  }))
}

interface ApproverContext {
  userId: string
  /** True when the caller may act on ANY circle's claims. */
  global: boolean
}

/**
 * Authorize an approver action. Admins and cell_groups.write holders can act on
 * any circle; a circle's leader/co-leader can act only on their own.
 *
 * Pass cellGroupId=null to check for global rights only — used when a claim's
 * circle was deleted, so no leader can be identified.
 */
async function requireGroupApprover(
  accessToken: string | undefined | null,
  cellGroupId: string | null,
): Promise<ApproverContext> {
  const caller = await getCaller(accessToken)
  const admin = createServerAdminClient()

  if (caller.role === 'admin') return { userId: caller.userId, global: true }

  const matrix = await getPermissionMatrix(admin)
  const granted = permissionsForRole(caller.role as UserRole, matrix)
  if (permissionMatches(granted, 'cell_groups.write')) {
    return { userId: caller.userId, global: true }
  }

  if (!cellGroupId) {
    throw new Error('Admin access required.')
  }

  const memberId = await getCallerMemberId(admin, caller.userId)
  if (!memberId) {
    throw new Error(
      'Account not linked to a member record. Admin link required.',
    )
  }

  const { data: group } = await admin
    .from('cell_groups')
    .select('leader_id, co_leader_id')
    .eq('id', cellGroupId)
    .maybeSingle()
  const g = group as unknown as { leader_id: string | null; co_leader_id: string | null } | null
  if (!g || (g.leader_id !== memberId && g.co_leader_id !== memberId)) {
    throw new Error('Not the leader of this circle.')
  }

  return { userId: caller.userId, global: false }
}

/** Load a claim row or throw a user-facing error. */
async function loadClaim(admin: AdminClient, claimId: string): Promise<MemberClaimRequest> {
  const { data, error } = await admin
    .from('member_claim_requests')
    .select('*')
    .eq('id', claimId)
    .maybeSingle()
  if (error || !data) throw new Error('Sign-up request not found.')
  return data as unknown as MemberClaimRequest
}

/**
 * Enforce the 1:1 account <-> member rule (a member record may back at most one
 * account). Mirrors linkAccountToMember in users.ts.
 */
async function assertMemberUnlinked(admin: AdminClient, memberId: string, userId: string) {
  const { data: others } = await admin
    .from('user_profiles')
    .select('id')
    .eq('member_id', memberId)
    .neq('id', userId)
  if (others && others.length > 0) {
    throw new Error('Member record already linked to another account.')
  }
}

// ============================================
// PUBLIC — SIGN-UP LINK
// ============================================

export interface SignupGroupInfo {
  groupName: string
  satelliteName: string | null
}

/**
 * PUBLIC. Resolve a sign-up token for the join page. Returns null for unknown,
 * disabled, or inactive — the page shows one generic screen for all of them.
 */
export const getSignupGroup = createServerFn({ method: 'GET' })
  .inputValidator((input: { token: string }) =>
    z.object({ token: z.string().min(4).max(100) }).parse(input),
  )
  .handler(async ({ data }): Promise<SignupGroupInfo | null> => {
    const admin = createServerAdminClient()
    const target = await resolveSignupToken(admin, data.token)
    if (!target) return null
    return { groupName: target.groupName, satelliteName: target.satelliteName }
  })

const submitClaimSchema = z.object({
  token: z.string().min(4).max(100),
  name: z.string().trim().min(2, 'Full name required.').max(100),
  email: z.string().trim().email('Email address invalid.').max(200),
  phone: z.string().trim().max(30).optional().nullable(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthday format invalid.')
    .optional()
    .nullable(),
})

export interface SubmitClaimResult {
  /** True when a confirmation email was sent. */
  emailed: boolean
  /** True when this email already had an unconfirmed account and we resent. */
  resent: boolean
}

/**
 * PUBLIC. Create an account for a circle sign-up and queue/auto-resolve its
 * claim on a member record.
 *
 * The result deliberately says nothing about whether a member record matched —
 * an anonymous caller must not be able to probe the directory by watching the
 * response change.
 */
export const submitClaimSignup = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof submitClaimSchema>) => submitClaimSchema.parse(input))
  .handler(async ({ data }): Promise<SubmitClaimResult> => {
    const admin = createServerAdminClient()

    const target = await resolveSignupToken(admin, data.token)
    if (!target) throw new Error('Sign-up link inactive. Request a new QR code from the circle leader.')

    // Blunt a leaked-link flood. The token is secret, so this is a backstop.
    const windowStart = new Date(Date.now() - CLAIM_RATE_WINDOW_MINUTES * 60_000).toISOString()
    const { count } = await admin
      .from('member_claim_requests')
      .select('id', { count: 'exact', head: true })
      .eq('cell_group_id', target.cellGroupId)
      .gte('created_at', windowStart)
    if ((count ?? 0) >= CLAIM_RATE_LIMIT) {
      throw new Error('Too many sign-ups on this link. Retry in a few minutes.')
    }

    const email = data.email.toLowerCase()
    const emailParams = {
      roleLabel: 'Member',
      variant: 'claim' as const,
      groupName: target.groupName,
      recipientName: data.name,
    }

    // Existing account? Resend only when it was never used AND already has a
    // claim (i.e. the person is re-trying their own sign-up). Otherwise send
    // them to sign in — never hint at whether an account exists beyond this.
    const existing = await findAuthUserByEmail(admin, email)
    if (existing) {
      const { data: priorClaim } = await admin
        .from('member_claim_requests')
        .select('id, submitted_name')
        .eq('user_id', existing.id)
        .maybeSingle()
      if (!existing.last_sign_in_at && priorClaim) {
        const { emailed } = await resendConfirmLink(admin, email, {
          ...emailParams,
          recipientName: (priorClaim as unknown as { submitted_name: string }).submitted_name,
        })
        return { emailed, resent: true }
      }
      throw new Error(
        'Account already exists for this email. Sign in or reset the password.',
      )
    }

    const { userId, emailed } = await createInvitedAuthUser(admin, {
      email,
      metadata: { claim: true, cell_group_id: target.cellGroupId },
      email_params: emailParams,
    })

    const submission: ClaimSubmission = {
      name: data.name,
      email,
      phone: data.phone ?? null,
      birthday: data.birthday ?? null,
    }

    // Scoring must never block account creation — the person can still confirm
    // their email and be linked later from the queue.
    let resolution: Awaited<ReturnType<typeof scoreSubmission>> | null = null
    try {
      resolution = await scoreSubmission(admin, submission, target.cellGroupId)
    } catch (err) {
      console.error('Error scoring claim submission:', err)
    }

    let status: ClaimStatus = 'pending'
    let matchedMemberId: string | null = null

    if (resolution?.decision === 'auto' && resolution.autoMember) {
      // Re-check 1:1 immediately before writing — the snapshot could be stale.
      try {
        await assertMemberUnlinked(admin, resolution.autoMember.id, userId)
        const { error: linkErr } = await admin
          .from('user_profiles')
          .update({ member_id: resolution.autoMember.id })
          .eq('id', userId)
        if (linkErr) throw new Error(linkErr.message)
        status = 'auto_linked'
        matchedMemberId = resolution.autoMember.id
        // An existing member with a discipler joins that discipler's Agapay queue.
        await enrollInAgapayIfEligible(admin, matchedMemberId, null, 'circle sign-up')
      } catch (err) {
        // Fall back to review rather than losing the sign-up.
        console.error('Auto-link failed, queuing claim for review:', err)
      }
    }

    const { error: insErr } = await admin.from('member_claim_requests').insert({
      user_id: userId,
      cell_group_id: target.cellGroupId,
      submitted_name: data.name,
      submitted_email: email,
      submitted_phone: data.phone ?? null,
      submitted_birthday: data.birthday ?? null,
      status,
      matched_member_id: matchedMemberId,
      top_score: resolution ? topScore(resolution.candidates) : null,
    })
    if (insErr) {
      console.error('Error recording claim request:', insErr)
      throw new Error('Sign-up not recorded. Contact the circle leader.')
    }

    return { emailed, resent: false }
  })

// ============================================
// LEADER — MY CIRCLES
// ============================================

/**
 * Circles the caller may run a sign-up link for. Leaders/co-leaders see their
 * own; admins and cell_groups.write holders see every active circle.
 * Lazily creates the signup-link row for circles added after the migration.
 */
export const getMyLedGroups = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<LedCircle[]> => {
    const caller = await getCaller(data.accessToken)
    const admin = createServerAdminClient()

    const matrix = await getPermissionMatrix(admin)
    const granted = permissionsForRole(caller.role as UserRole, matrix)
    const isGlobal = caller.role === 'admin' || permissionMatches(granted, 'cell_groups.write')

    let query = admin
      .from('cell_groups')
      .select('id, name, satellite:satellites!cell_groups_satellite_id_fkey(name)')
      .eq('is_active', true)
      .order('name')

    if (!isGlobal) {
      const memberId = await getCallerMemberId(admin, caller.userId)
      // Not linked yet -> leads nothing we can prove. The UI explains this.
      if (!memberId) return []
      query = query.or(`leader_id.eq.${memberId},co_leader_id.eq.${memberId}`)
    }

    const { data: groups, error } = await query
    if (error) {
      console.error('Error loading led circles:', error)
      throw new Error('Circles failed to load.')
    }

    const rows = (groups ?? []) as unknown as {
      id: string
      name: string
      satellite: { name: string } | null
    }[]
    if (rows.length === 0) return []
    const ids = rows.map((g) => g.id)

    // Ensure every circle has a link row (no-op for the backfilled ones).
    await admin
      .from('cell_group_signup_links')
      .upsert(
        ids.map((id) => ({ cell_group_id: id })),
        { onConflict: 'cell_group_id', ignoreDuplicates: true },
      )

    const [linkRes, memberRes, pendingRes] = await Promise.all([
      admin.from('cell_group_signup_links').select('cell_group_id, token, enabled').in('cell_group_id', ids),
      admin
        .from('member_cell_groups')
        .select('cell_group_id')
        .in('cell_group_id', ids)
        .eq('is_active', true),
      admin
        .from('member_claim_requests')
        .select('cell_group_id')
        .in('cell_group_id', ids)
        .eq('status', 'pending'),
    ])

    const links = new Map(
      ((linkRes.data ?? []) as unknown as { cell_group_id: string; token: string; enabled: boolean }[]).map(
        (l) => [l.cell_group_id, l],
      ),
    )
    const memberCount = new Map<string, number>()
    for (const m of (memberRes.data ?? []) as unknown as { cell_group_id: string }[]) {
      memberCount.set(m.cell_group_id, (memberCount.get(m.cell_group_id) ?? 0) + 1)
    }
    const pendingCount = new Map<string, number>()
    for (const c of (pendingRes.data ?? []) as unknown as { cell_group_id: string }[]) {
      pendingCount.set(c.cell_group_id, (pendingCount.get(c.cell_group_id) ?? 0) + 1)
    }

    return rows
      .map((g) => {
        const link = links.get(g.id)
        return {
          id: g.id,
          name: g.name,
          satellite_name: g.satellite?.name ?? null,
          member_count: memberCount.get(g.id) ?? 0,
          signup_token: link?.token ?? '',
          signup_enabled: link?.enabled ?? false,
          pending_count: pendingCount.get(g.id) ?? 0,
        }
      })
      // A circle with no token row (upsert race) can't show a QR — hide it.
      .filter((g) => g.signup_token !== '')
  })

export const setGroupSignupEnabled = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; cellGroupId: string; enabled: boolean }) =>
    z
      .object({
        accessToken: z.string(),
        cellGroupId: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requireGroupApprover(data.accessToken, data.cellGroupId)
    const admin = createServerAdminClient()

    const { error } = await admin
      .from('cell_group_signup_links')
      .upsert(
        { cell_group_id: data.cellGroupId, enabled: data.enabled },
        { onConflict: 'cell_group_id' },
      )
    if (error) {
      console.error('Error toggling circle sign-up link:', error)
      throw new Error('Sign-up link update failed.')
    }
    return { success: true }
  })

/**
 * Issue a fresh token, invalidating the old QR/link. Use when a link leaks.
 * Existing claims keep their cell_group_id and are unaffected.
 */
export const regenerateGroupSignupToken = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; cellGroupId: string }) =>
    z.object({ accessToken: z.string(), cellGroupId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean; token: string }> => {
    await requireGroupApprover(data.accessToken, data.cellGroupId)
    const admin = createServerAdminClient()

    const token = randomBytes(9).toString('hex')
    const { error } = await admin
      .from('cell_group_signup_links')
      .upsert(
        { cell_group_id: data.cellGroupId, token, rotated_at: new Date().toISOString() },
        { onConflict: 'cell_group_id' },
      )
    if (error) {
      console.error('Error regenerating circle sign-up token:', error)
      throw new Error('Link replacement failed.')
    }
    return { success: true, token }
  })

// ============================================
// CLAIM QUEUE
// ============================================

const claimQueueSchema = z.object({
  accessToken: z.string(),
  cellGroupId: z.string().uuid().optional().nullable(),
  status: z
    .enum(['auto_linked', 'pending', 'confirmed', 'new_member', 'rejected'])
    .optional()
    .nullable(),
})

/**
 * Claims awaiting (or already past) a decision, with candidates recomputed on
 * read — the directory changes, so a stored candidate list would go stale. This
 * mirrors getPendingMatches in attendance.ts.
 */
export const getClaimQueue = createServerFn({ method: 'GET' })
  .inputValidator((input: z.infer<typeof claimQueueSchema>) => claimQueueSchema.parse(input))
  .handler(async ({ data }): Promise<ClaimQueueItem[]> => {
    const approver = await requireGroupApprover(data.accessToken, data.cellGroupId ?? null)
    const admin = createServerAdminClient()

    let query = admin
      .from('member_claim_requests')
      .select('*')
      .order('created_at', { ascending: true })

    if (data.cellGroupId) {
      query = query.eq('cell_group_id', data.cellGroupId)
    } else if (!approver.global) {
      // Defensive: requireGroupApprover already rejects this combination.
      throw new Error('Circle selection required.')
    }
    query = data.status ? query.eq('status', data.status) : query.eq('status', 'pending')

    const { data: rows, error } = await query
    if (error) {
      console.error('Error loading claim queue:', error)
      throw new Error('Sign-up requests failed to load.')
    }

    const claims = (rows ?? []) as unknown as MemberClaimRequest[]
    if (claims.length === 0) return []

    // Names for the circle and any already-matched member.
    const groupIds = [
      ...new Set(claims.map((c) => c.cell_group_id).filter((v): v is string => Boolean(v))),
    ]
    const memberIds = [
      ...new Set(claims.map((c) => c.matched_member_id).filter((v): v is string => Boolean(v))),
    ]
    const [groupRes, memberRes] = await Promise.all([
      groupIds.length
        ? admin.from('cell_groups').select('id, name').in('id', groupIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      memberIds.length
        ? admin.from('members').select('id, name').in('id', memberIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ])
    const groupName = new Map(
      ((groupRes.data ?? []) as unknown as { id: string; name: string }[]).map((g) => [g.id, g.name]),
    )
    const memberName = new Map(
      ((memberRes.data ?? []) as unknown as { id: string; name: string }[]).map((m) => [m.id, m.name]),
    )

    const items: ClaimQueueItem[] = []
    for (const claim of claims) {
      // Only unresolved claims need candidate suggestions.
      let candidates: ClaimCandidateView[] = []
      if (claim.status === 'pending') {
        const resolution = await scoreSubmission(
          admin,
          {
            name: claim.submitted_name,
            email: claim.submitted_email,
            phone: claim.submitted_phone,
            birthday: claim.submitted_birthday,
          },
          claim.cell_group_id,
        )
        candidates = await decorateCandidates(admin, resolution.candidates)
      }
      items.push({
        claim,
        cell_group_name: claim.cell_group_id ? groupName.get(claim.cell_group_id) ?? null : null,
        matched_member_name: claim.matched_member_id
          ? memberName.get(claim.matched_member_id) ?? null
          : null,
        candidates,
      })
    }
    return items
  })

/** Link a claim's account to an existing member record. */
export const confirmClaim = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: { accessToken: string; claimId: string; memberId: string; addToGroup?: boolean }) =>
      z
        .object({
          accessToken: z.string(),
          claimId: z.string().uuid(),
          memberId: z.string().uuid(),
          addToGroup: z.boolean().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const admin = createServerAdminClient()
    const claim = await loadClaim(admin, data.claimId)
    const approver = await requireGroupApprover(data.accessToken, claim.cell_group_id)

    const { data: member } = await admin
      .from('members')
      .select('id')
      .eq('id', data.memberId)
      .maybeSingle()
    if (!member) throw new Error('Member record not found.')

    await assertMemberUnlinked(admin, data.memberId, claim.user_id)

    const { error: linkErr } = await admin
      .from('user_profiles')
      .update({ member_id: data.memberId })
      .eq('id', claim.user_id)
    if (linkErr) {
      console.error('Error linking claim to member:', linkErr)
      throw new Error('Account link failed.')
    }

    if (data.addToGroup && claim.cell_group_id) {
      await admin.from('member_cell_groups').upsert(
        {
          member_id: data.memberId,
          cell_group_id: claim.cell_group_id,
          role: 'member',
          is_active: true,
        },
        { onConflict: 'member_id,cell_group_id' },
      )
      await setDisciplerIfEmpty(admin, data.memberId, claim.cell_group_id)
    }

    // Puts the person in their discipler's Agapay follow-up queue.
    await enrollInAgapayIfEligible(admin, data.memberId, approver.userId, 'circle sign-up')

    const { error } = await admin
      .from('member_claim_requests')
      .update({
        status: 'confirmed',
        matched_member_id: data.memberId,
        resolved_by: approver.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', data.claimId)
    if (error) {
      console.error('Error updating claim status:', error)
      throw new Error('Account linked. Request status update failed.')
    }
    return { success: true }
  })

const createMemberFromClaimSchema = z.object({
  accessToken: z.string(),
  claimId: z.string().uuid(),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  satelliteId: z.string().uuid().optional().nullable(),
})

/**
 * Create a brand-new member record for a claim (the person genuinely isn't in
 * the directory yet) and link the account to it. This is the ONLY path that
 * creates a member from a sign-up, and it always takes a human decision.
 */
export const createMemberFromClaim = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof createMemberFromClaimSchema>) =>
    createMemberFromClaimSchema.parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean; memberId: string }> => {
    const admin = createServerAdminClient()
    const claim = await loadClaim(admin, data.claimId)
    const approver = await requireGroupApprover(data.accessToken, claim.cell_group_id)

    let satelliteId = data.satelliteId ?? null
    if (!satelliteId && claim.cell_group_id) {
      const { data: group } = await admin
        .from('cell_groups')
        .select('satellite_id')
        .eq('id', claim.cell_group_id)
        .maybeSingle()
      satelliteId = (group as unknown as { satellite_id: string | null } | null)?.satellite_id ?? null
    }

    const { data: member, error: memErr } = await admin
      .from('members')
      .insert({
        name: data.name ?? claim.submitted_name,
        email: claim.submitted_email,
        phone: data.phone ?? claim.submitted_phone,
        birthday: claim.submitted_birthday,
        satellite_id: satelliteId,
        // city is NOT NULL but isn't collected at sign-up — an admin fills it in.
        city: '',
        discipleship_stage: 'Newbie',
        membership_status: 'active',
        joined_date: todayIsoDate(),
      })
      .select('id')
      .single()
    if (memErr) {
      console.error('Error creating member from claim:', memErr)
      // members.email is UNIQUE — a collision means the record already exists.
      if (memErr.code === '23505') {
        throw new Error(
          'Email already on a member record. Link that record instead.',
        )
      }
      throw new Error('Member record creation failed.')
    }

    const memberId = member.id as string

    const { error: linkErr } = await admin
      .from('user_profiles')
      .update({ member_id: memberId })
      .eq('id', claim.user_id)
    if (linkErr) {
      console.error('Error linking new member to claim account:', linkErr)
      throw new Error('Member record created. Account link failed.')
    }

    if (claim.cell_group_id) {
      await admin.from('member_cell_groups').upsert(
        {
          member_id: memberId,
          cell_group_id: claim.cell_group_id,
          role: 'member',
          is_active: true,
        },
        { onConflict: 'member_id,cell_group_id' },
      )
      await setDisciplerIfEmpty(admin, memberId, claim.cell_group_id)
    }

    await enrollInAgapayIfEligible(admin, memberId, approver.userId, 'circle sign-up')

    await admin
      .from('member_claim_requests')
      .update({
        status: 'new_member',
        matched_member_id: memberId,
        resolved_by: approver.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', data.claimId)

    return { success: true, memberId }
  })

/**
 * Reject a claim. The account stays (the person confirmed an email) but remains
 * unlinked; an admin can deactivate or delete it from Admin -> Users.
 */
export const rejectClaim = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; claimId: string; note?: string | null }) =>
    z
      .object({
        accessToken: z.string(),
        claimId: z.string().uuid(),
        note: z.string().max(200).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const admin = createServerAdminClient()
    const claim = await loadClaim(admin, data.claimId)
    const approver = await requireGroupApprover(data.accessToken, claim.cell_group_id)

    const { error } = await admin
      .from('member_claim_requests')
      .update({
        status: 'rejected',
        note: data.note ?? null,
        resolved_by: approver.userId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', data.claimId)
    if (error) {
      console.error('Error rejecting claim:', error)
      throw new Error('Request update failed.')
    }
    return { success: true }
  })

/**
 * Undo a link made by this claim and send it back to the queue. Global
 * approvers only — unlinking touches someone's giving history.
 */
export const undoClaimLink = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; claimId: string }) =>
    z.object({ accessToken: z.string(), claimId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const admin = createServerAdminClient()
    const claim = await loadClaim(admin, data.claimId)
    const approver = await requireGroupApprover(data.accessToken, claim.cell_group_id)
    if (!approver.global) {
      throw new Error('Admin access required to undo a link.')
    }

    const { error: unlinkErr } = await admin
      .from('user_profiles')
      .update({ member_id: null })
      .eq('id', claim.user_id)
    if (unlinkErr) {
      console.error('Error unlinking claim account:', unlinkErr)
      throw new Error('Account unlink failed.')
    }

    const { error } = await admin
      .from('member_claim_requests')
      .update({
        status: 'pending',
        matched_member_id: null,
        resolved_by: null,
        resolved_at: null,
      })
      .eq('id', data.claimId)
    if (error) {
      console.error('Error resetting claim status:', error)
      throw new Error('Account unlinked. Request status reset failed.')
    }
    return { success: true }
  })

// ============================================
// SELF — MY CLAIM STATUS
// ============================================

/**
 * The caller's own claim state, for the "being reviewed" banner on /profile.
 * Self-service: resolves the caller from the token and requires no permission.
 */
export const getMyClaimStatus = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<MyClaimStatus | null> => {
    const caller = await getCaller(data.accessToken)
    const admin = createServerAdminClient()

    const { data: claim } = await admin
      .from('member_claim_requests')
      .select('status, cell_group_id, created_at')
      .eq('user_id', caller.userId)
      .maybeSingle()
    if (!claim) return null

    const row = claim as unknown as {
      status: ClaimStatus
      cell_group_id: string | null
      created_at: string
    }

    let groupName: string | null = null
    if (row.cell_group_id) {
      const { data: group } = await admin
        .from('cell_groups')
        .select('name')
        .eq('id', row.cell_group_id)
        .maybeSingle()
      groupName = (group as unknown as { name: string } | null)?.name ?? null
    }

    return {
      status: row.status,
      cell_group_name: groupName,
      submitted_at: row.created_at,
    }
  })
