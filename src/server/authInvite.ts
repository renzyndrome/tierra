// Shared auth-invite plumbing — server-only.
//
// Creating an account server-side (rather than via client signUp) is the only
// way in this app: Supabase "Allow new users to sign up" is OFF by design
// (DEPLOY.md), so both the admin invite flow and the member-claim sign-up go
// through the admin API here.
//
// This mirrors the proven branching in src/server/functions/users.ts:inviteUser
// so the claim flow inherits the same fallbacks:
//   1. Resend configured -> generateLink('invite') + our own branded email,
//      with an on-domain /auth/confirm link (no *.supabase.co URLs in email).
//   2. Otherwise -> Supabase's inviteUserByEmail, falling back to generateLink
//      and returning a shareable link the caller can pass on manually.

import { createServerAdminClient } from '../lib/supabase'
import { isResendConfigured, sendInviteEmail, type InviteEmailParams } from './email'

type AdminClient = ReturnType<typeof createServerAdminClient>

export function appBaseUrl(): string | undefined {
  const base = process.env.APP_URL || process.env.VITE_APP_URL
  return base ? base.replace(/\/$/, '') : undefined
}

/** Fallback redirect embedded in the Supabase-hosted verify link. */
export function appRedirectUrl(): string | undefined {
  const base = appBaseUrl()
  return base ? `${base}/auth/callback` : undefined
}

/**
 * Our-domain confirmation link — the token is verified by verifyOtp on our own
 * /auth/confirm page, so emails never expose the raw Supabase URL.
 */
export function appConfirmUrl(tokenHash: string, type: string): string | null {
  const base = appBaseUrl()
  if (!base) return null
  return `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`
}

/** Scan the (paginated) auth user list for a matching email. */
export async function findAuthUserByEmail(admin: AdminClient, email: string) {
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

export interface CreateInvitedUserParams {
  email: string
  /** Written to the auth user's user_metadata (readable client-side later). */
  metadata: Record<string, unknown>
  /** Email copy; `to` and `inviteLink` are filled in here. */
  email_params: Omit<InviteEmailParams, 'to' | 'inviteLink'>
}

export interface CreateInvitedUserResult {
  userId: string
  /** True when a confirmation email actually went out. */
  emailed: boolean
  /** Set only when the email could not be sent — share it manually. */
  actionLink: string | null
}

/**
 * Create a new auth account and send it a confirmation link.
 * Throws if the email already has an account — callers must check first and
 * decide what that means in their flow.
 */
export async function createInvitedAuthUser(
  admin: AdminClient,
  { email, metadata, email_params }: CreateInvitedUserParams,
): Promise<CreateInvitedUserResult> {
  const redirectTo = appRedirectUrl()

  if (isResendConfigured()) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { data: metadata, redirectTo },
    })
    if (linkErr || !link?.user) {
      throw new Error(linkErr?.message || 'Account creation failed.')
    }
    const tokenHash = link.properties?.hashed_token
    let actionLink =
      (tokenHash && appConfirmUrl(tokenHash, 'invite')) || link.properties?.action_link || null

    if (actionLink) {
      try {
        await sendInviteEmail({ ...email_params, to: email, inviteLink: actionLink })
        return { userId: link.user.id, emailed: true, actionLink: null }
      } catch {
        // Resend failed — the account exists, so surface the link instead.
      }
    }
    return { userId: link.user.id, emailed: false, actionLink }
  }

  // Supabase-email path.
  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo,
  })
  if (!invErr && inv?.user) {
    return { userId: inv.user.id, emailed: true, actionLink: null }
  }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { data: metadata, redirectTo },
  })
  if (linkErr || !link?.user) {
    throw new Error(invErr?.message || linkErr?.message || 'Confirmation email failed.')
  }
  return { userId: link.user.id, emailed: false, actionLink: link.properties?.action_link ?? null }
}

/**
 * Send a fresh confirmation link to an account that already exists but has
 * never signed in (e.g. the first email expired or was lost).
 */
export async function resendConfirmLink(
  admin: AdminClient,
  email: string,
  email_params: Omit<InviteEmailParams, 'to' | 'inviteLink'>,
): Promise<{ emailed: boolean; actionLink: string | null }> {
  const redirectTo = appRedirectUrl()

  if (isResendConfigured()) {
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    })
    if (linkErr || !link) throw new Error(linkErr?.message || 'Link generation failed.')
    const tokenHash = link.properties?.hashed_token
    const actionLink =
      (tokenHash && appConfirmUrl(tokenHash, 'magiclink')) || link.properties?.action_link || null
    if (actionLink) {
      try {
        await sendInviteEmail({ ...email_params, to: email, inviteLink: actionLink })
        return { emailed: true, actionLink: null }
      } catch {
        return { emailed: false, actionLink }
      }
    }
    return { emailed: false, actionLink }
  }

  const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (!invErr) return { emailed: true, actionLink: null }

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  })
  if (linkErr || !link) throw new Error(invErr.message)
  return { emailed: false, actionLink: link.properties?.action_link ?? null }
}
