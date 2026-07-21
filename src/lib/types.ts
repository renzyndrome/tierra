// Quest Laguna Directory System - TypeScript Types

// ============================================
// ENUMS AND CONSTANTS
// ============================================

export type DiscipleshipStage = 'Newbie' | 'Growing' | 'Leader'
export type EventMemberStatus = 'First Timer' | 'Newbie' | 'Regular' | 'Leader'
export type MembershipStatus = 'visitor' | 'regular' | 'active' | 'inactive'
export type SpiritualSentiment = 'struggling' | 'stable' | 'thriving'
export type Gender = 'male' | 'female'
// Account roles. `member` is the default/basic role assigned on signup.
// admin = full access; the others are domain-scoped (see ROLE_PERMISSIONS).
export type UserRole = 'admin' | 'finance' | 'satellite' | 'registration' | 'discipleship' | 'member'
export type CellGroupRole = 'leader' | 'co_leader' | 'member'
export type MinistryRole = 'head' | 'coordinator' | 'volunteer'
export type MeetingDay = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
export type CivilStatus = 'single' | 'married' | 'widowed'
export type MemberCategory = 'Kid' | 'Student' | 'Young Pro' | 'Mother' | 'Father'
export type FollowThrough = 'Salvation' | 'Prayer' | 'Bible and Devotion' | 'Transformation' | 'Cell and Church'
export type DiscipleshipJourney = 'Consolidations' | 'Pre Encounter' | 'Encounter' | 'Post-Encounter' | 'SOD1' | 'SOD2' | 'SOD3' | 'Bible School' | 'QBS Theology 101' | 'QBS Preaching 101'
export type LeadershipLevel = 'Member' | 'Disciple Maker' | 'Eagle' | 'Pastor' | 'Head Pastor'
export type InventoryLocation = 'Moriah Hall' | 'Nxtgen Hall'
export type InventoryCondition = 'Good' | 'Fair' | 'Needs Repair' | 'Damaged'

// ============================================
// SATELLITE TYPES
// ============================================

