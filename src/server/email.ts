// Resend email integration — server-only.
//
// Opt-in: only used when RESEND_API_KEY is set. Uses the Resend REST API via
// fetch (no SDK dependency). Configure:
//   RESEND_API_KEY   — your Resend API key
//   RESEND_FROM      — verified sender, e.g. "Quest Laguna <noreply@your-domain>"
//                      (defaults to Resend's onboarding@resend.dev test sender)

export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

export interface InviteEmailParams {
  to: string
  inviteLink: string
  roleLabel: string
  inviterEmail?: string | null
  /**
   * 'invite'  — an admin invited a staff/leader account (default).
   * 'claim'   — someone signed up through a Quest Circle QR to claim their own
   *             member record; the copy must not imply an admin invited them.
   */
  variant?: 'invite' | 'claim'
  /** Circle name, shown in the claim variant. */
  groupName?: string | null
  /** Name for the greeting line, used by the claim variant. */
  recipientName?: string | null
}

/** Subject line for an email variant. */
export function inviteEmailSubject(variant: InviteEmailParams['variant']): string {
  return variant === 'claim'
    ? 'Quest Laguna account confirmation'
    : "You've been invited to Quest Laguna"
}

const BRAND = '#8B1538'

/**
 * Build the branded invite email HTML. Pure function — unit-testable.
 */
export function buildInviteEmailHtml(params: InviteEmailParams): string {
  if (params.variant === 'claim') return buildClaimEmailHtml(params)
  const { inviteLink, roleLabel, inviterEmail } = params
  const invitedBy = inviterEmail ? `by ${escapeHtml(inviterEmail)}` : ''
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <div style="background:${BRAND};padding:24px 28px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;">Quest Laguna</h1>
        </div>
        <div style="padding:28px;">
          <h2 style="margin:0 0 12px;font-size:22px;">You've been invited</h2>
          <p style="margin:0 0 16px;line-height:1.5;color:#444;">
            You've been invited ${invitedBy} to join the Quest Laguna directory as
            <strong>${escapeHtml(roleLabel)}</strong>. Click below to set your password and sign in.
          </p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${escapeAttr(inviteLink)}"
               style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;">
              Accept invitation
            </a>
          </p>
          <p style="margin:0;font-size:12px;color:#888;line-height:1.5;">
            If the button doesn't work, copy this link into your browser:<br />
            <span style="word-break:break-all;color:${BRAND};">${escapeHtml(inviteLink)}</span>
          </p>
        </div>
      </div>
      <p style="text-align:center;color:#aaa;font-size:11px;margin-top:16px;">
        If you weren't expecting this invitation, you can ignore this email.
      </p>
    </div>
  </body>
</html>`
}

/**
 * Claim-variant email (Quest Circle QR sign-up). Follows the house email
 * format: greeting, one fragment on what happened, the link on its own line
 * under a label, one fragment on limits, sign-off name.
 */
export function buildClaimEmailHtml({ inviteLink, groupName, recipientName }: InviteEmailParams): string {
  const greeting = recipientName ? `Hello ${escapeHtml(recipientName)},` : 'Hello,'
  const what = groupName
    ? `Sign-up received for <strong>${escapeHtml(groupName)}</strong>.`
    : 'Sign-up received.'
  const p = 'margin:0 0 16px;line-height:1.5;color:#444;'
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <div style="background:${BRAND};padding:24px 28px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;">Quest Laguna</h1>
        </div>
        <div style="padding:28px;">
          <p style="${p}">${greeting}</p>
          <p style="${p}">${what}</p>
          <p style="margin:24px 0 8px;text-align:center;">
            <a href="${escapeAttr(inviteLink)}"
               style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:bold;">
              Confirm email
            </a>
          </p>
          <p style="margin:0 0 16px;font-size:12px;color:#888;line-height:1.5;">
            Confirmation link:<br />
            <span style="word-break:break-all;color:${BRAND};">${escapeHtml(inviteLink)}</span>
          </p>
          <p style="${p}">Single use. Time-limited.</p>
          <p style="margin:0;line-height:1.5;color:#444;">Quest Laguna</p>
        </div>
      </div>
    </div>
  </body>
</html>`
}

/**
 * Plain-text alternative of the invite email. Including a text part alongside
 * the HTML improves deliverability (multipart scores better than HTML-only).
 */
export function buildInviteEmailText(params: InviteEmailParams): string {
  const { inviteLink, roleLabel, inviterEmail, variant, groupName } = params
  if (variant === 'claim') {
    return [
      params.recipientName ? `Hello ${params.recipientName},` : 'Hello,',
      '',
      groupName ? `Sign-up received for ${groupName}.` : 'Sign-up received.',
      '',
      'Confirm email:',
      inviteLink,
      '',
      'Single use. Time-limited.',
      '',
      'Quest Laguna',
    ].join('\n')
  }
  const by = inviterEmail ? ` by ${inviterEmail}` : ''
  return [
    `You've been invited${by} to join the Quest Laguna directory as ${roleLabel}.`,
    '',
    'Accept your invitation and set your password:',
    inviteLink,
    '',
    "If you weren't expecting this invitation, you can ignore this email.",
  ].join('\n')
}

/**
 * Send the invite email through Resend. Throws on non-2xx.
 */
export async function sendInviteEmail(params: InviteEmailParams): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')
  const from = process.env.RESEND_FROM || 'Quest Laguna <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: inviteEmailSubject(params.variant),
      html: buildInviteEmailHtml(params),
      text: buildInviteEmailText(params),
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend send failed (${res.status}): ${detail}`)
  }
  return res.json() as Promise<{ id: string }>
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;')
}
