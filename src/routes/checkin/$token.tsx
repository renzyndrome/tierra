// Public service check-in page — the QR target: /checkin/<qr_token>
// Mobile-first, branded (no admin chrome). Two flows:
//   * Signed-in user with a linked member profile -> one-tap self check-in.
//   * Guest -> types name (+ optional phone); backend matching is invisible here.

import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { getCheckinSession, publicCheckIn } from '../../server/functions/attendance'
import { checkinFormSchema } from '../../lib/validations'
import { EVENT_NAME, LOGO_PATH } from '../../lib/constants'
import type { CheckinResult } from '../../lib/types'

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
  const [phone, setPhone] = useState('')
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
    const parsed = checkinFormSchema.safeParse({ name, phone })
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Please check your details')
      return
    }
    setSubmitting(true)
    try {
      const res = await publicCheckIn({
        data: { qrToken: token, name: parsed.data.name, phone: parsed.data.phone || null },
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#6B0F2B] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src={LOGO_PATH} alt="Quest Laguna" className="w-16 h-16 rounded-full object-cover mb-3 ring-2 ring-white/20" />
          <p className="text-[#F8B4B4] text-sm tracking-wide uppercase">{EVENT_NAME}</p>
        </div>

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
          ) : !info.isOpen && !result ? (
            <StateMessage
              tone="error"
              title="Check-in is closed"
              message={`Check-in for ${info.serviceName} is now closed. See you next time!`}
            />
          ) : result ? (
            <SuccessState result={result} serviceName={info.serviceName} />
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
                    phone={phone}
                    setName={setName}
                    setPhone={setPhone}
                    onSubmit={submitGuest}
                    submitting={submitting}
                  />
                </div>
              ) : (
                <GuestForm
                  name={name}
                  phone={phone}
                  setName={setName}
                  setPhone={setPhone}
                  onSubmit={submitGuest}
                  submitting={submitting}
                />
              )}

              {formError && <p className="mt-4 text-center text-sm text-red-600">{formError}</p>}
            </div>
          )}
        </div>

        <p className="text-center text-white/40 text-xs mt-6">Quest Laguna · Service Attendance</p>
      </div>
    </div>
  )
}

interface GuestFormProps {
  name: string
  phone: string
  setName: (v: string) => void
  setPhone: (v: string) => void
  onSubmit: () => void
  submitting: boolean
}

function GuestForm({ name, phone, setName, setPhone, onSubmit, submitting }: GuestFormProps) {
  return (
    <form
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
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
        />
      </div>
      <div>
        <label htmlFor="checkin-phone" className="block text-sm font-medium text-gray-700 mb-1">
          Mobile number <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="checkin-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="09xx xxx xxxx"
          autoComplete="tel"
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
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

function SuccessState({ result, serviceName }: { result: CheckinResult; serviceName: string }) {
  const already = result.status === 'already_checked_in'
  return (
    <div className="p-8 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-11 h-11 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">
        {already ? "You're already checked in" : "You're checked in!"}
      </h2>
      {result.displayName && (
        <p className="text-lg text-[#8B1538] font-semibold mt-1">{result.displayName}</p>
      )}
      <p className="text-gray-600 mt-3">
        {already
          ? `We already have your attendance for ${serviceName}.`
          : `Thanks for joining ${serviceName}. Enjoy the service! 🙌`}
      </p>
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
