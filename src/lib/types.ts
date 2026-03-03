// Quest Laguna Directory System - TypeScript Types

// ============================================
// ENUMS AND CONSTANTS
// ============================================

export type DiscipleshipStage = 'Newbie' | 'Growing' | 'Leader'
export type EventMemberStatus = 'First Timer' | 'Newbie' | 'Regular' | 'Leader'
export type MembershipStatus = 'visitor' | 'regular' | 'active' | 'inactive'
export type SpiritualSentiment = 'struggling' | 'stable' | 'thriving'
export type Gender = 'male' | 'female'
export type UserRole = 'super_admin' | 'satellite_leader' | 'cell_leader' | 'member'
export type CellGroupRole = 'leader' | 'co_leader' | 'member'
export type MinistryRole = 'head' | 'coordinator' | 'volunteer'
export type MeetingDay = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'
export type CivilStatus = 'single' | 'married' | 'widowed'
export type MemberCategory = 'Kid' | 'Student' | 'Young Pro' | 'Mother' | 'Father'
export type FollowThrough = 'Salvation' | 'Prayer' | 'Bible and Devotion' | 'Transformation' | 'Cell and Church'
export type DiscipleshipJourney = 'Consolidations' | 'Pre Encounter' | 'Encounter' | 'Post-Encounter' | 'SOD1' | 'SOD2' | 'SOD3' | 'QBS Theology 101' | 'QBS Preaching 101'
export type LeadershipLevel = 'Member' | 'Disciple Maker' | 'Eagle' | 'Pastor' | 'Head Pastor'

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
  is_active?: boolean
}

export interface MinistryUpdate {
  name?: string
  description?: string | null
  department?: string | null
  head_id?: string | null
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
// EVENTS
// ============================================

export interface Event {
  id: string
  name: string
  description: string | null
  event_date: string
  event_time: string | null
  location: string | null
  expected_attendees: number
  early_bird_cutoff: string | null
  registration_open: boolean
  is_active: boolean
  banner_url: string | null
  registration_start: string | null
  registration_end: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EventInsert {
  id?: string
  name: string
  description?: string | null
  event_date: string
  event_time?: string | null
  location?: string | null
  expected_attendees?: number
  early_bird_cutoff?: string | null
  registration_open?: boolean
  is_active?: boolean
  banner_url?: string | null
  registration_start?: string | null
  registration_end?: string | null
}

export interface EventUpdate {
  name?: string
  description?: string | null
  event_date?: string
  event_time?: string | null
  location?: string | null
  expected_attendees?: number
  early_bird_cutoff?: string | null
  registration_open?: boolean
  is_active?: boolean
  banner_url?: string | null
  registration_start?: string | null
  registration_end?: string | null
}

export interface EventWithStats extends Event {
  registration_count: number
  early_bird_count: number
}

// ============================================
// EVENT REGISTRATIONS (preserved for events)
// ============================================

export interface EventRegistration {
  id: string
  event_id: string | null
  member_id: string | null
  name: string
  email: string | null
  contact_number: string | null
  age: number
  city: string
  satellite: string
  member_status: EventMemberStatus
  invited_by: string | null
  discipleship_stage: DiscipleshipStage | null
  spiritual_description: string | null
  spiritual_score: number | null
  spiritual_sentiment: SpiritualSentiment | null
  needs_support: boolean
  event_name: string
  registered_at: string
  created_at: string
}

export interface EventRegistrationInsert {
  id?: string
  event_id?: string | null
  member_id?: string | null
  name: string
  email?: string | null
  contact_number?: string | null
  age: number
  city: string
  satellite: string
  member_status?: EventMemberStatus
  invited_by?: string | null
  discipleship_stage?: DiscipleshipStage | null
  spiritual_description?: string | null
  event_name?: string
}

// Legacy aliases for backwards compatibility
export type Attendee = EventRegistration
export type AttendeeInsert = EventRegistrationInsert
export type AttendeeUpdate = Partial<EventRegistrationInsert>

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

export interface RegistrationTimeline {
  date: string
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
  | 'members.read'
  | 'members.read.public'
  | 'members.write'
  | 'members.write.self'
  | 'members.write.own_group'
  | 'members.delete'
  | 'cell_groups.read'
  | 'cell_groups.write'
  | 'cell_groups.write.own'
  | 'cell_groups.delete'
  | 'ministries.read'
  | 'ministries.write'
  | 'ministries.delete'
  | 'analytics.read'
  | 'ai.generate'
  | 'users.manage'
  | '*'

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: ['*'],
  satellite_leader: [
    'members.read', 'members.write', 'members.delete',
    'cell_groups.read', 'cell_groups.write', 'cell_groups.delete',
    'ministries.read', 'ministries.write',
    'analytics.read', 'ai.generate'
  ],
  cell_leader: [
    'members.read', 'members.write.own_group',
    'cell_groups.read', 'cell_groups.write.own',
    'ministries.read'
  ],
  member: [
    'members.read.public', 'members.write.self',
    'cell_groups.read', 'ministries.read'
  ]
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
      event_registrations: {
        Row: EventRegistration
        Insert: EventRegistrationInsert
        Update: Partial<EventRegistrationInsert>
      }
    }
  }
}