export interface Satellite {
  id: string
  name: string
  description: string | null
  address: string | null
  pastor_id: string | null
  contact_email: string | null
  contact_phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SatelliteInsert {
  id?: string
  name: string
  description?: string | null
  address?: string | null
  pastor_id?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  is_active?: boolean
}

export interface SatelliteUpdate {
  name?: string
  description?: string | null
  address?: string | null
  pastor_id?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  is_active?: boolean
}

// Legacy alias for existing code compatibility
export type SatelliteRecord = Satellite

// Simple satellite row from old satellites table (for backwards compatibility)
export interface SatelliteRow {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

// ============================================
// MEMBER TYPES
// ============================================

export interface Member {
  id: string
  // Basic Info
  name: string
  email: string | null
  phone: string | null
  age: number | null
  birthday: string | null
  gender: Gender | null
  city: string
  address: string | null
  // Church Relationship
  satellite_id: string | null
  discipleship_stage: DiscipleshipStage
  membership_status: MembershipStatus
  joined_date: string | null
  // Profile
  photo_url: string | null
  bio: string | null
  spiritual_description: string | null
  prayer_needs: string | null
  // AI Fields
  spiritual_score: number | null
  spiritual_sentiment: SpiritualSentiment | null
  needs_support: boolean
  // Emergency Contact
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  // Church Extended Fields
  civil_status: CivilStatus | null
  spouse_name: string | null
  wedding_anniversary: string | null
  num_children: number | null
  member_category: MemberCategory | null
  discipler_id: string | null
  follow_through: FollowThrough | null
  discipleship_journey: DiscipleshipJourney | null
  leadership_level: LeadershipLevel
  spiritual_name: string | null
  is_vision_keeper: boolean
  is_full_time: boolean
  community: string | null
  facebook_url: string | null
  // Meta
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface MemberInsert {
  id?: string
  name: string
  email?: string | null
  phone?: string | null
  age?: number | null
  birthday?: string | null
  gender?: Gender | null
  city: string
  address?: string | null
  satellite_id?: string | null
  discipleship_stage: DiscipleshipStage
  membership_status?: MembershipStatus
  joined_date?: string | null
  photo_url?: string | null
  bio?: string | null
  spiritual_description?: string | null
  prayer_needs?: string | null
  spiritual_score?: number | null
  spiritual_sentiment?: SpiritualSentiment | null
  needs_support?: boolean
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  civil_status?: CivilStatus | null
  spouse_name?: string | null
  wedding_anniversary?: string | null
  num_children?: number | null
  member_category?: MemberCategory | null
  discipler_id?: string | null
  follow_through?: FollowThrough | null
  discipleship_journey?: DiscipleshipJourney | null
  leadership_level?: LeadershipLevel
  spiritual_name?: string | null
  is_vision_keeper?: boolean
  is_full_time?: boolean
  community?: string | null
  facebook_url?: string | null
  is_archived?: boolean
}

export interface MemberUpdate {
  name?: string
  email?: string | null
  phone?: string | null
  age?: number | null
  birthday?: string | null
  gender?: Gender | null
  city?: string
  address?: string | null
  satellite_id?: string | null
  discipleship_stage?: DiscipleshipStage
  membership_status?: MembershipStatus
  joined_date?: string | null
  photo_url?: string | null
  bio?: string | null
  spiritual_description?: string | null
  prayer_needs?: string | null
  spiritual_score?: number | null
  spiritual_sentiment?: SpiritualSentiment | null
  needs_support?: boolean
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  civil_status?: CivilStatus | null
  spouse_name?: string | null
  wedding_anniversary?: string | null
  num_children?: number | null
  member_category?: MemberCategory | null
  discipler_id?: string | null
  follow_through?: FollowThrough | null
  discipleship_journey?: DiscipleshipJourney | null
  leadership_level?: LeadershipLevel
  spiritual_name?: string | null
  is_vision_keeper?: boolean
  is_full_time?: boolean
  community?: string | null
  facebook_url?: string | null
  is_archived?: boolean
}

// Member with relations
export interface MemberWithRelations extends Member {
  satellite?: Satellite | null
  cell_groups?: CellGroupMembership[]
  ministries?: MinistryMembership[]
}

// ============================================
// USER PROFILE TYPES (Auth)
// ============================================

export interface UserProfile {
  id: string
  member_id: string | null
  role: UserRole
  satellite_id: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface UserProfileInsert {
  id: string
  member_id?: string | null
  role?: UserRole
  satellite_id?: string | null
  is_active?: boolean
}

export interface UserProfileUpdate {
  member_id?: string | null
  role?: UserRole
  satellite_id?: string | null
  is_active?: boolean
  last_login_at?: string | null
}

// User with member data
export interface UserWithMember extends UserProfile {
  member?: Member | null
  satellite?: Satellite | null
}

// ============================================
// ACCOUNT MANAGEMENT TYPES (invites, roles, permissions)
// ============================================

// One row of the editable role -> permission matrix (role_permissions table).
export interface RolePermission {
  role: UserRole
  permission: string
  created_at: string
}

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export interface UserInvitation {
  id: string
  email: string
  role: UserRole
  satellite_id: string | null
  invited_by: string | null
  invited_user_id: string | null
  status: InvitationStatus
  created_at: string
  accepted_at: string | null
  updated_at: string
}

// Flattened user row for the admin Users table (profile + auth email + member name).
export interface AdminUserListItem {
  id: string
  email: string | null
  role: UserRole
  satellite_id: string | null
  satellite_name: string | null
  member_id: string | null
  member_name: string | null
  is_active: boolean
  last_login_at: string | null
  created_at: string
  has_finance_pin: boolean
}

// ============================================
// CELL GROUP TYPES
// ============================================

export interface CellGroup {
  id: string
  name: string
  description: string | null
  satellite_id: string | null
  leader_id: string | null
  co_leader_id: string | null
  meeting_day: MeetingDay | null
  meeting_time: string | null
  meeting_location: string | null
  banner_url: string | null
  is_active: boolean
  max_members: number
  created_at: string
  updated_at: string
}

export interface CellGroupInsert {
  id?: string
  name: string
  description?: string | null
  satellite_id?: string | null
  leader_id?: string | null
  co_leader_id?: string | null
  meeting_day?: MeetingDay | null
  meeting_time?: string | null
  meeting_location?: string | null
  banner_url?: string | null
  is_active?: boolean
  max_members?: number
}

export interface CellGroupUpdate {
  name?: string
  description?: string | null
  satellite_id?: string | null
  leader_id?: string | null
  co_leader_id?: string | null
  meeting_day?: MeetingDay | null
  meeting_time?: string | null
  meeting_location?: string | null
  banner_url?: string | null
  is_active?: boolean
  max_members?: number
}

// Cell group with relations
export interface CellGroupWithRelations extends CellGroup {
  satellite?: Satellite | null
  leader?: Member | null
  co_leader?: Member | null
  members?: MemberCellGroup[]
  member_count?: number
}

// ============================================
// MEMBER CELL GROUPS JUNCTION
// ============================================

export interface MemberCellGroup {
  id: string
  member_id: string
  cell_group_id: string
  role: CellGroupRole
  joined_at: string
  left_at: string | null
  is_active: boolean
}

export interface MemberCellGroupInsert {
  id?: string
  member_id: string
  cell_group_id: string
  role?: CellGroupRole
  joined_at?: string
  is_active?: boolean
}

// Membership view (for member's perspective)
export interface CellGroupMembership {
  cell_group: CellGroup
  role: CellGroupRole
  joined_at: string
  is_active: boolean
}

// ============================================
// MINISTRY TYPES
// ============================================

export interface Ministry {
  id: string
  name: string
  description: string | null
  department: string | null
  head_id: string | null
  photo_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MinistryInsert {
  id?: string
  name: string
  description?: string | null
  department?: string | null
  head_id?: string | null
  photo_url?: string | null
  is_active?: boolean
}

export interface MinistryUpdate {
  name?: string
  description?: string | null
  department?: string | null
  head_id?: string | null
  photo_url?: string | null
  is_active?: boolean
}

// Ministry with relations
export interface MinistryWithRelations extends Ministry {
  head?: Member | null
  members?: MemberMinistry[]
  member_count?: number
}

// ============================================
// MEMBER MINISTRIES JUNCTION
// ============================================

export interface MemberMinistry {
  id: string
  member_id: string
  ministry_id: string
  role: MinistryRole
  joined_at: string
  left_at: string | null
  is_active: boolean
}

export interface MemberMinistryInsert {
  id?: string
  member_id: string
  ministry_id: string
  role?: MinistryRole
  joined_at?: string
  is_active?: boolean
}

// Membership view (for member's perspective)
export interface MinistryMembership {
  ministry: Ministry
  role: MinistryRole
  joined_at: string
  is_active: boolean
}

// ============================================
// FUN FACTS (preserved)
// ============================================

export interface FunFact {
  id: string
  content: string
  is_active: boolean
  created_at: string
}

export type FunFactRecord = FunFact

// ============================================
// DASHBOARD & ANALYTICS TYPES
// ============================================

export interface DashboardStats {
  total: number
  bySatellite: Record<string, number>
  byStage: Record<DiscipleshipStage, number>
  byStatus: Record<MembershipStatus, number>
  averageAge: number
  needsSupportCount: number
  // Directory-specific
  totalCellGroups: number
  totalMinistries: number
}

export interface AgeDistribution {
  bucket: string
  count: number
}

// ============================================
// AI ANALYSIS TYPES
// ============================================

export interface SpiritualAnalysis {
  spiritual_score: number
  spiritual_sentiment: SpiritualSentiment
  needs_support: boolean
  key_themes: string[]
}

export interface MentorMatch {
  mentor: Member
  score: number
  reasons: string[]
}

export interface OverallInsights {
  summary: string
  overallSentiment: SpiritualSentiment
  keyThemes: string[]
  strengthAreas: string[]
  concernAreas: string[]
  actionItems: string[]
  mentorshipSuggestions: MentorshipSuggestion[]
  generatedAt: string
  stats: {
    totalMembers: number
    newbies: { name: string; satellite: string }[]
    leaders: { name: string; satellite: string }[]
    satelliteRanking: { satellite: string; count: number }[]
  }
}

export interface MentorshipSuggestion {
  newbie: string
  suggestedMentor: string
  reason: string
}

// ============================================
// SEARCH & PAGINATION TYPES
// ============================================

export interface SearchParams {
  query?: string
  satelliteId?: string
  cellGroupId?: string
  ministryId?: string
  discipleshipStage?: DiscipleshipStage
  membershipStatus?: MembershipStatus
  page?: number
  limit?: number
  sortBy?: 'name' | 'joined_date' | 'created_at'
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ============================================
// AUTH CONTEXT TYPES
// ============================================

export interface AuthContext {
  user: AuthUser | null
  profile: UserProfile | null
  member: Member | null
  isLoading: boolean
  isAuthenticated: boolean
}

export interface AuthUser {
  id: string
  email: string
  created_at: string
}

// ============================================
// PERMISSION TYPES
// ============================================

export type Permission =
  | '*'
  // members
  | 'members.read'
  | 'members.read.public'
  | 'members.write'
  | 'members.write.self'
  | 'members.write.own_group'
  | 'members.delete'
  // quest circles (cell groups)
  | 'cell_groups.read'
  | 'cell_groups.write'
  | 'cell_groups.write.own'
  | 'cell_groups.delete'
  // ministries
  | 'ministries.read'
  | 'ministries.write'
  | 'ministries.delete'
  // satellites
  | 'satellites.read'
  | 'satellites.write'
  // finances
  | 'finances.read'
  | 'finances.write'
  // inventory
  | 'inventory.read'
  | 'inventory.write'
  // sunday registration (future module)
  | 'registration.read'
  | 'registration.write'
  // analytics / ai
  | 'analytics.read'
  | 'ai.generate'
  // account administration
  | 'users.manage'
  | 'roles.manage'

// Default role -> permissions. This is the code fallback; the editable
// `role_permissions` table in Supabase is the runtime source of truth and
// overrides these when present. Keep in sync with the seed in
// supabase/2026-07-16_account_management.sql.
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: ['*'],
  finance: ['finances.read', 'finances.write', 'analytics.read'],
  satellite: [
    'satellites.read', 'satellites.write',
    'members.read',
    'inventory.read', 'inventory.write',
    'analytics.read',
  ],
  registration: ['registration.read', 'registration.write', 'members.read'],
  discipleship: [
    'members.read', 'members.write',
    'cell_groups.read', 'cell_groups.write',
    'ministries.read', 'ministries.write',
    'analytics.read',
  ],
  member: ['members.read.public'],
}

// ============================================
// FINANCIAL TYPES
// ============================================

export type TransactionType = 'income' | 'expense'
export type IncomeCategory = 'Tithe' | 'Offering' | 'Missions'
export type ExpenseCategory = 'Utilities' | 'Supplies' | 'Equipment' | 'Events' | 'Programs'
export type FinancialCategory = IncomeCategory | ExpenseCategory

export interface FinancialTransaction {
  id: string
  transaction_date: string
  transaction_type: TransactionType
  category: FinancialCategory
  amount: number
  description: string | null
  reference_number: string | null
  satellite_id: string
  member_id: string | null
  recorded_by: string | null
  receipt_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinancialTransactionInsert {
  transaction_date: string
  transaction_type: TransactionType
  category: FinancialCategory
  amount: number
  description?: string | null
  reference_number?: string | null
  satellite_id: string
  member_id?: string | null
  receipt_url?: string | null
  notes?: string | null
}

export interface FinancialTransactionUpdate {
  transaction_date?: string
  transaction_type?: TransactionType
  category?: FinancialCategory
  amount?: number
  description?: string | null
  reference_number?: string | null
  satellite_id?: string
  member_id?: string | null
  receipt_url?: string | null
  notes?: string | null
}

export interface FinancialTransactionWithRelations extends FinancialTransaction {
  satellite?: { id: string; name: string } | null
  member?: { id: string; name: string } | null
}

export interface FinancialOverview {
  currentBalance: number
  totalIncome: number
  totalExpenses: number
  incomeByCategory: Record<string, number>
  expensesByCategory: Record<string, number>
  bySatellite: {
    satelliteId: string
    satelliteName: string
    income: number
    expenses: number
    balance: number
  }[]
  recentTransactions: FinancialTransactionWithRelations[]
}

// ---- Member self-service: personal giving / Statement of Account ----
// A member's own contribution history (tithes / offerings / missions recorded
// against their member_id). Read-only; resolved server-side from the caller's
// linked member so a member can only ever see their own giving.

export interface MemberGivingEntry {
  id: string
  transaction_date: string
  category: FinancialCategory
  amount: number
  reference_number: string | null
  description: string | null
  satellite_name: string | null
}

export interface MemberGivingCategoryTotal {
  category: string
  amount: number
  count: number
}

export interface MemberGivingStatement {
  member: { id: string; name: string }
  totalGiven: number
  giftCount: number
  byCategory: MemberGivingCategoryTotal[]
  firstGiftDate: string | null
  lastGiftDate: string | null
  // The date range this statement was generated for (nulls = unbounded / all time).
  range: { startDate: string | null; endDate: string | null }
  entries: MemberGivingEntry[]
}

// ---- Church expense report requests (member request -> finance release) ----
// Members can request a church expense report for a period; finance reviews and
// releases (or rejects) it. A released report exposes an AGGREGATE expense
// summary (by category), never per-transaction line items.

export type ExpenseReportStatus = 'pending' | 'released' | 'rejected'

export interface ExpenseReportRequest {
  id: string
  requested_by: string
  member_id: string | null
  period_start: string
  period_end: string
  status: ExpenseReportStatus
  note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

// Enriched row for the finance review queue.
export interface ExpenseReportRequestWithRequester extends ExpenseReportRequest {
  requester_email: string | null
  requester_name: string | null
}

// The aggregate expense summary a released report exposes.
export interface ExpenseReportSummary {
  request_id: string
  period_start: string
  period_end: string
  totalExpenses: number
  byCategory: { category: string; amount: number; count: number }[]
  bySatellite: { satellite_name: string; amount: number }[]
}

// ============================================
// INVENTORY TYPES
// ============================================

export interface InventoryCategory {
  id: string
  name: string
  created_at: string
}

export interface InventoryItem {
  id: string
  name: string
  description: string | null
  location: InventoryLocation
  quantity: number
  photo_url: string | null
  category: string | null
  condition: InventoryCondition
  date_purchased: string | null
  created_at: string
  updated_at: string
}

export interface InventoryItemInsert {
  id?: string
  name: string
  description?: string | null
  location: InventoryLocation
  quantity?: number
  photo_url?: string | null
  category?: string | null
  condition?: InventoryCondition
  date_purchased?: string | null
}

export interface InventoryItemUpdate {
  name?: string
  description?: string | null
  location?: InventoryLocation
  quantity?: number
  photo_url?: string | null
  category?: string | null
  condition?: InventoryCondition
  date_purchased?: string | null
  updated_at?: string
}

// ---- Maintenance logs -------------------------------------------------------

export type MaintenanceType =
  | 'Cleaning'
  | 'Repair'
  | 'Inspection'
  | 'Servicing'
  | 'Calibration'
  | 'Other'

export interface InventoryMaintenanceLog {
  id: string
  item_id: string
  maintenance_date: string
  maintenance_type: MaintenanceType
  description: string | null
  performed_by: string | null
  cost: number | null
  next_due_date: string | null
  logged_by: string | null
  created_at: string
  updated_at: string
}

export interface InventoryMaintenanceLogInsert {
  item_id: string
  maintenance_date: string
  maintenance_type?: MaintenanceType
  description?: string | null
  performed_by?: string | null
  cost?: number | null
  next_due_date?: string | null
}

// ---- Borrow / deployment requests -------------------------------------------

// Where a checked-out unit is deployed. 'internal' = stays on campus.
export type BorrowDestinationType = 'internal' | 'satellite' | 'outreach' | 'personal'

export type BorrowStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'checked_out'
  | 'returned'
  | 'cancelled'

export interface InventoryBorrowRequest {
  id: string
  item_id: string
  quantity: number
  borrower_member_id: string | null
  borrower_name: string | null
  requested_by: string | null
  ministry_id: string | null
  destination_type: BorrowDestinationType
  destination_satellite_id: string | null
  destination_detail: string | null
  purpose: string | null
  status: BorrowStatus
  condition_before: InventoryCondition | null
  condition_after: InventoryCondition | null
  borrow_date: string | null
  expected_return_date: string | null
  checked_out_at: string | null
  returned_at: string | null
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Read shape with the item / borrower / ministry / satellite joined in.
export interface InventoryBorrowRequestWithRelations extends InventoryBorrowRequest {
  item?: Pick<InventoryItem, 'id' | 'name' | 'location' | 'photo_url'> | null
  borrower?: { id: string; name: string; photo_url: string | null } | null
  ministry?: { id: string; name: string } | null
  destination_satellite?: { id: string; name: string } | null
}

export interface InventoryBorrowRequestInsert {
  item_id: string
  quantity?: number
  borrower_member_id?: string | null
  borrower_name?: string | null
  ministry_id?: string | null
  destination_type: BorrowDestinationType
  destination_satellite_id?: string | null
  destination_detail?: string | null
  purpose?: string | null
  borrow_date?: string | null
  expected_return_date?: string | null
  notes?: string | null
}

// ============================================
// SERVICE ATTENDANCE TYPES
// ============================================

export type CheckinMethod = 'qr_self' | 'qr_guest' | 'manual'
export type MatchStatus = 'auto_matched' | 'pending' | 'confirmed' | 'new_member' | 'ignored'

export interface ServiceType {
  id: string
  name: string
  slug: string
  default_day: MeetingDay | null
  default_time: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ServiceTypeInsert {
  id?: string
  name: string
  slug: string
  default_day?: MeetingDay | null
  default_time?: string | null
  sort_order?: number
  is_active?: boolean
}

export interface ServiceTypeUpdate {
  name?: string
  slug?: string
  default_day?: MeetingDay | null
  default_time?: string | null
  sort_order?: number
  is_active?: boolean
}

export interface ServiceSession {
  id: string
  service_type_id: string
  session_date: string
  satellite_id: string | null
  title: string | null
  qr_token: string
  is_open: boolean
  opened_at: string | null
  closed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ServiceSessionInsert {
  id?: string
  service_type_id: string
  session_date: string
  satellite_id?: string | null
  title?: string | null
  qr_token?: string
  is_open?: boolean
  created_by?: string | null
}

export interface ServiceSessionUpdate {
  session_date?: string
  satellite_id?: string | null
  title?: string | null
  is_open?: boolean
  closed_at?: string | null
}

export interface ServiceSessionWithRelations extends ServiceSession {
  service_type?: ServiceType | null
  satellite?: { id: string; name: string } | null
  checkin_count?: number
  pending_count?: number
}

export interface AttendanceRecord {
  id: string
  session_id: string
  member_id: string | null
  raw_name: string | null
  raw_phone: string | null
  invited_by: string | null
  checkin_method: CheckinMethod
  match_status: MatchStatus
  matched_by: string | null
  note: string | null
  checked_in_at: string
  created_at: string
}

export interface AttendanceRecordInsert {
  id?: string
  session_id: string
  member_id?: string | null
  raw_name?: string | null
  raw_phone?: string | null
  invited_by?: string | null
  checkin_method?: CheckinMethod
  match_status?: MatchStatus
  matched_by?: string | null
  note?: string | null
}

export interface AttendanceRecordUpdate {
  member_id?: string | null
  match_status?: MatchStatus
  matched_by?: string | null
  note?: string | null
}

export interface AttendanceRecordWithMember extends AttendanceRecord {
  member?: { id: string; name: string; satellite_id: string | null } | null
}

// A candidate member suggestion from the fuzzy matcher (search_members_similar RPC).
export interface MatchCandidate {
  id: string
  name: string
  satellite_id: string | null
  phone: string | null
  sim: number
}

// A pending attendance record plus recomputed suggestions for the admin queue.
export interface PendingMatch {
  record: AttendanceRecordWithMember
  candidates: MatchCandidate[]
}

// Member-facing attendance history entry.
export interface MemberAttendanceEntry {
  record_id: string
  session_id: string
  session_date: string
  service_name: string
  service_slug: string
  satellite_name: string | null
  checked_in_at: string
  checkin_method: CheckinMethod
}

export interface MemberAttendanceSummary {
  totalCheckins: number
  byService: { service_slug: string; service_name: string; count: number }[]
  recent: MemberAttendanceEntry[]
}

// Aggregated attendance analytics for the admin dashboard.
export interface AttendanceStats {
  totalCheckins: number
  matchedCheckins: number
  pendingCount: number
  uniqueMembers: number
  byService: { service_slug: string; service_name: string; count: number }[]
  bySatellite: { satellite_id: string | null; satellite_name: string; count: number }[]
  trend: {
    session_id: string
    session_date: string
    service_slug: string
    service_name: string
    count: number
    first_timers: number
  }[]
  topAttendees: { member_id: string; name: string; count: number }[]
}

// Result of the check-in matching engine (returned to the public check-in UI).
export interface CheckinResult {
  status: 'checked_in' | 'already_checked_in'
  matched: boolean
  displayName: string | null
  recordId: string
}

// ============================================
// SUPABASE DATABASE TYPE (for type-safe queries)
// ============================================

export type Database = {
  public: {
    Tables: {
      satellites: {
        Row: Satellite
        Insert: SatelliteInsert
        Update: SatelliteUpdate
      }
      members: {
        Row: Member
        Insert: MemberInsert
        Update: MemberUpdate
      }
      user_profiles: {
        Row: UserProfile
        Insert: UserProfileInsert
        Update: UserProfileUpdate
      }
      cell_groups: {
        Row: CellGroup
        Insert: CellGroupInsert
        Update: CellGroupUpdate
      }
      member_cell_groups: {
        Row: MemberCellGroup
        Insert: MemberCellGroupInsert
        Update: Partial<MemberCellGroupInsert>
      }
      ministries: {
        Row: Ministry
        Insert: MinistryInsert
        Update: MinistryUpdate
      }
      member_ministries: {
        Row: MemberMinistry
        Insert: MemberMinistryInsert
        Update: Partial<MemberMinistryInsert>
      }
      fun_facts: {
        Row: FunFact
        Insert: { content: string; is_active?: boolean }
        Update: { content?: string; is_active?: boolean }
      }
      financial_transactions: {
        Row: FinancialTransaction
        Insert: FinancialTransactionInsert
        Update: FinancialTransactionUpdate
      }
      inventory_items: {
        Row: InventoryItem
        Insert: InventoryItemInsert
        Update: InventoryItemUpdate
      }
      inventory_categories: {
        Row: InventoryCategory
        Insert: { name: string }
        Update: { name?: string }
      }
      role_permissions: {
        Row: RolePermission
        Insert: { role: UserRole; permission: string }
        Update: { role?: UserRole; permission?: string }
      }
      user_invitations: {
        Row: UserInvitation
        Insert: {
          email: string
          role: UserRole
          satellite_id?: string | null
          invited_by?: string | null
          invited_user_id?: string | null
          status?: InvitationStatus
        }
        Update: {
          role?: UserRole
          satellite_id?: string | null
          invited_user_id?: string | null
          status?: InvitationStatus
          accepted_at?: string | null
        }
      }
      user_finance_pins: {
        Row: { user_id: string; pin_hash: string; set_at: string; updated_at: string }
        Insert: { user_id: string; pin_hash: string }
        Update: { pin_hash?: string }
      }
      service_types: {
        Row: ServiceType
        Insert: ServiceTypeInsert
        Update: ServiceTypeUpdate
      }
      service_sessions: {
        Row: ServiceSession
        Insert: ServiceSessionInsert
        Update: ServiceSessionUpdate
      }
      attendance_records: {
        Row: AttendanceRecord
        Insert: AttendanceRecordInsert
        Update: AttendanceRecordUpdate
      }
      inventory_maintenance_logs: {
        Row: InventoryMaintenanceLog
        Insert: InventoryMaintenanceLogInsert & { logged_by?: string | null }
        Update: Partial<InventoryMaintenanceLog>
      }
      inventory_borrow_requests: {
        Row: InventoryBorrowRequest
        Insert: InventoryBorrowRequestInsert & {
          requested_by?: string | null
          status?: BorrowStatus
        }
        Update: Partial<InventoryBorrowRequest>
      }
    }
  }
}
