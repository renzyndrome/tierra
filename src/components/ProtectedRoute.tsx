// Quest Laguna Directory - Protected Route Component

import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from './AuthProvider'
import type { UserRole, Permission } from '../lib/types'
import { hasPermission, hasMinimumRole } from '../lib/auth'

// ============================================
// LOADING SPINNER
// ============================================

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

// ============================================
// UNAUTHORIZED PAGE
// ============================================

function UnauthorizedPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-auto p-6">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
        <p className="text-gray-600 mb-6">
          You don't have permission to access this page.
        </p>
        <button
          onClick={() => navigate({ to: '/' })}
          className="px-6 py-2 bg-[#8B1538] text-white rounded-lg hover:bg-[#6B0F2B] transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  )
}

// ============================================
// PROTECTED ROUTE COMPONENT
// ============================================

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: UserRole
  requiredPermissions?: Permission[]
  requireAll?: boolean // If true, require ALL permissions; if false, require ANY
  fallbackPath?: string
  showUnauthorized?: boolean
}

export function ProtectedRoute({
  children,
  requiredRole,
  requiredPermissions = [],
  requireAll = true,
  fallbackPath = '/auth/login',
  showUnauthorized = true,
}: ProtectedRouteProps) {
  const { user, profile, isLoading, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Store the current path to redirect back after login
      sessionStorage.setItem('quest_redirect_after_login', window.location.pathname)
      navigate({ to: fallbackPath })
    }
  }, [isLoading, isAuthenticated, navigate, fallbackPath])

  // Show loading state
  if (isLoading) {
    return <LoadingSpinner />
  }

  // Not authenticated - redirect happens in useEffect
  if (!isAuthenticated || !user) {
    return <LoadingSpinner />
  }

  // Check role requirement
  if (requiredRole && profile) {
    if (!hasMinimumRole(profile.role, requiredRole)) {
      return showUnauthorized ? <UnauthorizedPage /> : null
    }
  }

  // Check permission requirements
  if (requiredPermissions.length > 0 && profile) {
    const hasRequiredPermissions = requireAll
      ? requiredPermissions.every(p => hasPermission(profile.role, p))
      : requiredPermissions.some(p => hasPermission(profile.role, p))

    if (!hasRequiredPermissions) {
      return showUnauthorized ? <UnauthorizedPage /> : null
    }
  }

  // If profile is required but not loaded yet
  if ((requiredRole || requiredPermissions.length > 0) && !profile) {
    return <LoadingSpinner />
  }

  return <>{children}</>
}

// ============================================
// ADMIN ROUTE WRAPPER
// ============================================

interface AdminRouteProps {
  children: React.ReactNode
  requiredPermissions?: Permission[]
}

export function AdminRoute({ children, requiredPermissions = [] }: AdminRouteProps) {
  return (
    <ProtectedRoute
      requiredRole="cell_leader"
      requiredPermissions={requiredPermissions}
      fallbackPath="/auth/login"
    >
      {children}
    </ProtectedRoute>
  )
}

// ============================================
// SUPER ADMIN ROUTE WRAPPER
// ============================================

interface SuperAdminRouteProps {
  children: React.ReactNode
}

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  return (
    <ProtectedRoute
      requiredRole="super_admin"
      fallbackPath="/auth/login"
    >
      {children}
    </ProtectedRoute>
  )
}
