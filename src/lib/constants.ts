import type { DiscipleshipStage, EventMemberStatus, CivilStatus, MemberCategory, FollowThrough, DiscipleshipJourney, LeadershipLevel, IncomeCategory, ExpenseCategory, TransactionType, Permission, UserRole } from './types'
import { PUBLIC_ENV } from './runtimeEnv'

// Discipleship stage options
export const DISCIPLESHIP_STAGES: {
  value: DiscipleshipStage
  label: string
  description: string
}[] = [
  {
    value: 'Newbie',
    label: 'New Friends',
    description: 'New believer or first-time attendee',
  },
  {
    value: 'Growing',
    label: 'Schooling',
    description: 'Members in SOD 1-3 and QBS discipleship',
  },
  {
    value: 'Leader',
    label: 'Leader',
    description: 'Small group leader or ministry head',
  },
]

// Map DB enum values to display labels
export const STAGE_LABELS: Record<string, string> = {
  Newbie: 'New Friends',
  Growing: 'Schooling',
  Leader: 'Leader',
}

// Event registration member status options
export const EVENT_MEMBER_STATUSES: {
  value: EventMemberStatus
  label: string
  description: string
}[] = [
  {
    value: 'First Timer',
    label: 'First Timer',
    description: 'First time attending a Quest event',
  },
  {
    value: 'Newbie',
    label: 'Newbie',
    description: 'New to Quest, attended a few times',
  },
  {
    value: 'Regular',
    label: 'Regular',
    description: 'Regular attendee',
  },
  {
    value: 'Leader',
    label: 'Leader',
    description: 'Quest Circle leader or ministry head',
  },
]

// Civil status options
export const CIVIL_STATUSES: { value: CivilStatus; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'married', label: 'Married' },
  { value: 'widowed', label: 'Widowed' },
]

// Member category options
export const MEMBER_CATEGORIES: { value: MemberCategory; label: string; description: string }[] = [
  { value: 'Kid', label: 'Kid', description: 'Children (under 13)' },
  { value: 'Student', label: 'Student', description: 'Students (13-22)' },
  { value: 'Young Pro', label: 'Young Pro', description: 'Young professionals' },
  { value: 'Mother', label: 'Mother', description: 'Mothers' },
  { value: 'Father', label: 'Father', description: 'Fathers' },
]

// Follow-through engagement stages (ordered)
export const FOLLOW_THROUGH_STAGES: { value: FollowThrough; label: string; description: string }[] = [
  { value: 'Salvation', label: 'Salvation', description: 'Initial acceptance' },
  { value: 'Prayer', label: 'Prayer', description: 'Active in prayer' },
  { value: 'Bible and Devotion', label: 'Bible & Devotion', description: 'Regular Bible reading' },
  { value: 'Transformation', label: 'Transformation', description: 'Active growth and change' },
  { value: 'Cell and Church', label: 'Cell & Church', description: 'Integrated into Quest Circle and church' },
]

// Discipleship journey stages (ordered 1-9)
export const DISCIPLESHIP_JOURNEY_STAGES: {
  value: DiscipleshipJourney
  label: string
  description: string
  simpleStage: DiscipleshipStage
}[] = [
  { value: 'Consolidations', label: 'Consolidations', description: 'Initial follow-up after first contact', simpleStage: 'Newbie' },
  { value: 'Pre Encounter', label: 'Quest Life Preparation', description: 'Preparing for Quest Retreat', simpleStage: 'Growing' },
  { value: 'Encounter', label: 'Quest Retreat', description: 'Attended Quest Retreat', simpleStage: 'Growing' },
  { value: 'Post-Encounter', label: 'Post-Retreat', description: 'After Quest Retreat, starting discipleship', simpleStage: 'Growing' },
  { value: 'SOD1', label: 'SOD 1', description: 'School of Disciples Level 1', simpleStage: 'Growing' },
  { value: 'SOD2', label: 'SOD 2', description: 'School of Disciples Level 2', simpleStage: 'Growing' },
  { value: 'SOD3', label: 'SOD 3', description: 'School of Disciples Level 3', simpleStage: 'Growing' },
  { value: 'Bible School', label: 'Bible School', description: 'Bible School program', simpleStage: 'Growing' },
  { value: 'QBS Theology 101', label: 'QBS Theology 101', description: 'Quest Bible Seminary - Theology', simpleStage: 'Growing' },
  { value: 'QBS Preaching 101', label: 'QBS Preaching 101', description: 'Quest Bible Seminary - Preaching', simpleStage: 'Growing' },
]

