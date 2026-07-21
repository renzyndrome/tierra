// Account management — user invitations, role assignment, activation.
// Every function verifies the caller server-side and requires the
// `users.manage` permission (admin by default). Uses the service-role client.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission, getCaller } from './_authGuard'
import { isResendConfigured, sendInviteEmail } from '../email'
import { getRoleDisplayName } from '../../lib/auth'
import type { AdminUserListItem, UserInvitation, UserRole } from '../../lib/types'

const ROLE_VALUES = ['admin', 'finance', 'satellite', 'registration', 'discipleship', 'member'] as const

type AdminClient = ReturnType<typeof createServerAdminClient>

function appBaseUrl(): string | undefined {
  const base = process.env.APP_URL || process.env.VITE_APP_URL
  return base ? base.replace(/\/$/, '') : undefined
}

// Fallback redirect embedded in the Supabase-hosted verify link (non-Resend path).
function appRedirectUrl(): string | undefined {
  const base = appBaseUrl()
  return base ? `${base}/auth/callback` : undefined
}

// Our-domain confirmation link — verifies the token via verifyOtp on our page,
// so Resend emails never expose the raw *.supabase.co URL.
function appConfirmUrl(tokenHash: string, type: string): string | null {
  const base = appBaseUrl()
  if (!base) return null
  return `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`
}

// Scan the (paginated) auth user list for a matching email.
async function findAuthUserByEmail(admin: AdminClient, email: string) {
  const target = email.toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const found = data.users.find((u) => (u.email ?? '').toLowerCase() === target)
    if (found) return found
    if (data.users.length < 200) break
  }
  return null
}

// ============================================
// LIST USERS
// ============================================

export const listUsers = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<AdminUserListItem[]> => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()

    const { data: profiles, error } = await admin
      .from('user_profiles')
      .select('id, role, satellite_id, member_id, is_active, last_login_at, created_at')
      .order('created_at', { ascending: true })
    if (error) throw new Error('Failed to load users')

    const rows = profiles ?? []
    const memberIds = [...new Set(rows.map((p) => p.member_id).filter(Boolean))] as string[]
    const satelliteIds = [...new Set(rows.map((p) => p.satellite_id).filter(Boolean))] as string[]

    const [membersRes, satellitesRes, pinsRes] = await Promise.all([
      memberIds.length
        ? admin.from('members').select('id, name').in('id', memberIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      satelliteIds.length
        ? admin.from('satellites').select('id, name').in('id', satelliteIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      admin.from('user_finance_pins').select('user_id'),
    ])

    const memberName = new Map((membersRes.data ?? []).map((m) => [m.id, m.name]))
    const satName = new Map((satellitesRes.data ?? []).map((s) => [s.id, s.name]))
    const pinSet = new Set((pinsRes.data ?? []).map((r) => r.user_id))

    // Emails live in auth.users — page through them.
    const emailById = new Map<string, string | null>()
    for (let page = 1; page <= 20; page++) {
      const { data: authPage, error: authErr } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (authErr) break
      for (const u of authPage.users) emailById.set(u.id, u.email ?? null)
      if (authPage.users.length < 200) break
    }

    return rows.map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? null,
      role: p.role as UserRole,
      satellite_id: p.satellite_id,
      satellite_name: p.satellite_id ? satName.get(p.satellite_id) ?? null : null,
      member_id: p.member_id,
      member_name: p.member_id ? memberName.get(p.member_id) ?? null : null,
      is_active: p.is_active,
      last_login_at: p.last_login_at,
      created_at: p.created_at,
      has_finance_pin: pinSet.has(p.id),
    }))
  })

// ============================================
// INVITE USER
// ============================================

const inviteSchema = z.object({
  accessToken: z.string(),
  email: z.string().email(),
  role: z.enum(ROLE_VALUES),
  satelliteId: z.string().uuid().nullable().optional(),
  ministryId: z.string().uuid().nullable().optional(),
})

