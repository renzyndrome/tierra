// Quest Laguna Directory - Member Card Component

import { Link } from '@tanstack/react-router'
import type { Member } from '../lib/types'
import { getPlaceholderAvatar } from '../lib/storage'

interface MemberCardProps {
  member: Member
  showActions?: boolean
  onEdit?: (member: Member) => void
  onArchive?: (member: Member) => void
}

export function MemberCard({ member, showActions = false, onEdit, onArchive }: MemberCardProps) {
  const avatarUrl = member.photo_url || getPlaceholderAvatar(member.name)

  const stageBadgeColor = {
    Newbie: 'bg-amber-100 text-amber-800',
    Growing: 'bg-teal-100 text-teal-800',
    Leader: 'bg-slate-200 text-slate-800',
  }[member.discipleship_stage]

  const statusBadgeColor = {
    visitor: 'bg-gray-100 text-gray-800',
    regular: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-red-100 text-red-800',
  }[member.membership_status]

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <img
          src={avatarUrl}
          alt={member.name}
          className="w-16 h-16 rounded-full object-cover flex-shrink-0"
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link
            to="/directory/members/$memberId"
            params={{ memberId: member.id }}
            className="text-lg font-semibold text-gray-900 hover:text-[#8B1538] truncate block"
          >
            {member.name}
          </Link>

          <p className="text-sm text-gray-600 truncate">{member.city}</p>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${stageBadgeColor}`}>
              {member.discipleship_stage}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeColor}`}>
              {member.membership_status}
            </span>
            {member.needs_support && (
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                Needs Support
              </span>
            )}
          </div>

          {/* Contact */}
          {(member.email || member.phone) && (
            <div className="mt-2 text-sm text-gray-500">
              {member.email && (
                <a href={`mailto:${member.email}`} className="hover:text-[#8B1538] block truncate">
                  {member.email}
                </a>
              )}
              {member.phone && (
                <a href={`tel:${member.phone}`} className="hover:text-[#8B1538]">
                  {member.phone}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex flex-col gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(member)}
                className="p-2 text-gray-500 hover:text-[#8B1538] hover:bg-gray-100 rounded"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            {onArchive && (
              <button
                onClick={() => onArchive(member)}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                title="Archive"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
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
// MEMBER CARD SKELETON
// ============================================

export function MemberCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-gray-200" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded w-16" />
            <div className="h-5 bg-gray-200 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// COMPACT MEMBER CARD (for lists)
// ============================================

interface CompactMemberCardProps {
  member: Member
  onClick?: () => void
}

export function CompactMemberCard({ member, onClick }: CompactMemberCardProps) {
  const avatarUrl = member.photo_url || getPlaceholderAvatar(member.name)

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 ${
        onClick ? 'cursor-pointer hover:border-[#8B1538] hover:shadow-sm transition-all' : ''
      }`}
    >
      <img
        src={avatarUrl}
        alt={member.name}
        className="w-10 h-10 rounded-full object-cover"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{member.name}</p>
        <p className="text-sm text-gray-500 truncate">{member.city}</p>
      </div>
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
        member.discipleship_stage === 'Newbie' ? 'bg-amber-100 text-amber-800' :
        member.discipleship_stage === 'Growing' ? 'bg-teal-100 text-teal-800' :
        'bg-slate-200 text-slate-800'
      }`}>
        {member.discipleship_stage}
      </span>
    </div>
  )
}
