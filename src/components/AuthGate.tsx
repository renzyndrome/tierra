// Global authentication gate.
//
// Seals the internal app from the public: only the check-in and auth flows are
// reachable without a session. Every other route redirects anonymous visitors
// to the login page, so someone who scans a service-attendance QR (and lands on
// the app's domain) can never wander into the directory, member profiles, admin,
// etc. by guessing URLs.
//
// Enforced client-side because the Supabase session lives in the browser — this
// mirrors how ProtectedRoute already guards individual routes; the gate just
// makes deny-by-default the app-wide baseline. Per-route guards remain as
// defense in depth.

import { useEffect } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from './AuthProvider'

// Path prefixes that must stay reachable without a session.
const PUBLIC_PREFIXES = ['/checkin', '/auth'] as const

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const pathname = useLocation({ select: (l) => l.pathname })
  const isPublic = isPublicPath(pathname)

  useEffect(() => {
    if (isPublic) return
    if (!isLoading && !isAuthenticated) {
      // Remember where they were headed so login can send them back.
      try {
        sessionStorage.setItem('quest_redirect_after_login', pathname)
      } catch {
        /* sessionStorage may be unavailable; ignore */
      }
      navigate({ to: '/auth/login' })
    }
  }, [isPublic, isLoading, isAuthenticated, pathname, navigate])

  // Public routes always render.
  if (isPublic) return <>{children}</>

  // Protected routes: wait for the session to resolve, then either render (when
  // authenticated) or hold the spinner while the redirect above navigates away.
  if (isLoading || !isAuthenticated) return <FullScreenSpinner />

  return <>{children}</>
}
