// Quest Laguna Directory - Redirect to Admin
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/directory/members/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', search: { tab: 'members' } })
  },
  component: () => null,
})
