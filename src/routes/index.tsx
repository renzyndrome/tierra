import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // Redirect straight to login (saves an extra hop through /admin)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('quest_redirect_after_login', '/admin')
    }
    throw redirect({ to: '/auth/login' })
  },
  component: () => null,
})
