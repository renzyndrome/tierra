// Quest Laguna Directory - Auth Callback Page
// Handles redirects from magic links, OAuth, and password reset

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(true)

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the hash fragment from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const queryParams = new URLSearchParams(window.location.search)

        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type') || queryParams.get('type')
        const errorDescription = hashParams.get('error_description') || queryParams.get('error_description')

        // Check for errors
        if (errorDescription) {
          setError(decodeURIComponent(errorDescription))
          setIsProcessing(false)
          return
        }

        // If we have tokens, set the session
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (sessionError) {
            setError(sessionError.message)
            setIsProcessing(false)
            return
          }

          // Handle password recovery
          if (type === 'recovery') {
            navigate({ to: '/auth/reset-password' })
            return
          }

          // Redirect to directory or stored path
          const redirectPath = sessionStorage.getItem('quest_redirect_after_login') || '/directory'
          sessionStorage.removeItem('quest_redirect_after_login')
          navigate({ to: redirectPath })
          return
        }

        // If no tokens, try to exchange the code
        const code = queryParams.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {
            setError(exchangeError.message)
            setIsProcessing(false)
            return
          }

          // Handle password recovery
          if (type === 'recovery') {
            navigate({ to: '/auth/reset-password' })
            return
          }

          // Redirect to directory or stored path
          const redirectPath = sessionStorage.getItem('quest_redirect_after_login') || '/directory'
          sessionStorage.removeItem('quest_redirect_after_login')
          navigate({ to: redirectPath })
          return
        }

        // No valid auth parameters found
        setError('Invalid authentication link. Please try again.')
        setIsProcessing(false)
      } catch (err) {
        console.error('Auth callback error:', err)
        setError('An unexpected error occurred. Please try again.')
        setIsProcessing(false)
      }
    }

    handleAuthCallback()
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
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Authentication Error</h2>
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
        <p className="text-white text-lg">Completing sign in...</p>
      </div>
    </div>
  )
}
