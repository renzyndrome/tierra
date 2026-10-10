// Quest Laguna Directory - Redirect to Admin
// The directory is now protected and lives at /admin

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/directory/')({
  beforeLoad: () => {
    // Redirect to admin (directory is now protected)
    throw redirect({ to: '/admin', search: {} })
  },
  component: () => null,
})
