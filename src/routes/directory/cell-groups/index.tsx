// Quest Laguna Directory - Redirect to Admin
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/directory/cell-groups/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin', search: { tab: 'cell-groups' } })
  },
  component: () => null,
})
