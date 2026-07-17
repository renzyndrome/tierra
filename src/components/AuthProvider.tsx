// Quest Laguna Directory - Auth Provider Component

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserProfile, Member } from '../lib/types'
import type { AuthState } from '../lib/auth'
import { initialAuthState } from '../lib/auth'

// ============================================
// AUTH CONTEXT
// ============================================

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ============================================
// AUTH PROVIDER
// ============================================

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialAuthState)

  // Mirror the latest state so async auth-event handlers can read it without
  // re-subscribing. Supabase re-emits SIGNED_IN every time a backgrounded browser
  // tab becomes visible again; this lets us detect "same user returning" and avoid
  // needlessly re-fetching (and possibly blanking) the profile on every tab switch.
  const stateRef = useRef(state)
  stateRef.current = state

  // Fetch user profile from database
  const fetchUserProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        return null
      }

      return data as UserProfile
    } catch (err) {
      console.error('Error fetching user profile:', err)
      return null
    }
  }, [])

  // Initialize auth state
  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!mounted) return

        if (session?.user) {
          const profile = await fetchUserProfile(session.user.id)

          setState({
            user: session.user,
            session,
            profile,
            isLoading: false,
            isAuthenticated: true,
          })
        } else {
          setState({
            ...initialAuthState,
            isLoading: false,
          })
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        if (mounted) {
          setState({
            ...initialAuthState,
            isLoading: false,
          })
        }
      }
    }

    initializeAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_IN' && session?.user) {
          // Supabase re-emits SIGNED_IN on every tab refocus. If this is the same
          // user we already have, just refresh the session/user references and KEEP
          // the existing profile. Re-fetching here would (a) hit the DB on every tab
          // switch and (b) blank the profile (and the admin gate that reads it) if the
          // request transiently fails on wake — which is exactly the "data disappears,
          // must refresh the browser" symptom.
          const prev = stateRef.current
          if (prev.isAuthenticated && prev.user?.id === session.user.id && prev.profile) {
            setState({
              user: session.user,
              session,
              profile: prev.profile,
              isLoading: false,
              isAuthenticated: true,
            })
            return
          }

          const profile = await fetchUserProfile(session.user.id)
          if (!mounted) return
          setState(cur => ({
            user: session.user,
            session,
            // Preserve any existing profile if the fetch failed transiently.
            profile: profile ?? cur.profile,
            isLoading: false,
            isAuthenticated: true,
          }))
        } else if (event === 'SIGNED_OUT') {
          setState({
            ...initialAuthState,
            isLoading: false,
          })
        } else if (event === 'TOKEN_REFRESHED' && session) {
          setState(prev => ({
            ...prev,
            session,
          }))
        } else if (event === 'USER_UPDATED' && session?.user) {
          const profile = await fetchUserProfile(session.user.id)
          if (!mounted) return
          setState(prev => ({
            ...prev,
            user: session.user,
            profile: profile ?? prev.profile,
          }))
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchUserProfile])

  // Sign in with email/password
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }, [])

  // Sign up with email/password
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }, [])

  // Sign out
  const signOut = useCallback(async () => {
    // Fire the server sign-out but don't await it — supabase.auth.signOut() can
    // hang under this app's custom auth lock. Clear the persisted session and
    // local state directly so the user is signed out immediately and reliably.
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('sb-'))
        .forEach((k) => localStorage.removeItem(k))
    } catch {
      // ignore storage access issues
    }
    setState({ ...initialAuthState, isLoading: false })
  }, [])

  // Sign in with magic link
  const signInWithMagicLink = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }, [])

  // Reset password
  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }, [])

  // Update password
  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        return { error }
      }

      return { error: null }
    } catch (err) {
      return { error: err as Error }
    }
  }, [])

  // Refresh user profile
  const refreshProfile = useCallback(async () => {
    if (state.user) {
      const profile = await fetchUserProfile(state.user.id)
      setState(prev => ({
        ...prev,
        profile,
      }))
    }
  }, [state.user, fetchUserProfile])

  const value: AuthContextValue = {
    ...state,
    signIn,
    signUp,
    signOut,
    signInWithMagicLink,
    resetPassword,
    updatePassword,
    refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// ============================================
// HOOKS
// ============================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

export function useUser(): User | null {
  const { user } = useAuth()
  return user
}

export function useProfile(): UserProfile | null {
  const { profile } = useAuth()
  return profile
}

export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
}