export const inviteUser = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof inviteSchema>) => inviteSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()

    const email = data.email.trim().toLowerCase()
    const satelliteId = data.satelliteId ?? null
    const redirectTo = appRedirectUrl()
    // Pre-assignment carried in the invited user's metadata so onboarding can
    // prefill it. `member` role gets no satellite scope (it's not privileged).
    const inviteMeta = {
      invited_role: data.role,
      invited_satellite_id: satelliteId,
      invited_ministry_id: data.ministryId ?? null,
    }

    let userId: string
    let emailed = false
    let actionLink: string | null = null

    const existing = await findAuthUserByEmail(admin, email)
    if (existing) {
      // Existing account: (re)assign the role/satellite.
      userId = existing.id
      const { error: upErr } = await admin
        .from('user_profiles')
        .update({ role: data.role, satellite_id: satelliteId })
        .eq('id', userId)
      if (upErr) throw new Error(`Failed to update existing user: ${upErr.message}`)
    } else if (isResendConfigured()) {
      // Resend path: create the account + link (no Supabase email), then send
      // our own branded email through Resend.
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: inviteMeta, redirectTo },
      })
      if (linkErr || !link?.user) {
        throw new Error(linkErr?.message || 'Failed to create invitation')
      }
      userId = link.user.id
      const tokenHash = link.properties?.hashed_token
      // Prefer our-domain confirm link; fall back to Supabase's action_link.
      actionLink = (tokenHash && appConfirmUrl(tokenHash, 'invite')) || link.properties?.action_link || null

      if (actionLink) {
        try {
          await sendInviteEmail({
            to: email,
            inviteLink: actionLink,
            roleLabel: getRoleDisplayName(data.role),
            inviterEmail: caller.email,
          })
          emailed = true
          actionLink = null // delivered — no need to surface the raw link
        } catch {
          // Resend failed — keep actionLink so the admin can share it manually.
        }
      }

      // The signup trigger created the profile as 'member' — set the real role.
      const { error: upErr } = await admin
        .from('user_profiles')
        .update({ role: data.role, satellite_id: satelliteId })
        .eq('id', userId)
      if (upErr) throw new Error(`User created but role assignment failed: ${upErr.message}`)
    } else {
      // Supabase-email path (Resend not configured): invite by email, with a
      // generate-link fallback if the email can't be sent.
      const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: inviteMeta,
        redirectTo,
      })
      if (!invErr && inv?.user) {
        userId = inv.user.id
        emailed = true
      } else {
        const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { data: inviteMeta, redirectTo },
        })
        if (linkErr || !link?.user) {
          throw new Error(invErr?.message || linkErr?.message || 'Failed to send invitation')
        }
        userId = link.user.id
        actionLink = link.properties?.action_link ?? null
      }

      // The signup trigger created the profile as 'member' — set the real role.
      const { error: upErr } = await admin
        .from('user_profiles')
        .update({ role: data.role, satellite_id: satelliteId })
        .eq('id', userId)
      if (upErr) throw new Error(`User created but role assignment failed: ${upErr.message}`)
    }

    // Supersede any earlier pending invite for this email, then record this one.
    await admin
      .from('user_invitations')
      .update({ status: 'revoked' })
      .eq('email', email)
      .eq('status', 'pending')

    const { data: invitation, error: recErr } = await admin
      .from('user_invitations')
      .insert({
        email,
        role: data.role,
        satellite_id: satelliteId,
        invited_by: caller.userId,
        invited_user_id: userId,
        status: 'pending',
      })
      .select()
      .single()
    if (recErr) throw new Error(`Failed to record invitation: ${recErr.message}`)

    return { invitation: invitation as UserInvitation, emailed, actionLink }
  })

// ============================================
// UPDATE ROLE
// ============================================

const updateRoleSchema = z.object({
  accessToken: z.string(),
  userId: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
  satelliteId: z.string().uuid().nullable().optional(),
})

export const updateUserRole = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof updateRoleSchema>) => updateRoleSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()

    // Never allow demoting the last remaining active admin.
    if (data.role !== 'admin') {
      const { data: target } = await admin
        .from('user_profiles')
        .select('role')
        .eq('id', data.userId)
        .single()
      if (target?.role === 'admin') {
        const { count } = await admin
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('is_active', true)
        if ((count ?? 0) <= 1) throw new Error('Cannot change the role of the last active admin')
      }
    }

    const { error } = await admin
      .from('user_profiles')
      .update({ role: data.role, satellite_id: data.satelliteId ?? null })
      .eq('id', data.userId)
    if (error) throw new Error('Failed to update role')

    return { success: true }
  })

