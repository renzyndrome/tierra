// Quest Laguna Directory - Cell Group Card Component

import { Link } from '@tanstack/react-router'
import type { CellGroup, CellGroupWithRelations } from '../lib/types'
import { getPlaceholderAvatar } from '../lib/storage'

interface CellGroupCardProps {
  cellGroup: CellGroupWithRelations
  showActions?: boolean
  onEdit?: (cellGroup: CellGroup) => void
  onDelete?: (cellGroup: CellGroup) => void
}

export function CellGroupCard({ cellGroup, showActions = false, onEdit, onDelete }: CellGroupCardProps) {
  const leaderAvatar = cellGroup.leader?.photo_url ||
    (cellGroup.leader ? getPlaceholderAvatar(cellGroup.leader.name) : null)

  const dayColors: Record<string, string> = {
    Sunday: 'bg-purple-100 text-purple-800',
    Monday: 'bg-blue-100 text-blue-800',
    Tuesday: 'bg-green-100 text-green-800',
    Wednesday: 'bg-yellow-100 text-yellow-800',
    Thursday: 'bg-orange-100 text-orange-800',
    Friday: 'bg-pink-100 text-pink-800',
    Saturday: 'bg-indigo-100 text-indigo-800',
  }

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <Link
            to="/admin/cell-groups/$groupId"
            params={{ groupId: cellGroup.id }}
            className="text-lg font-semibold text-gray-900 hover:text-[#8B1538] block truncate"
          >
            {cellGroup.name}
          </Link>

          {cellGroup.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{cellGroup.description}</p>
          )}

          {/* Meeting Info */}
          <div className="flex flex-wrap gap-2 mt-3">
            {cellGroup.meeting_day && (
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${dayColors[cellGroup.meeting_day] || 'bg-gray-100 text-gray-800'}`}>
                {cellGroup.meeting_day}s
              </span>
            )}
            {cellGroup.meeting_time && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                {cellGroup.meeting_time}
              </span>
            )}
            {cellGroup.is_active === false && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                Inactive
              </span>
            )}
          </div>

          {/* Location */}
          {cellGroup.meeting_location && (
            <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{cellGroup.meeting_location}</span>
            </div>
          )}

          {/* Leader Info */}
          {cellGroup.leader && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              {leaderAvatar && (
                <img
                  src={leaderAvatar}
                  alt={cellGroup.leader.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {cellGroup.leader.name}
                </p>
                <p className="text-xs text-gray-500">Cell Leader</p>
              </div>
            </div>
          )}

          {/* Member Count */}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{cellGroup.member_count || 0} / {cellGroup.max_members} members</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex flex-col gap-1 ml-2">
            {onEdit && (
              <button
                onClick={() => onEdit(cellGroup)}
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
                onClick={() => onDelete(cellGroup)}
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
// CELL GROUP CARD SKELETON
// ============================================

export function CellGroupCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 animate-pulse">
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-full mb-3" />
      <div className="flex gap-2">
        <div className="h-5 bg-gray-200 rounded w-20" />
        <div className="h-5 bg-gray-200 rounded w-16" />
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
// COMPACT CELL GROUP CARD (for lists)
// ============================================

interface CompactCellGroupCardProps {
  cellGroup: CellGroupWithRelations
  onClick?: () => void
}

export function CompactCellGroupCard({ cellGroup, onClick }: CompactCellGroupCardProps) {
  const dayColors: Record<string, string> = {
    Sunday: 'bg-purple-100 text-purple-800',
    Monday: 'bg-blue-100 text-blue-800',
    Tuesday: 'bg-green-100 text-green-800',
    Wednesday: 'bg-yellow-100 text-yellow-800',
    Thursday: 'bg-orange-100 text-orange-800',
    Friday: 'bg-pink-100 text-pink-800',
    Saturday: 'bg-indigo-100 text-indigo-800',
  }

  return (
    <div
      onClick={onClick}
      className={`p-3 bg-white rounded-lg border border-gray-200 ${
        onClick ? 'cursor-pointer hover:border-[#8B1538] hover:shadow-sm transition-all' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{cellGroup.name}</p>
          <p className="text-sm text-gray-500 truncate">
            {cellGroup.leader?.name || 'No leader assigned'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cellGroup.meeting_day && (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${dayColors[cellGroup.meeting_day] || 'bg-gray-100 text-gray-800'}`}>
              {cellGroup.meeting_day}
            </span>
          )}
          <span className="text-sm text-gray-500">
            {cellGroup.member_count || 0}/{cellGroup.max_members}
          </span>
        </div>
      </div>
    </div>
  )
}
