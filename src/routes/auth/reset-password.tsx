// Quest Laguna Directory - Set / Reset Password Page
// Reached from invite, signup, and password-recovery links (the user already
// has a session at this point). Lets them set a password, then continues.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { setOwnPassword } from '../../server/functions/users'

export const Route = createFileRoute('/auth/reset-password')({
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, session, profile } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (isLoading || isAuthenticated) return
    // Arriving from /auth/confirm or /auth/callback, the session may take a beat to
    // propagate. Wait briefly before bouncing to login so we don't redirect during
    // that window — if auth flips true, this effect re-runs and clears the timer.
    const timer = setTimeout(() => navigate({ to: '/auth/login' }), 2000)
    return () => clearTimeout(timer)
  }, [isLoading, isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    const token = session?.access_token
    if (!token) {
      setError('Your session has expired. Please open the invite link again.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await setOwnPassword({ data: { accessToken: token, password } })
      setDone(true)
      // Newly-invited users have no linked member yet — send them to onboarding.
      const next = profile?.member_id ? '/admin' : '/auth/complete-profile'
      setTimeout(() => navigate({ to: next }), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Set your password</h1>
        <p className="text-gray-600 text-sm mb-6">Choose a password to finish setting up your account.</p>

        {done ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-center text-emerald-700">
            Password saved! Redirecting…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded-lg h-11 px-3"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border rounded-lg h-11 px-3"
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-[#8B1538] text-white rounded-lg hover:bg-[#6B0F2B] transition-colors disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