// Leadership levels (ordered by rank)
export const LEADERSHIP_LEVELS: { value: LeadershipLevel; label: string; description: string }[] = [
  { value: 'Member', label: 'Member', description: 'Regular church member' },
  { value: 'Disciple Maker', label: 'Disciple Maker', description: 'Can disciple others' },
  { value: 'Eagle', label: 'Eagle', description: 'Senior disciple maker / cell leader' },
  { value: 'Pastor', label: 'Pastor', description: 'Pastoral role' },
  { value: 'Head Pastor', label: 'Head Pastor', description: 'Lead pastor' },
]

// Helper: Map detailed journey to simple 3-stage
export function getSimpleStageFromJourney(journey: DiscipleshipJourney | null | undefined): DiscipleshipStage {
  if (!journey) return 'Newbie'
  const mapping = DISCIPLESHIP_JOURNEY_STAGES.find(s => s.value === journey)
  return mapping?.simpleStage ?? 'Newbie'
}

// Church name — used for neutral branding, e.g. the service check-in page.
export const CHURCH_NAME = 'Quest Laguna'

// Logo path
export const LOGO_PATH = '/questlogo.jpg'

// Admin PIN (resolved at runtime; build-time value preferred when present)
export const ADMIN_PIN = PUBLIC_ENV.VITE_ADMIN_PIN || 'quest2026'

// Theme colors (NEXTLEVEL Stronger 2026 branding - Red/Maroon theme)
export const THEME_COLORS = {
  primary: '#8B1538', // Deep maroon/red - main brand color
  primaryLight: '#B91C3C', // Lighter red
  primaryDark: '#6B0F2B', // Darker maroon
  secondary: '#DC2626', // Bright red - accent
  accent: '#FFFFFF', // White - for contrast
  background: '#1A0A0E', // Very dark maroon/black
  backgroundLight: '#2D1218', // Slightly lighter dark
  foreground: '#FFFFFF', // White text
  muted: '#F8B4B4', // Light pink/salmon for muted text
}

// Display screen refresh interval (10 seconds)
export const DISPLAY_REFRESH_INTERVAL = 10000

// Fun facts for display screen rotation (30 seconds)
export const FUN_FACTS_INTERVAL = 30000
export const FUN_FACTS = [
  'Quest Laguna started with just 15 people in 2016!',
  'We now have 9 satellite locations across Laguna and nearby areas.',
  'Over 500 people have been discipled through Quest.',
  'Our church family has 278+ members across all satellites!',
  'Quest has 17 active ministry teams serving the community.',
  'NEXTLEVEL Stronger 2026 - Going to the next level together!',
]

// ============================================
// FINANCIAL CONSTANTS
// ============================================

export const INCOME_CATEGORIES: {
  value: IncomeCategory
  label: string
  description: string
  color: string
}[] = [
  { value: 'Tithe', label: 'Tithe', description: '10% of income given to God', color: '#10B981' },
  { value: 'Offering', label: 'Offering', description: 'General offerings and donations', color: '#3B82F6' },
  { value: 'Missions', label: 'Missions', description: 'Special offerings for missions work', color: '#8B5CF6' },
]

