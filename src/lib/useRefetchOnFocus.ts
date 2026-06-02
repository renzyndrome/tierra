// Quest Laguna Directory - Refetch-on-focus hook
//
// Many routes load their data client-side with useEffect+useState. Those effects
// run once on mount and do NOT re-run when the user switches away from the browser
// tab and comes back, so the data goes stale and the only way to refresh it is a
// full browser reload. This hook adds the missing "refresh when I return to the
// tab" behavior in a single, reliable place.
//
// It listens to BOTH events because neither alone is reliable for every transition:
//   - document 'visibilitychange'  -> fires when switching browser tabs
//   - window 'focus'               -> fires when switching apps / refocusing the window
// The two often fire together on a single tab-return, so calls are throttled to
// coalesce them into at most one refetch.

import { useEffect, useRef } from 'react'

export function useRefetchOnFocus(
  onRefocus: () => void,
  enabled: boolean = true,
  throttleMs: number = 1000,
): void {
  const callbackRef = useRef(onRefocus)
  callbackRef.current = onRefocus

  const lastRunRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    const trigger = () => {
      // Only refetch when the page is actually visible (ignore the hidden transition).
      if (document.visibilityState !== 'visible') return

      const now = Date.now()
      if (now - lastRunRef.current < throttleMs) return
      lastRunRef.current = now

      callbackRef.current()
    }

    window.addEventListener('focus', trigger)
    document.addEventListener('visibilitychange', trigger)

    return () => {
      window.removeEventListener('focus', trigger)
      document.removeEventListener('visibilitychange', trigger)
    }
  }, [enabled, throttleMs])
}
