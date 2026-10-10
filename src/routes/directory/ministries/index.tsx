// Quest Laguna Directory - Redirect to Admin
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/directory/ministries/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', search: { tab: 'ministries' } })
  },
  component: () => null,
})
