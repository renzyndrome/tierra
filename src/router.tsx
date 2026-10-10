import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},

    scrollRestoration: true,
    // Warm loader-backed routes on hover/touch for snappier navigation. The framework
    // default staleTime (30s) keeps preloaded data fresh enough without redundant fetches.
    defaultPreload: 'intent',
  })

  return router
}
