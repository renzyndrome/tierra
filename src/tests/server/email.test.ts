import { describe, it, expect, afterEach } from 'vitest'
import {
  buildInviteEmailHtml,
  buildInviteEmailText,
  inviteEmailSubject,
  isResendConfigured,
} from '../../server/email'

describe('buildInviteEmailHtml', () => {
  it('includes the invite link and role', () => {
    const html = buildInviteEmailHtml({
      to: 'p@example.com',
      inviteLink: 'https://app.example/auth/callback?token=abc',
      roleLabel: 'Finance',
    })
    expect(html).toContain('https://app.example/auth/callback?token=abc')
    expect(html).toContain('Finance')
    expect(html).toContain('Accept invitation')
  })

  it('escapes HTML in the role label', () => {
    const html = buildInviteEmailHtml({
      to: 'p@example.com',
      inviteLink: 'https://x/y',
      roleLabel: '<script>x</script>',
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('mentions the inviter when provided', () => {
    const html = buildInviteEmailHtml({
      to: 'p@example.com',
      inviteLink: 'https://x/y',
      roleLabel: 'Member',
      inviterEmail: 'admin@example.org',
    })
    expect(html).toContain('admin@example.org')
  })
})

describe('claim variant', () => {
  const base = {
    to: 'p@example.com',
    inviteLink: 'https://app.example/auth/confirm?token_hash=abc&type=invite',
    roleLabel: 'Member',
    variant: 'claim' as const,
    groupName: 'CG - Maria Santos',
  }

  it('uses confirm-your-email copy instead of invite copy', () => {
    const html = buildInviteEmailHtml(base)
    expect(html).toContain('Confirm your email')
    expect(html).toContain('CG - Maria Santos')
    expect(html).toContain('Confirm email')
    // must NOT imply an admin invited them
    expect(html).not.toContain("You've been invited")
    expect(html).not.toContain('Accept invitation')
  })

  it('uses claim copy in the plain-text part too', () => {
    const text = buildInviteEmailText(base)
    expect(text).toContain('You signed up to join CG - Maria Santos')
    expect(text).toContain(base.inviteLink)
    expect(text).not.toContain("You've been invited")
  })

  it('omits the circle name when there is none', () => {
    const html = buildInviteEmailHtml({ ...base, groupName: null })
    expect(html).toContain('You signed up at Quest Laguna')
  })

  it('escapes HTML in the circle name', () => {
    const html = buildInviteEmailHtml({ ...base, groupName: '<script>x</script>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('picks the subject line per variant', () => {
    expect(inviteEmailSubject('claim')).toBe('Confirm your Quest Laguna account')
    expect(inviteEmailSubject('invite')).toBe("You've been invited to Quest Laguna")
    expect(inviteEmailSubject(undefined)).toBe("You've been invited to Quest Laguna")
  })
})

describe('isResendConfigured', () => {
  const original = process.env.RESEND_API_KEY
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = original
  })

  it('is false without a key and true with one', () => {
    delete process.env.RESEND_API_KEY
    expect(isResendConfigured()).toBe(false)
    process.env.RESEND_API_KEY = 're_test'
    expect(isResendConfigured()).toBe(true)
  })
})