// ============================================
// ACTIVATE / DEACTIVATE
// ============================================

const setActiveSchema = z.object({
  accessToken: z.string(),
  userId: z.string().uuid(),
  isActive: z.boolean(),
})

export const setUserActive = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof setActiveSchema>) => setActiveSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await requirePermission(data.accessToken, 'users.manage')
    if (data.userId === caller.userId && !data.isActive) {
      throw new Error('You cannot deactivate your own account')
    }

    const admin = createServerAdminClient()
    if (!data.isActive) {
      const { data: target } = await admin
        .from('user_profiles')
        .select('role')
        .eq('id', data.userId)
        .single()
      if (target?.role === 'admin') {
        const { count } = await admin
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
          .eq('is_active', true)
        if ((count ?? 0) <= 1) throw new Error('Cannot deactivate the last active admin')
      }
    }

    const { error } = await admin
      .from('user_profiles')
      .update({ is_active: data.isActive })
      .eq('id', data.userId)
    if (error) throw new Error('Failed to update account status')

    return { success: true }
  })

// ============================================
// DELETE (hard-remove a user account)
// ============================================

const deleteUserSchema = z.object({
  accessToken: z.string(),
  userId: z.string().uuid(),
})

export const deleteUser = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof deleteUserSchema>) => deleteUserSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await requirePermission(data.accessToken, 'users.manage')
    if (data.userId === caller.userId) {
      throw new Error('You cannot remove your own account')
    }

    const admin = createServerAdminClient()

    // Never remove the last admin account.
    const { data: target } = await admin
      .from('user_profiles')
      .select('role')
      .eq('id', data.userId)
      .single()
    if (target?.role === 'admin') {
      const { count } = await admin
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
      if ((count ?? 0) <= 1) throw new Error('Cannot remove the last admin account')
    }

    // Delete the auth user; FK cascades remove user_profiles + user_finance_pins.
    // The linked member record (church directory data) is intentionally kept.
    const { error } = await admin.auth.admin.deleteUser(data.userId)
    if (error) throw new Error(`Failed to remove user: ${error.message}`)

    // Tidy any pending invitations for this account.
    await admin
      .from('user_invitations')
      .update({ status: 'revoked' })
      .eq('invited_user_id', data.userId)
      .eq('status', 'pending')

    return { success: true }
  })

// ============================================
// INVITATIONS
// ============================================

export const listInvitations = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }): Promise<UserInvitation[]> => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()
    const { data: rows, error } = await admin
      .from('user_invitations')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error('Failed to load invitations')
    return (rows ?? []) as UserInvitation[]
  })

const invitationIdSchema = z.object({
  accessToken: z.string(),
  invitationId: z.string().uuid(),
})

export const revokeInvitation = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof invitationIdSchema>) => invitationIdSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()

    const { data: inv } = await admin
      .from('user_invitations')
      .select('*')
      .eq('id', data.invitationId)
      .single()
    if (!inv) throw new Error('Invitation not found')

    // If never accepted, delete the pending auth user so the link can't be used.
    if (inv.status === 'pending' && inv.invited_user_id) {
      const { data: u } = await admin.auth.admin.getUserById(inv.invited_user_id)
      if (u?.user && !u.user.last_sign_in_at) {
        await admin.auth.admin.deleteUser(inv.invited_user_id)
      }
    }

    const { error } = await admin
      .from('user_invitations')
      .update({ status: 'revoked' })
      .eq('id', data.invitationId)
    if (error) throw new Error('Failed to revoke invitation')

    return { success: true }
  })

