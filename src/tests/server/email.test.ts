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
    recipientName: 'Juan Cruz',
  }

  it('follows the house email format in HTML', () => {
    const html = buildInviteEmailHtml(base)
    expect(html).toContain('Hello Juan Cruz,')
    expect(html).toContain('Sign-up received for <strong>CG - Maria Santos</strong>.')
    expect(html).toContain('Confirm email')
    expect(html).toContain('Single use. Time-limited.')
    expect(html).not.toContain('Accept invitation')
  })

  it('follows the house email format in plain text, link on its own line', () => {
    const lines = buildInviteEmailText(base).split('\n')
    expect(lines[0]).toBe('Hello Juan Cruz,')
    expect(lines).toContain('Sign-up received for CG - Maria Santos.')
    const labelAt = lines.indexOf('Confirm email:')
    expect(labelAt).toBeGreaterThan(-1)
    expect(lines[labelAt + 1]).toBe(base.inviteLink)
    expect(lines).toContain('Single use. Time-limited.')
    expect(lines[lines.length - 1]).toBe('Quest Laguna')
  })

  it('uses no second person, no please, no thank you, no em dash', () => {
    for (const out of [buildInviteEmailHtml(base), buildInviteEmailText(base)]) {
      const text = out.replace(/<[^>]+>/g, ' ')
      expect(text).not.toMatch(/\b(you|your|we|our|please)\b/i)
      expect(text).not.toMatch(/thank you/i)
      expect(text).not.toContain('\u2014')
    }
  })

  it('falls back when name or circle is missing', () => {
    const html = buildInviteEmailHtml({ ...base, groupName: null, recipientName: null })
    expect(html).toContain('Hello,')
    expect(html).toContain('Sign-up received.')
  })

  it('escapes HTML in the name and circle', () => {
    const html = buildInviteEmailHtml({
      ...base,
      groupName: '<script>x</script>',
      recipientName: '<b>y</b>',
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).not.toContain('<b>y</b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('picks the subject line per variant', () => {
    expect(inviteEmailSubject('claim')).toBe('Quest Laguna account confirmation')
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
