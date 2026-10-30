// Dropdown of saved prophetic word sets, for the create-session dialog. The
// set meant for the chosen service and date is preselected until staff pick
// another (or "None").

import type { PropheticWordSetSummary } from '../lib/types'
import { Label } from './ui/label'

function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

/** One dropdown line: "Young Pro: Nehemiah 2:17-18 · 30 words · Oct 23". The
 *  date is left out when the title already has it. */
export function formatSetOption(set: PropheticWordSetSummary): string {
  const date = set.service_date ? shortDate(set.service_date) : null
  return [set.title, `${set.word_count} words`, date && !set.title.includes(date) ? date : null]
    .filter(Boolean)
    .join(' · ')
}

/** A set title from its service, date and topic (passage or heading):
 *  "Young Pro: Oct 30, Rest is holy". Any part may be empty. */
export function suggestSetTitle(serviceName: string | null, date: string, topic: string): string {
  const service = (serviceName ?? '').replace(/\s+service$/i, '').trim()
  const rest = [date ? shortDate(date) : '', topic.trim()].filter(Boolean).join(', ')
  return (service && rest ? `${service}: ${rest}` : service || rest).slice(0, 120)
}

/** The set saved for this service type and date, if exactly one fits. */
export function matchingSet(
  sets: PropheticWordSetSummary[],
  serviceTypeId: string,
  date: string,
): PropheticWordSetSummary | null {
  const fits = sets.filter((s) => s.service_date === date && s.service_type_id === serviceTypeId)
  return fits.length === 1 ? fits[0] : null
}

interface PropheticSetSelectProps {
  sets: PropheticWordSetSummary[]
  // '' means none.
  value: string
  onChange: (setId: string) => void
  // True when the value was preselected for the service and date.
  preselected: boolean
}

export function PropheticSetSelect({ sets, value, onChange, preselected }: PropheticSetSelectProps) {
  return (
    <div>
      <Label htmlFor="svc-word-set">
        Prophetic words <span className="text-gray-400 font-normal">(optional)</span>
      </Label>
      <select
        id="svc-word-set"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#8B1538] outline-none"
      >
        <option value="">None</option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {formatSetOption(s)}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">
        {value
          ? preselected
            ? 'Set for this service and date. One random word per QR check-in.'
            : 'One random word per QR check-in.'
          : sets.length
            ? 'No prophetic word after QR check-in.'
            : 'No saved word sets. Add them under Prophetic words.'}
      </p>
    </div>
  )
}
