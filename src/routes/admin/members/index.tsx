// Quest Laguna Directory - Redirect to Dashboard Members Tab

import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/members/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', search: { tab: 'members' } })
  },
  component: () => null,
})
