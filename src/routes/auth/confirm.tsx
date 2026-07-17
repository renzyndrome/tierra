// Quest Laguna Directory - Auth Confirm Page
// Verifies invite / magic-link / recovery tokens on OUR domain (via verifyOtp
// with the token hash) so emails never expose the raw *.supabase.co URL.

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { acceptInvitation } from '../../server/functions/users'

export const Route = createFileRoute('/auth/confirm')({
  component: AuthConfirmPage,
})

// These flows drop the user on the set-password page after verifying.
const PASSWORD_SETUP_TYPES = new Set<EmailOtpType>(['invite', 'signup', 'recovery', 'magiclink'])
const VALID_TYPES = new Set<EmailOtpType>(['invite', 'signup', 'recovery', 'magiclink', 'email', 'email_change'])

function AuthConfirmPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const tokenHash = params.get('token_hash')
        const rawType = (params.get('type') || 'invite') as EmailOtpType

        if (!tokenHash || !VALID_TYPES.has(rawType)) {
          setError('Invalid or expired confirmation link. Please request a new one.')
          return
        }

        const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: rawType })
        if (verifyErr) {
          setError(verifyErr.message)
          return
        }

        // Session established — record invitation acceptance in the BACKGROUND so a
        // slow server call can't block the redirect.
        supabase.auth
          .getSession()
          .then(({ data }) => {
            const token = data.session?.access_token
            if (token) acceptInvitation({ data: { accessToken: token } }).catch(() => {})
          })
          .catch(() => {})

        if (PASSWORD_SETUP_TYPES.has(rawType)) {
          navigate({ to: '/auth/reset-password' })
          return
        }
        const redirectPath = sessionStorage.getItem('quest_redirect_after_login') || '/admin'
        sessionStorage.removeItem('quest_redirect_after_login')
        navigate({ to: redirectPath })
      } catch {
        setError('Something went wrong. Please try again.')
      }
    }
    run()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirmation Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate({ to: '/auth/login' })}
            className="px-6 py-2 bg-[#8B1538] text-white rounded-lg hover:bg-[#6B0F2B] transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Confirming your invitation...</p>
      </div>
    </div>
  )
}
