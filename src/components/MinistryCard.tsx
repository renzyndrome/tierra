// Quest Laguna Directory - Ministry Card Component

import { Link } from '@tanstack/react-router'
import type { Ministry, MinistryWithRelations } from '../lib/types'
import { getPlaceholderAvatar } from '../lib/storage'

interface MinistryCardProps {
  ministry: MinistryWithRelations
  showActions?: boolean
  onEdit?: (ministry: Ministry) => void
  onDelete?: (ministry: Ministry) => void
}

// Department colors
const departmentColors: Record<string, string> = {
  Worship: 'bg-purple-100 text-purple-800',
  Media: 'bg-blue-100 text-blue-800',
  Creative: 'bg-pink-100 text-pink-800',
  'Kids': 'bg-green-100 text-green-800',
  Youth: 'bg-orange-100 text-orange-800',
  Admin: 'bg-gray-100 text-gray-800',
  Hospitality: 'bg-yellow-100 text-yellow-800',
  Outreach: 'bg-red-100 text-red-800',
  Discipleship: 'bg-indigo-100 text-indigo-800',
  Prayer: 'bg-teal-100 text-teal-800',
}

export function MinistryCard({ ministry, showActions = false, onEdit, onDelete }: MinistryCardProps) {
  const headAvatar = ministry.head?.photo_url ||
    (ministry.head ? getPlaceholderAvatar(ministry.head.name) : null)

  const deptColor = departmentColors[ministry.department || ''] || 'bg-gray-100 text-gray-800'

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Link
            to="/admin/ministries/$ministryId"
            params={{ ministryId: ministry.id }}
            className="text-lg font-semibold text-gray-900 hover:text-[#8B1538] block truncate"
          >
            {ministry.name}
          </Link>

          {ministry.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{ministry.description}</p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mt-3">
            {ministry.department && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${deptColor}`}>
                {ministry.department}
              </span>
            )}
            {ministry.is_active === false && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                Inactive
              </span>
            )}
          </div>

          {/* Head Info */}
          {ministry.head && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              {headAvatar && (
                <img
                  src={headAvatar}
                  alt={ministry.head.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {ministry.head.name}
                </p>
                <p className="text-xs text-gray-500">Ministry Head</p>
              </div>
            </div>
          )}

          {/* Member Count */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{ministry.member_count || 0} volunteers</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex flex-col gap-1 ml-2">
            {onEdit && (
              <button
                onClick={() => onEdit(ministry)}
                className="p-2 text-gray-500 hover:text-[#8B1538] hover:bg-gray-100 rounded"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(ministry)}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// MINISTRY CARD SKELETON
// ============================================

export function MinistryCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-full mb-3" />
      <div className="flex gap-2">
        <div className="h-5 bg-gray-200 rounded w-20" />
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-200" />
          <div>
            <div className="h-4 bg-gray-200 rounded w-24 mb-1" />
            <div className="h-3 bg-gray-200 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPACT MINISTRY CARD (for lists)
// ============================================

interface CompactMinistryCardProps {
  ministry: MinistryWithRelations
  onClick?: () => void
}

export function CompactMinistryCard({ ministry, onClick }: CompactMinistryCardProps) {
  const deptColor = departmentColors[ministry.department || ''] || 'bg-gray-100 text-gray-800'

  return (
    <div
      onClick={onClick}
      className={`p-3 bg-white rounded-lg border border-gray-200 ${
        onClick ? 'cursor-pointer hover:border-[#8B1538] hover:shadow-sm transition-all' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{ministry.name}</p>
          <p className="text-sm text-gray-500 truncate">
            {ministry.head?.name || 'No head assigned'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ministry.department && (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${deptColor}`}>
              {ministry.department}
            </span>
          )}
          <span className="text-sm text-gray-500">{ministry.member_count || 0}</span>
        </div>
      </div>
    </div>
  )
}
