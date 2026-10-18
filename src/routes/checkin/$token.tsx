// Public service check-in page — the QR target: /checkin/<qr_token>
// Mobile-first, neutral church branding (no admin chrome). Two flows:
//   * Signed-in user with a linked member profile -> one-tap self check-in.
//   * Guest -> types name (+ optional email and "who invited you?"); matching is
//     invisible. The email is a matching hint for staff and the address for a
//     later account invite.
// After check-in: a welcome to the service, then (when the session has a
// prophetic prompt or word list) one prophetic word. The welcome and the word
// fill the first screen; saving the word as an image sits one scroll below.

import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { StoryShare } from '../../components/StoryShare'
import { useAuth } from '../../components/AuthProvider'
import { getCheckinSession, publicCheckIn } from '../../server/functions/attendance'
import { checkinFormSchema } from '../../lib/validations'
import { CHURCH_NAME, LOGO_PATH } from '../../lib/constants'
import type { CheckinResult } from '../../lib/types'
import type { PropheticWord } from '../../lib/propheticWord'

export const Route = createFileRoute('/checkin/$token')({
  component: CheckinPage,
})

interface SessionInfo {
  sessionId: string
  serviceName: string
  sessionDate: string
  satelliteName: string | null
  title: string | null
  isOpen: boolean
}

function formatSessionDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function CheckinPage() {
  const { token } = Route.useParams()
  const { session, profile, isLoading: authLoading } = useAuth()
  const accessToken = session?.access_token
  const isLinkedMember = Boolean(profile?.member_id)

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [name, setName] = useState('')
  const [invitedBy, setInvitedBy] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CheckinResult | null>(null)

  const loadSession = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCheckinSession({ data: { qrToken: token } })
      setInfo(data)
    } catch {
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const submitGuest = async () => {
    setFormError('')
    const parsed = checkinFormSchema.safeParse({ name, invitedBy, email })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Please check your details')
      return
    }
    setSubmitting(true)
    try {
      const res = await publicCheckIn({
        data: {
          qrToken: token,
          name: parsed.data.name,
          email: parsed.data.email || null,
          invitedBy: parsed.data.invitedBy || null,
        },
      })
      setResult(res)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not check you in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const submitSelf = async () => {
    setFormError('')
    setSubmitting(true)
    try {
      const res = await publicCheckIn({ data: { qrToken: token, accessToken } })
      setResult(res)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not check you in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result && info && result.propheticWord) {
    return <WordScreen result={result} word={result.propheticWord} serviceName={info.serviceName} />
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#6B0F2B] px-4 py-10">
      <div className="w-full max-w-md">
        <Brand />

        {result && info ? (
          <CheckedInLine result={result} serviceName={info.serviceName} large />
        ) : (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            {loading || authLoading ? (
              <div className="p-10 text-center">
                <div className="w-10 h-10 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Loading…</p>
              </div>
            ) : !info ? (
              <StateMessage
                tone="error"
                title="Invalid check-in link"
                message="This QR code doesn't match an active service. Please ask a volunteer for help."
              />
            ) : !info.isOpen ? (
              <StateMessage
                tone="error"
                title="Check-in is closed"
                message={`Check-in for ${info.serviceName} is now closed. See you next time!`}
              />
            ) : (
              <div className="p-6">
                {/* Service header */}
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold text-[#8B1538]">{info.serviceName}</h1>
                  {info.title && <p className="text-gray-500 mt-1">{info.title}</p>}
                  <p className="text-gray-600 mt-1 text-sm">{formatSessionDate(info.sessionDate)}</p>
                  {info.satelliteName && (
                    <span className="inline-block mt-2 px-3 py-1 bg-[#F8B4B4]/30 text-[#8B1538] rounded-full text-xs font-medium">
                      {info.satelliteName}
                    </span>
                  )}
                </div>

                {isLinkedMember ? (
                  <div className="space-y-4">
                    <p className="text-center text-gray-700">
                      You're signed in. Tap below to mark your attendance.
                    </p>
                    <button
                      onClick={submitSelf}
                      disabled={submitting}
                      className="w-full py-4 bg-[#8B1538] hover:bg-[#6B0F2B] disabled:opacity-60 text-white rounded-xl font-semibold text-lg transition-colors"
                    >
                      {submitting ? 'Checking in…' : "I'm here — Check in"}
                    </button>
                    <p className="text-center text-xs text-gray-400">Not you? Use the form below instead.</p>
                    <GuestForm
                      name={name}
                      invitedBy={invitedBy}
                      email={email}
                      setName={setName}
                      setInvitedBy={setInvitedBy}
                      setEmail={setEmail}
                      onSubmit={submitGuest}
                      submitting={submitting}
                    />
                  </div>
                ) : (
                  <GuestForm
                    name={name}
                    invitedBy={invitedBy}
                    email={email}
                    setName={setName}
                    setInvitedBy={setInvitedBy}
                    setEmail={setEmail}
                    onSubmit={submitGuest}
                    submitting={submitting}
                  />
                )}

                {formError && (
                  <p role="alert" className="mt-4 text-center text-sm text-red-600">
                    {formError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <SiteFooter />
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex flex-col items-center mb-6">
      <img src={LOGO_PATH} alt={CHURCH_NAME} className="w-16 h-16 rounded-full object-cover mb-3 ring-2 ring-white/20" />
      <p className="text-[#F8B4B4] text-sm tracking-wide uppercase">{CHURCH_NAME}</p>
    </div>
  )
}

function SiteFooter() {
  return (
    <>
      <p className="text-center text-white/40 text-xs mt-6">Quest Laguna · Service Attendance</p>
      <a
        href="https://questlaguna.org"
        target="_blank"
        rel="noopener"
        className="mt-1 block text-center text-xs font-medium text-[#F8B4B4]/80 hover:text-[#F8B4B4]"
      >
        questlaguna.org
      </a>
    </>
  )
}

interface GuestFormProps {
  name: string
  invitedBy: string
  email: string
  setName: (v: string) => void
  setInvitedBy: (v: string) => void
  setEmail: (v: string) => void
  onSubmit: () => void
  submitting: boolean
}

function GuestForm({
  name,
  invitedBy,
  email,
  setName,
  setInvitedBy,
  setEmail,
  onSubmit,
  submitting,
}: GuestFormProps) {
  const emailRef = useRef<HTMLInputElement>(null)
  const invitedRef = useRef<HTMLInputElement>(null)
  // The phone keyboard's "next" key moves to the next field instead of sending
  // the form half filled (iOS submits a form on return).
  const nextOnEnter = (next: React.RefObject<HTMLInputElement | null>) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    next.current?.focus()
  }
  const field =
    'w-full px-4 py-3 text-base border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="space-y-4"
    >
      <div>
        <label htmlFor="checkin-name" className="block text-sm font-medium text-gray-700 mb-1">
          Your name
        </label>
        <input
          id="checkin-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          autoComplete="name"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          onKeyDown={nextOnEnter(emailRef)}
          aria-describedby="checkin-name-hint"
          className={field}
        />
        <p id="checkin-name-hint" className="mt-1 text-xs text-gray-400">First and last name. No nicknames or initials.</p>
      </div>
      <div>
        <label htmlFor="checkin-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          ref={emailRef}
          id="checkin-email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          onKeyDown={nextOnEnter(invitedRef)}
          aria-describedby="checkin-email-hint"
          className={field}
        />
        <p id="checkin-email-hint" className="mt-1 text-xs text-gray-400">For a church account setup soon.</p>
      </div>
      <div>
        <label htmlFor="checkin-invited-by" className="block text-sm font-medium text-gray-700 mb-1">
          Who invited you? <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          ref={invitedRef}
          id="checkin-invited-by"
          type="text"
          value={invitedBy}
          onChange={(e) => setInvitedBy(e.target.value)}
          placeholder="Name of the person who invited you"
          autoComplete="off"
          autoCapitalize="words"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className={field}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 bg-[#8B1538] hover:bg-[#6B0F2B] disabled:opacity-60 text-white rounded-xl font-semibold text-lg transition-colors"
      >
        {submitting ? 'Checking in…' : 'Check in'}
      </button>
    </form>
  )
}

// The prophetic word is the moment this screen exists for; the check-in itself
// is confirmed in one compact line above it. Both sit on the page background,
// no white card.
const WORD_FONT = { fontFamily: "'Source Serif 4 Variable', ui-serif, Georgia, serif" }

function CheckedInLine({ result, serviceName, large }: { result: CheckinResult; serviceName: string; large: boolean }) {
  const already = result.status === 'already_checked_in'
  return (
    <div role="status" className="text-center text-white">
      <div className="inline-flex items-center gap-2.5 rounded-full bg-white/10 py-1.5 pl-1.5 pr-4 ring-1 ring-white/15">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-[#1A0A0E]">
          <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
        </span>
        <span className="text-sm font-semibold">{already ? 'Attendance already recorded' : 'Checked in'}</span>
      </div>
      <h2
        className={`mt-5 font-bold tracking-[-0.01em] text-balance ${large ? 'text-3xl' : 'text-[22px] leading-snug'}`}
      >
        Welcome to {serviceName}
      </h2>
      {result.displayName && (
        <p className={`mt-1 font-semibold text-[#F8B4B4] ${large ? 'text-lg' : 'text-base'}`}>{result.displayName}</p>
      )}
    </div>
  )
}

// Long verses step down in size so the welcome and the whole word still fit
// the first screen of a phone.
function wordSizeClass(text: string): string {
  if (text.length > 220) return 'text-[21px] leading-[1.35]'
  if (text.length > 140) return 'text-[24px] leading-[1.32]'
  return 'text-[28px] leading-[1.3]'
}

function WordScreen({ result, word, serviceName }: { result: CheckinResult; word: PropheticWord; serviceName: string }) {
  const saveSection = useRef<HTMLDivElement>(null)
  const longWord = word.text.length > 220
  const story = useMemo(
    () => ({ text: word.text, reference: word.reference, translation: word.translation, serviceName }),
    [word, serviceName],
  )
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#6B0F2B] px-4">
      <div className="mx-auto w-full max-w-md">
        {/* First screen: welcome and word only. The "Save this word" line at
            its foot heads the image section just below. */}
        <section className="flex min-h-svh flex-col pt-6">
          <div className="flex flex-1 flex-col justify-center">
            <Brand />
            <CheckedInLine result={result} serviceName={serviceName} large={false} />
            <figure className={`word-reveal px-1 text-center ${longWord ? 'mt-4' : 'mt-6'}`}>
              <span aria-hidden style={WORD_FONT} className="block h-8 text-[56px] leading-none text-[#F8B4B4]/45">
                &ldquo;
              </span>
              <blockquote style={WORD_FONT} className={`text-[#FFF4F2] text-balance ${wordSizeClass(word.text)}`}>
                {word.text}
              </blockquote>
              <figcaption className={`flex items-center justify-center gap-3 ${longWord ? 'mt-5' : 'mt-8'}`}>
                <span className="h-px w-10 bg-[#F8B4B4]/35" aria-hidden />
                <span className="text-sm font-semibold tracking-wide text-[#F8B4B4]">
                  {word.reference}
                  {word.translation && <span className="ml-1.5 font-normal text-white/60">{word.translation}</span>}
                </span>
                <span className="h-px w-10 bg-[#F8B4B4]/35" aria-hidden />
              </figcaption>
              <p className="mt-2 text-xs text-white/60">Prophetic word</p>
            </figure>
          </div>
          <button
            type="button"
            onClick={() => saveSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="mx-auto mb-3 mt-6 flex flex-col items-center gap-0.5 px-4 py-2 text-xs font-medium text-white/55 hover:text-white/80"
          >
            Save this word
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </section>
        <div ref={saveSection} className="scroll-mt-16 pt-2">
          <StoryShare content={story} logoSrc={LOGO_PATH} />
        </div>
        <div className="pb-10 pt-4">
          <SiteFooter />
        </div>
      </div>
    </div>
  )
}

function StateMessage({
  tone,
  title,
  message,
}: {
  tone: 'error' | 'info'
  title: string
  message: string
}) {
  return (
    <div className="p-8 text-center">
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
          tone === 'error' ? 'bg-red-100' : 'bg-blue-100'
        }`}
      >
        <svg
          className={`w-8 h-8 ${tone === 'error' ? 'text-red-600' : 'text-blue-600'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <p className="text-gray-600 mt-2">{message}</p>
    </div>
  )
}
