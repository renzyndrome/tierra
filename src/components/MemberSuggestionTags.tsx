// Tags explaining why a member is suggested for a staff name search.

import { JEV_LIKELY_PROBABILITY } from '../lib/constants'
import type { MemberSuggestion, SuggestionReason } from '../lib/types'

const REASON_LABELS: Record<SuggestionReason, string> = {
  email: 'Email match',
  phone: 'Phone match',
  initials: 'Same initials',
  surname: 'Same surname',
  similar: 'Similar name',
}

const CONTACT_REASONS: readonly SuggestionReason[] = ['email', 'phone']

export function MemberSuggestionTags({ suggestion }: { suggestion: MemberSuggestion }) {
  const likely = (suggestion.jev_probability ?? 0) >= JEV_LIKELY_PROBABILITY
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {likely && (
        <span className="ml-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold uppercase tracking-wide">
          Likely match
        </span>
      )}
      {suggestion.reasons.map((r) => (
        <span
          key={r}
          className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
            CONTACT_REASONS.includes(r) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {REASON_LABELS[r]}
        </span>
      ))}
    </span>
  )
}