export const resendInvitation = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof invitationIdSchema>) => invitationIdSchema.parse(input))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()

    const { data: inv } = await admin
      .from('user_invitations')
      .select('*')
      .eq('id', data.invitationId)
      .single()
    if (!inv) throw new Error('Invitation not found')
    if (inv.status !== 'pending') throw new Error('Only pending invitations can be resent')

    const redirectTo = appRedirectUrl()

    // Resend path: generate a fresh sign-in link and send it via Resend.
    if (isResendConfigured()) {
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: inv.email,
        options: { redirectTo },
      })
      if (linkErr || !link) throw new Error(linkErr?.message || 'Failed to generate invite link')
      const tokenHash = link.properties?.hashed_token
      const actionLink = (tokenHash && appConfirmUrl(tokenHash, 'magiclink')) || link.properties?.action_link || null
      if (actionLink) {
        try {
          await sendInviteEmail({
            to: inv.email,
            inviteLink: actionLink,
            roleLabel: getRoleDisplayName(inv.role),
          })
          return { emailed: true, actionLink: null }
        } catch {
          return { emailed: false, actionLink }
        }
      }
      return { emailed: false, actionLink }
    }

    // Default: re-send the Supabase invite email, with a shareable link fallback.
    const { error: invErr } = await admin.auth.admin.inviteUserByEmail(inv.email, {
      data: { invited_role: inv.role },
      redirectTo,
    })
    if (!invErr) return { emailed: true, actionLink: null }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: inv.email,
      options: { redirectTo },
    })
    if (linkErr || !link) throw new Error(invErr.message)
    return { emailed: false, actionLink: link.properties?.action_link ?? null }
  })

// ============================================
// ACCEPT INVITATION (called by the invited user after first sign-in)
// ============================================

// Set the caller's own password (used by the set-password page). Done
// server-side via the admin API because the browser client's updateUser() can
// hang under this app's custom auth lock.
const setOwnPasswordSchema = z.object({
  accessToken: z.string(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const setOwnPassword = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof setOwnPasswordSchema>) => setOwnPasswordSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await getCaller(data.accessToken)
    const admin = createServerAdminClient()
    const { error } = await admin.auth.admin.updateUserById(caller.userId, { password: data.password })
    if (error) throw new Error(error.message)
    return { success: true }
  })

// Complete/create the caller's own member (directory) profile. Invited users
// have a user_profiles row but no linked member, so this creates and links one;
// existing users just get their member updated.
const completeProfileSchema = z.object({
  accessToken: z.string(),
  name: z.string().min(1, 'Name is required'),
  satelliteId: z.string().uuid('Please select a satellite'),
  ministryId: z.string().uuid('Please select a ministry'),
})

export const completeOwnProfile = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof completeProfileSchema>) => completeProfileSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await getCaller(data.accessToken)
    const admin = createServerAdminClient()

    const { data: profile } = await admin
      .from('user_profiles')
      .select('member_id, satellite_id')
      .eq('id', caller.userId)
      .single()

    const satelliteId = data.satelliteId
    const baseFields = { name: data.name, email: caller.email, satellite_id: satelliteId }

    let memberId: string

    if (profile?.member_id) {
      await admin.from('members').update(baseFields).eq('id', profile.member_id)
      memberId = profile.member_id
    } else {
      // Link to an existing member with the same email if one exists.
      let existingId: string | null = null
      if (caller.email) {
        const { data: existing } = await admin
          .from('members')
          .select('id')
          .eq('email', caller.email)
          .maybeSingle()
        existingId = existing?.id ?? null
      }

      if (existingId) {
        await admin.from('members').update(baseFields).eq('id', existingId)
        memberId = existingId
      } else {
        const { data: created, error: createErr } = await admin
          .from('members')
          .insert({ ...baseFields, city: '', discipleship_stage: 'Newbie', membership_status: 'active' })
          .select('id')
          .single()
        if (createErr) throw new Error(createErr.message)
        memberId = created.id
      }
      await admin.from('user_profiles').update({ member_id: memberId }).eq('id', caller.userId)
    }

    // Keep the account's satellite scope in sync with the chosen satellite.
    await admin.from('user_profiles').update({ satellite_id: satelliteId }).eq('id', caller.userId)

    // Link the chosen ministry (idempotent).
    await admin
      .from('member_ministries')
      .upsert(
        { member_id: memberId, ministry_id: data.ministryId, role: 'volunteer', is_active: true },
        { onConflict: 'member_id,ministry_id' },
      )

    return { success: true, memberId }
  })

export const acceptInvitation = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await getCaller(data.accessToken)
    const admin = createServerAdminClient()
    const email = (caller.email ?? '').toLowerCase()
    if (!email) return { success: false }

    const now = new Date().toISOString()
    await admin
      .from('user_invitations')
      .update({ status: 'accepted', accepted_at: now, invited_user_id: caller.userId })
      .eq('email', email)
      .eq('status', 'pending')
    await admin.from('user_profiles').update({ last_login_at: now }).eq('id', caller.userId)

    return { success: true }
  })

