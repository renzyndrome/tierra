// Suggested members for a staff name search (manual check-in, link dialog).
// Debounced a little longer than the plain search, since a suggestion request
// may consult Jev. Suggestions are extras: a failed request just shows none.

import { useState, useEffect } from 'react'
import { suggestMembersForCheckin } from '../server/functions/attendance'
import type { MemberSuggestion } from './types'

const SUGGEST_DEBOUNCE_MS = 500

export function useMemberSuggestions(
  accessToken: string | undefined,
  query: string,
): { suggestions: MemberSuggestion[]; suggesting: boolean } {
  const [suggestions, setSuggestions] = useState<MemberSuggestion[]>([])
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!accessToken || q.length < 2) {
      setSuggestions([])
      setSuggesting(false)
      return
    }
    let active = true
    setSuggestions([])
    setSuggesting(true)
    const t = setTimeout(async () => {
      try {
        const res = await suggestMembersForCheckin({ data: { accessToken, query: q } })
        if (active) setSuggestions(res)
      } catch {
        if (active) setSuggestions([])
      } finally {
        if (active) setSuggesting(false)
      }
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [query, accessToken])

  return { suggestions, suggesting }
}
