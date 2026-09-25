// Public "claim your member record" sign-up — the QR target: /join/<signup_token>
//
// Pilot migration: members already exist in the directory but have no login.
// A circle leader shows this QR; the disciple fills in enough detail for the
// backend to find their EXISTING record. Nothing here reveals whether a match
// was found — the confirmation screen is identical either way.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { getSignupGroup, submitClaimSignup } from '../../server/functions/memberClaims'
import { CHURCH_NAME, LOGO_PATH } from '../../lib/constants'

export const Route = createFileRoute('/join/$token')({
  component: JoinPage,
})

interface GroupInfo {
  groupName: string
  satelliteName: string | null
}

function JoinPage() {
  const { token } = Route.useParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<GroupInfo | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [birthday, setBirthday] = useState('')
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<{ emailed: boolean; resent: boolean } | null>(null)

  const loadGroup = useCallback(async () => {
    setLoading(true)
    try {
      setInfo(await getSignupGroup({ data: { token } }))
    } catch {
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  const submit = async () => {
    setFormError('')
    if (name.trim().length < 2) {
      setFormError('Full name required.')
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setFormError('Email address invalid.')
      return
    }
    setSubmitting(true)
    try {
      const res = await submitClaimSignup({
        data: {
          token,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          birthday: birthday || null,
        },
      })
      setDone(res)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-up failed. Retry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#6B0F2B] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img
            src={LOGO_PATH}
            alt={CHURCH_NAME}
            className="w-16 h-16 rounded-full object-cover mb-3 ring-2 ring-white/20"
          />
          <p className="text-[#F8B4B4] text-sm tracking-wide uppercase">{CHURCH_NAME}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {loading || authLoading ? (
            <div className="p-10 text-center">
              <div className="w-10 h-10 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading…</p>
            </div>
          ) : !info ? (
            <StateMessage
              title="Sign-up link inactive"
              message="Request an active QR code from the circle leader."
            />
          ) : done ? (
            <SuccessState email={email} resent={done.resent} emailed={done.emailed} />
          ) : isAuthenticated ? (
            <div className="p-8 text-center">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Already signed in</h2>
              <p className="text-gray-600 mb-6">Link for new accounts only.</p>
              <Link
                to="/profile"
                className="inline-block px-6 py-3 bg-[#8B1538] hover:bg-[#6B0F2B] text-white rounded-xl font-semibold"
              >
                Open profile
              </Link>
            </div>
          ) : (
            <div className="p-6">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-[#8B1538]">Account setup</h1>
                <p className="text-gray-600 mt-2 text-sm">
                  Circle: <span className="font-semibold">{info.groupName}</span>
                </p>
                {info.satelliteName && (
                  <span className="inline-block mt-2 px-3 py-1 bg-[#F8B4B4]/30 text-[#8B1538] rounded-full text-xs font-medium">
                    {info.satelliteName}
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-500 mb-5 text-center">
                Details matched against the church directory.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
                className="space-y-4"
              >
                <Field
                  id="join-name"
                  label="Full name"
                  value={name}
                  onChange={setName}
                  placeholder="Juan Dela Cruz"
                  autoComplete="name"
                  hint="Name as on church records."
                />
                <Field
                  id="join-email"
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="name@example.com"
                  autoComplete="email"
                  hint="Confirmation link sent here."
                />
                <Field
                  id="join-phone"
                  label="Mobile number"
                  optional
                  type="tel"
                  value={phone}
                  onChange={setPhone}
                  placeholder="0917 123 4567"
                  autoComplete="tel"
                />
                <Field
                  id="join-birthday"
                  label="Birthday"
                  optional
                  type="date"
                  value={birthday}
                  onChange={setBirthday}
                  hint="Separates similar names."
                />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 bg-[#8B1538] hover:bg-[#6B0F2B] disabled:opacity-60 text-white rounded-xl font-semibold text-lg transition-colors"
                >
                  {submitting ? 'Signing up…' : 'Sign up'}
                </button>
              </form>

              {formError && <p className="mt-4 text-center text-sm text-red-600">{formError}</p>}

              <p className="mt-5 text-center text-sm text-gray-500">
                Existing account:{' '}
                <Link to="/auth/login" className="text-[#8B1538] font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-white/40 text-xs mt-6">Quest Laguna · Member sign-up</p>
      </div>
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
  hint?: string
  optional?: boolean
}

function Field({ id, label, value, onChange, type = 'text', placeholder, autoComplete, hint, optional }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label} {optional && <span className="text-gray-400 font-normal">(optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none"
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function SuccessState({ email, resent, emailed }: { email: string; resent: boolean; emailed: boolean }) {
  return (
    <div className="p-8 text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
        <svg className="w-11 h-11 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">
        {emailed ? 'Confirmation email sent' : 'Sign-up recorded'}
      </h2>
      <p className="text-gray-600 mt-3">
        {emailed ? (
          <>
            {resent ? 'Confirmation link resent to ' : 'Confirmation link sent to '}
            <span className="font-semibold break-all">{email}</span>. Next step: open the link and
            set a password.
          </>
        ) : (
          <>Email not sent. Contact the circle leader.</>
        )}
      </p>
      {emailed && (
        <p className="text-gray-400 text-sm mt-4">
          Not in the inbox: check spam. Single use, time-limited.
        </p>
      )}
    </div>
  )
}

function StateMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="p-8 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-600">{message}</p>
    </div>
  )
}