export const EXPENSE_CATEGORIES: {
  value: ExpenseCategory
  label: string
  description: string
  color: string
}[] = [
  { value: 'Utilities', label: 'Utilities', description: 'Electricity, water, internet, etc.', color: '#F59E0B' },
  { value: 'Supplies', label: 'Supplies', description: 'Office supplies, materials, etc.', color: '#EF4444' },
  { value: 'Equipment', label: 'Equipment', description: 'Sound equipment, furniture, etc.', color: '#EC4899' },
  { value: 'Events', label: 'Events', description: 'Costs for church events and gatherings', color: '#06B6D4' },
  { value: 'Programs', label: 'Programs', description: 'Ministry programs and activities', color: '#6366F1' },
]

export function getCategoriesByType(type: TransactionType) {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

export function getCategoryColor(category: string): string {
  const income = INCOME_CATEGORIES.find(c => c.value === category)
  if (income) return income.color
  const expense = EXPENSE_CATEGORIES.find(c => c.value === category)
  return expense?.color || '#6B7280'
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

// Group large counts with thousands separators (e.g. 1,234) for consistency with
// the currency figures shown alongside them.
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-PH').format(n)
}

// ============================================
// INVENTORY
// ============================================

export const INVENTORY_LOCATIONS = ['Moriah Hall', 'Nxtgen Hall'] as const
export const INVENTORY_CONDITIONS = ['Good', 'Fair', 'Needs Repair', 'Damaged'] as const
export const INVENTORY_CATEGORIES = [
  'Sound Equipment',
  'Musical Instruments',
  'Furniture',
  'Electronics',
  'Kitchen',
  'Office Supplies',
  'Decor',
  'Other',
] as const

// Maintenance log types (must match the CHECK constraint in
// supabase/2026-07-17_inventory_module.sql).
export const MAINTENANCE_TYPES = [
  'Cleaning',
  'Repair',
  'Inspection',
  'Servicing',
  'Calibration',
  'Other',
] as const

// Where a checked-out unit is deployed (must match the CHECK constraint on
// inventory_borrow_requests.destination_type).
export const BORROW_DESTINATION_TYPES = ['internal', 'satellite', 'outreach', 'personal'] as const

export const BORROW_DESTINATION_LABELS: Record<string, string> = {
  internal: 'Internal / On-campus',
  satellite: 'Satellite',
  outreach: 'Outreach program',
  personal: 'Personal',
}

// Human labels for the borrow / deployment lifecycle.
export const BORROW_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  checked_out: 'Checked out',
  returned: 'Returned',
  cancelled: 'Cancelled',
}

// Tailwind badge classes per borrow status.
export const BORROW_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  checked_out: 'bg-purple-100 text-purple-800',
  returned: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

// Statuses that mean a unit is currently out (unavailable).
export const BORROW_ACTIVE_STATUSES = ['approved', 'checked_out'] as const

// ============================================
// ACCOUNT MANAGEMENT — roles, permissions, finance PIN
// ============================================

// Roles an admin can assign when inviting or editing a user.
export const ASSIGNABLE_ROLES: UserRole[] = [
  'admin', 'finance', 'satellite', 'registration', 'discipleship', 'member',
]

export interface PermissionDef {
  value: Permission
  label: string
  description: string
}

export interface PermissionGroup {
  group: string
  permissions: PermissionDef[]
}

