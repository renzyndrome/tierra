// Quest Laguna Directory - Register (LOCKED)
//
// Open self-signup is deliberately closed. Accounts are created either by an
// admin invite (Admin -> Users) or by scanning a Quest Circle sign-up QR
// (/join/<token>), which matches the person to their existing member record
// instead of creating a duplicate one.
//
// Supabase "Allow new users to sign up" is also OFF (see DEPLOY.md), so the old
// client-side signUp() call here would fail anyway. The route file is kept so
// the generated route tree and any stale bookmarks stay valid.

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/register')({
  beforeLoad: () => {
    throw redirect({ to: '/auth/login' })
  },
  component: () => null,
})
