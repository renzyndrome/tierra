import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'
import { PUBLIC_ENV } from './runtimeEnv'

// Resolved at runtime (server: process.env, browser: window.__ENV__) with a
// build-time-inlined value preferred when present. See src/lib/runtimeEnv.ts.
const supabaseUrl = PUBLIC_ENV.VITE_SUPABASE_URL
const supabaseAnonKey = PUBLIC_ENV.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Client-side Supabase client
// Bypass navigator.locks which gets aborted by React 18 strict mode,
// causing "DOMException: The operation was aborted" on auth init.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // The /auth/callback route parses invite/magic/recovery tokens from the URL
    // itself. Leaving detectSessionInUrl on races the client against that code —
    // the client silently consumes and clears the hash first, so the callback
    // then sees an empty hash and reports "Invalid authentication link".
    detectSessionInUrl: false,
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return fn()
    },
  },
})

// Server-side Supabase client (for server functions)
export function createServerSupabaseClient() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables on server')
  }

  return createClient<Database>(url, key)
}

// Server-side Supabase Admin client (for user management - requires service role key)
export function createServerAdminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase URL or service role key for admin operations')
  }

  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
