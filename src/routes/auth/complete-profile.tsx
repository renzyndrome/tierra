// Quest Laguna Directory - Complete Profile (onboarding)
// Shown to newly-invited users after they set their password. Collects the
// essentials — name, satellite, ministry — and creates + links their member record.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { supabase } from '../../lib/supabase'
import { completeOwnProfile } from '../../server/functions/users'
import { getSatellites } from '../../server/functions/satellites'
import { getAllMinistries } from '../../server/functions/ministries'
import type { SatelliteRow } from '../../lib/types'

export const Route = createFileRoute('/auth/complete-profile')({
  component: CompleteProfilePage,
})

function CompleteProfilePage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading, session, user, refreshProfile } = useAuth()

  const [name, setName] = useState('')
  const [satelliteId, setSatelliteId] = useState('')
  const [ministryId, setMinistryId] = useState('')
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [ministries, setMinistries] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isLoading || isAuthenticated) return
    const timer = setTimeout(() => navigate({ to: '/auth/login' }), 2000)
    return () => clearTimeout(timer)
  }, [isLoading, isAuthenticated, navigate])

  useEffect(() => {
    getSatellites({ data: true }).then(setSatellites).catch(() => {})
    getAllMinistries({ data: { activeOnly: true } })
      .then((rows) => setMinistries(rows.map((m) => ({ id: m.id, name: m.name }))))
      .catch(() => {})
  }, [])

  // Prefill satellite/ministry from any pre-assignment the admin set at invite time.
  useEffect(() => {
    const meta = user?.user_metadata as
      | { invited_satellite_id?: string | null; invited_ministry_id?: string | null }
      | undefined
    if (meta?.invited_satellite_id) setSatelliteId((prev) => prev || meta.invited_satellite_id!)
    if (meta?.invited_ministry_id) setMinistryId((prev) => prev || meta.invited_ministry_id!)
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your full name.')
      return
    }
    if (!satelliteId) {
      setError('Please select your satellite.')
      return
    }
    if (!ministryId) {
      setError('Please select your ministry.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      // Read the session fresh rather than trusting context state, which can be
      // stale right after the set-password step (the user arrives here moments
      // after their session was rotated).
      const { data: fresh } = await supabase.auth.getSession()
      const token = fresh.session?.access_token ?? session?.access_token
      if (!token) {
        setError('Your session has expired. Please sign in again.')
        setSubmitting(false)
        return
      }
      await completeOwnProfile({
        data: {
          accessToken: token,
          name: name.trim(),
          satelliteId,
          ministryId,
        },
      })
      await refreshProfile()
      navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your profile')
    } finally {
      setSubmitting(false)
    }
  }

  const fieldClass =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8B1538] focus:border-transparent outline-none'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Complete your profile</h1>
        <p className="text-gray-600 text-sm mb-6">
          Tell us a bit about yourself to finish setting up your account
          {user?.email ? ` (${user.email})` : ''}.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={fieldClass} autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Satellite *</label>
            <select value={satelliteId} onChange={(e) => setSatelliteId(e.target.value)} required className={`${fieldClass} h-10`}>
              <option value="">Select a satellite…</option>
              {satellites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ministry *</label>
            <select value={ministryId} onChange={(e) => setMinistryId(e.target.value)} required className={`${fieldClass} h-10`}>
              <option value="">Select a ministry…</option>
              {ministries.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 h-11 bg-[#8B1538] text-white rounded-lg hover:bg-[#6B0F2B] transition-colors disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save & Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
