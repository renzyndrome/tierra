// Reusable giving / Statement-of-Account panel. Used on the member's own
// "My Giving" page. Purely presentational — the caller fetches the statement.

import type { MemberGivingStatement } from '../lib/types'
import { formatCurrency, INCOME_CATEGORIES } from '../lib/constants'

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function categoryLabel(category: string): string {
  return INCOME_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

function categoryColor(category: string): string {
  return INCOME_CATEGORIES.find((c) => c.value === category)?.color ?? '#6B7280'
}

interface GivingStatementProps {
  statement: MemberGivingStatement | null
  loading?: boolean
  title?: string
  emptyMessage?: string
}

export function GivingStatement({
  statement,
  loading = false,
  title = 'My Giving',
  emptyMessage = 'No giving has been recorded for this period yet.',
}: GivingStatementProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  if (!statement || statement.giftCount === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-sm text-gray-500">
          {statement.giftCount} {statement.giftCount === 1 ? 'gift' : 'gifts'}
        </span>
      </div>

      {/* Total */}
      <div className="rounded-lg bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white p-4 mb-4">
        <p className="text-xs uppercase tracking-wider text-white/70">Total Given</p>
        <p className="text-2xl font-bold mt-0.5">{formatCurrency(statement.totalGiven)}</p>
        {(statement.firstGiftDate || statement.lastGiftDate) && (
          <p className="text-xs text-white/70 mt-1">
            {statement.firstGiftDate &&
            statement.lastGiftDate &&
            statement.firstGiftDate !== statement.lastGiftDate
              ? `${formatDate(statement.firstGiftDate)} – ${formatDate(statement.lastGiftDate)}`
              : formatDate((statement.lastGiftDate || statement.firstGiftDate) as string)}
          </p>
        )}
      </div>

      {/* By category */}
      {statement.byCategory.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          {statement.byCategory.map((c) => (
            <div key={c.category} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: categoryColor(c.category) }}
                />
                <span className="text-xs font-medium text-gray-600 truncate">
                  {categoryLabel(c.category)}
                </span>
              </div>
              <p className="text-base font-bold text-gray-900 mt-1">{formatCurrency(c.amount)}</p>
              <p className="text-[11px] text-gray-400">
                {c.count} {c.count === 1 ? 'gift' : 'gifts'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Transaction logs */}
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Transaction History
      </p>
      <div className="grid gap-1.5">
        {statement.entries.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between py-2 border-b last:border-0 border-gray-100"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: categoryColor(e.category) }}
                />
                <p className="text-sm font-medium text-gray-800 truncate">
                  {categoryLabel(e.category)}
                </p>
              </div>
              <p className="text-xs text-gray-400 truncate">
                {formatDate(e.transaction_date)}
                {e.satellite_name ? ` · ${e.satellite_name}` : ''}
                {e.reference_number ? ` · Ref ${e.reference_number}` : ''}
              </p>
              {e.description && (
                <p className="text-xs text-gray-400 truncate">{e.description}</p>
              )}
            </div>
            <span className="text-sm font-semibold text-emerald-600 shrink-0 ml-3">
              {formatCurrency(e.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