// ============================================
// ACCOUNT <-> MEMBER LINKING (admin)
// ============================================
//
// Rollout context: member records were imported first (with giving/income tagged
// to them via financial_transactions.member_id). Members now sign up, and each new
// account must be matched to its pre-existing member record so the member's own
// data (giving statement, attendance, etc.) resolves correctly. Signup only
// auto-links by exact email; when the emails differ an admin links here.

export interface LinkableMember {
  id: string
  name: string
  email: string | null
  satellite_name: string | null
  giving_total: number
  already_linked: boolean
}

const searchLinkableMembersSchema = z.object({
  accessToken: z.string(),
  query: z.string().min(1, 'Enter a name or email to search').max(100),
  limit: z.number().int().min(1).max(25).optional(),
})

/**
 * Search existing member records to link an account to. Returns each candidate
 * with their recorded giving total and whether an account already links to them,
 * so the admin can confidently pick the right pre-existing record.
 */
export const searchLinkableMembers = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof searchLinkableMembersSchema>) =>
    searchLinkableMembersSchema.parse(input),
  )
  .handler(async ({ data }): Promise<LinkableMember[]> => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()
    const term = data.query.trim()

    const { data: rows, error } = await admin
      .from('members')
      .select('id, name, email, satellite:satellites!members_satellite_id_fkey(name)')
      .eq('is_archived', false)
      .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
      .order('name')
      .limit(data.limit ?? 10)
    if (error) {
      console.error('Error searching linkable members:', error)
      throw new Error('Failed to search members')
    }

    const members = (rows ?? []) as unknown as {
      id: string
      name: string
      email: string | null
      satellite: { name: string } | null
    }[]
    const ids = members.map((m) => m.id)
    if (ids.length === 0) return []

    // Giving totals (income only) + existing account links, in parallel.
    const [txRes, linkRes] = await Promise.all([
      admin
        .from('financial_transactions')
        .select('member_id, amount')
        .eq('transaction_type', 'income')
        .in('member_id', ids),
      admin.from('user_profiles').select('member_id').in('member_id', ids),
    ])

    const givingByMember = new Map<string, number>()
    for (const t of (txRes.data ?? []) as unknown as { member_id: string; amount: number | string }[]) {
      givingByMember.set(t.member_id, (givingByMember.get(t.member_id) ?? 0) + Number(t.amount))
    }
    const linkedSet = new Set(
      ((linkRes.data ?? []) as unknown as { member_id: string | null }[])
        .map((l) => l.member_id)
        .filter((v): v is string => Boolean(v)),
    )

    return members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      satellite_name: m.satellite?.name ?? null,
      giving_total: givingByMember.get(m.id) ?? 0,
      already_linked: linkedSet.has(m.id),
    }))
  })

const linkAccountSchema = z.object({
  accessToken: z.string(),
  userId: z.string().uuid(),
  // null unlinks the account from any member.
  memberId: z.string().uuid().nullable(),
})

/**
 * Link (or, with memberId=null, unlink) an account to an existing member record.
 * Enforces a 1:1 relationship — a member record may back at most one account.
 */
export const linkAccountToMember = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof linkAccountSchema>) => linkAccountSchema.parse(input))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()

    if (data.memberId) {
      const { data: member } = await admin
        .from('members')
        .select('id')
        .eq('id', data.memberId)
        .maybeSingle()
      if (!member) throw new Error('That member record no longer exists')

      // Enforce 1:1 — reject if a different account already links to this member.
      const { data: others } = await admin
        .from('user_profiles')
        .select('id')
        .eq('member_id', data.memberId)
        .neq('id', data.userId)
      if (others && others.length > 0) {
        throw new Error('Another account is already linked to that member record')
      }
    }

    const { error } = await admin
      .from('user_profiles')
      .update({ member_id: data.memberId })
      .eq('id', data.userId)
    if (error) {
      console.error('Error linking account to member:', error)
      throw new Error('Failed to update the account link')
    }

    return { success: true }
  })
