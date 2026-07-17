import { describe, it, expect, afterEach } from 'vitest'
import { buildInviteEmailHtml, isResendConfigured } from '../../server/email'

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