// Grouped catalog of individually-assignable permissions, rendered as the
// editable role -> permission matrix. The '*' wildcard (admin) is intentionally
// not listed here; admin is locked to full access in the UI/server.
export const PERMISSION_CATALOG: PermissionGroup[] = [
  {
    group: 'Members',
    permissions: [
      { value: 'members.read', label: 'View members', description: 'Browse the members directory' },
      { value: 'members.write', label: 'Edit members', description: 'Create and update member records' },
      { value: 'members.delete', label: 'Delete members', description: 'Archive or delete members' },
    ],
  },
  {
    group: 'Quest Circles',
    permissions: [
      { value: 'cell_groups.read', label: 'View circles', description: 'View Quest Circles (cell groups)' },
      { value: 'cell_groups.write', label: 'Manage circles', description: 'Create and update circles and membership' },
      { value: 'cell_groups.delete', label: 'Delete circles', description: 'Delete circles' },
    ],
  },
  {
    group: 'Ministries',
    permissions: [
      { value: 'ministries.read', label: 'View ministries', description: 'View ministry teams' },
      { value: 'ministries.write', label: 'Manage ministries', description: 'Create and update ministries' },
    ],
  },
  {
    group: 'Satellites',
    permissions: [
      { value: 'satellites.read', label: 'View satellites', description: 'View satellite locations' },
      { value: 'satellites.write', label: 'Manage satellites', description: 'Add, edit, and toggle satellites' },
    ],
  },
  {
    group: 'Finances',
    permissions: [
      { value: 'finances.read', label: 'View finances', description: 'View financial data (finance PIN still required)' },
      { value: 'finances.write', label: 'Manage finances', description: 'Record and edit transactions' },
    ],
  },
  {
    group: 'Inventory',
    permissions: [
      { value: 'inventory.read', label: 'View inventory', description: 'View inventory items' },
      { value: 'inventory.write', label: 'Manage inventory', description: 'Add and edit inventory' },
    ],
  },
  {
    group: 'Service Attendance',
    permissions: [
      { value: 'registration.read', label: 'View attendance', description: 'View service attendance and analytics' },
      { value: 'registration.write', label: 'Manage attendance', description: 'Run sessions and record check-ins' },
    ],
  },
  {
    group: 'Analytics & AI',
    permissions: [
      { value: 'analytics.read', label: 'View analytics', description: 'View dashboards and reports' },
      { value: 'ai.generate', label: 'Use AI insights', description: 'Generate AI-powered insights' },
    ],
  },
  {
    group: 'Administration',
    permissions: [
      { value: 'users.manage', label: 'Manage users', description: 'Invite users and change roles' },
      { value: 'roles.manage', label: 'Manage roles', description: 'Edit role permissions' },
    ],
  },
]

// Every individually-assignable permission (excludes the '*' wildcard).
export const ALL_PERMISSIONS: Permission[] = PERMISSION_CATALOG.flatMap((g) =>
  g.permissions.map((p) => p.value),
)

// Finance PIN rules (per-user, server-verified).
export const FINANCE_PIN_MIN_LENGTH = 4
export const FINANCE_PIN_MAX_LENGTH = 12

// ============================================
// SERVICE ATTENDANCE
// ============================================

// Seed service slugs (must match the seeded rows in
// supabase/2026-07-17_service_attendance.sql). Admins can add more at runtime.
export const SERVICE_SLUGS = ['sunday', 'young-pro', 'youth', 'dawn-prayerworks'] as const
export type ServiceSlug = (typeof SERVICE_SLUGS)[number]

// Trigram similarity cutoff for suggesting a member from a typed name.
// Names scoring above this appear in the admin match queue as candidates.
export const MATCH_SIMILARITY_THRESHOLD = 0.3

// Human labels for attendance enums.
export const CHECKIN_METHOD_LABELS: Record<string, string> = {
  qr_self: 'QR (self)',
  qr_guest: 'QR (guest)',
  manual: 'Manual',
}

export const MATCH_STATUS_LABELS: Record<string, string> = {
  auto_matched: 'Auto-matched',
  pending: 'Needs review',
  confirmed: 'Confirmed',
  new_member: 'New member',
  ignored: 'Ignored',
}

// A check-in counts toward attendance stats unless it was explicitly ignored.
export const COUNTED_MATCH_STATUSES = ['auto_matched', 'pending', 'confirmed', 'new_member'] as const

// Build the public check-in URL for a session QR token. Uses the current origin
// in the browser; falls back to a relative path on the server.
export function buildCheckinUrl(qrToken: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/checkin/${qrToken}`
}

// ============================================
// EXPENSE REPORT REQUESTS
// ============================================

export const EXPENSE_REPORT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending review',
  released: 'Released',
  rejected: 'Rejected',
}

export const EXPENSE_REPORT_STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  released: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
}
