// Test data factories for creating mock data

import type {
  Member,
  Satellite,
  SatelliteRow,
  CellGroup,
  Ministry,
  UserProfile,
  MemberCellGroup,
  MemberMinistry,
  EventRegistration,
  FunFact
} from '../lib/types'

// ============================================
// SATELLITE FACTORIES
// ============================================

let satelliteCounter = 0
export function createMockSatellite(overrides?: Partial<Satellite>): Satellite {
  satelliteCounter++
  return {
    id: `satellite-${satelliteCounter}`,
    name: `Quest Test Satellite ${satelliteCounter}`,
    description: 'Test satellite description',
    address: '123 Test Street',
    pastor_id: null,
    contact_email: `satellite${satelliteCounter}@test.com`,
    contact_phone: '09171234567',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockSatelliteRow(overrides?: Partial<SatelliteRow>): SatelliteRow {
  satelliteCounter++
  return {
    id: `satellite-${satelliteCounter}`,
    name: `Quest Test Satellite ${satelliteCounter}`,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================
// MEMBER FACTORIES
// ============================================

let memberCounter = 0
export function createMockMember(overrides?: Partial<Member>): Member {
  memberCounter++
  return {
    id: `member-${memberCounter}`,
    name: `Test Member ${memberCounter}`,
    email: `member${memberCounter}@test.com`,
    phone: `09171234${String(memberCounter).padStart(3, '0')}`,
    age: 25 + (memberCounter % 30),
    birthday: '1998-05-15',
    gender: memberCounter % 2 === 0 ? 'male' : 'female',
    city: 'Test City',
    address: '123 Test Street',
    satellite_id: 'satellite-1',
    discipleship_stage: ['Newbie', 'Growing', 'Leader'][memberCounter % 3] as 'Newbie' | 'Growing' | 'Leader',
    membership_status: 'active',
    joined_date: '2023-01-15',
    photo_url: null,
    bio: 'Test member bio',
    spiritual_description: 'My spiritual journey is growing daily.',
    prayer_needs: 'Please pray for my family.',
    spiritual_score: 7.5,
    spiritual_sentiment: 'stable',
    needs_support: false,
    emergency_contact_name: 'Emergency Contact',
    emergency_contact_phone: '09179876543',
    is_archived: false,
    civil_status: null,
    spouse_name: null,
    wedding_anniversary: null,
    num_children: null,
    member_category: null,
    discipler_id: null,
    follow_through: null,
    discipleship_journey: null,
    leadership_level: 'Member',
    spiritual_name: null,
    is_vision_keeper: false,
    is_full_time: false,
    community: null,
    facebook_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockMemberInsert(overrides?: Partial<Member>) {
  const member = createMockMember(overrides)
  const { id, created_at, updated_at, spiritual_score, spiritual_sentiment, needs_support, is_archived, ...insert } = member
  return insert
}

// ============================================
// CELL GROUP FACTORIES
// ============================================

let cellGroupCounter = 0
export function createMockCellGroup(overrides?: Partial<CellGroup>): CellGroup {
  cellGroupCounter++
  return {
    id: `cell-group-${cellGroupCounter}`,
    name: `Test Cell Group ${cellGroupCounter}`,
    description: 'A test cell group for fellowship',
    satellite_id: 'satellite-1',
    leader_id: 'member-1',
    co_leader_id: null,
    meeting_day: 'Wednesday',
    meeting_time: '19:00',
    meeting_location: '123 Meeting Street',
    is_active: true,
    max_members: 12,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================
// MINISTRY FACTORIES
// ============================================

let ministryCounter = 0
export function createMockMinistry(overrides?: Partial<Ministry>): Ministry {
  ministryCounter++
  return {
    id: `ministry-${ministryCounter}`,
    name: `Test Ministry ${ministryCounter}`,
    description: 'A test ministry for serving',
    department: 'Worship',
    head_id: 'member-1',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================
// USER PROFILE FACTORIES
// ============================================

let userProfileCounter = 0
export function createMockUserProfile(overrides?: Partial<UserProfile>): UserProfile {
  userProfileCounter++
  return {
    id: `user-${userProfileCounter}`,
    member_id: `member-${userProfileCounter}`,
    role: 'member',
    satellite_id: 'satellite-1',
    is_active: true,
    last_login_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================
// MEMBER CELL GROUP JUNCTION FACTORIES
// ============================================

let memberCellGroupCounter = 0
export function createMockMemberCellGroup(overrides?: Partial<MemberCellGroup>): MemberCellGroup {
  memberCellGroupCounter++
  return {
    id: `member-cell-group-${memberCellGroupCounter}`,
    member_id: `member-${memberCellGroupCounter}`,
    cell_group_id: 'cell-group-1',
    role: 'member',
    joined_at: new Date().toISOString(),
    left_at: null,
    is_active: true,
    ...overrides,
  }
}

// ============================================
// MEMBER MINISTRY JUNCTION FACTORIES
// ============================================

let memberMinistryCounter = 0
export function createMockMemberMinistry(overrides?: Partial<MemberMinistry>): MemberMinistry {
  memberMinistryCounter++
  return {
    id: `member-ministry-${memberMinistryCounter}`,
    member_id: `member-${memberMinistryCounter}`,
    ministry_id: 'ministry-1',
    role: 'volunteer',
    joined_at: new Date().toISOString(),
    left_at: null,
    is_active: true,
    ...overrides,
  }
}

// ============================================
// EVENT REGISTRATION FACTORIES
// ============================================

let eventRegCounter = 0
export function createMockEventRegistration(overrides?: Partial<EventRegistration>): EventRegistration {
  eventRegCounter++
  return {
    id: `event-reg-${eventRegCounter}`,
    member_id: null,
    name: `Attendee ${eventRegCounter}`,
    age: 25 + (eventRegCounter % 30),
    city: 'Test City',
    satellite: 'Quest Laguna Main',
    discipleship_stage: 'Growing',
    spiritual_description: 'I am growing in my faith journey.',
    spiritual_score: 7.0,
    spiritual_sentiment: 'stable',
    needs_support: false,
    event_name: 'Quest 10th Anniversary',
    registered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================
// FUN FACT FACTORIES
// ============================================

let funFactCounter = 0
export function createMockFunFact(overrides?: Partial<FunFact>): FunFact {
  funFactCounter++
  return {
    id: `fun-fact-${funFactCounter}`,
    content: `Did you know? Test fact number ${funFactCounter}`,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ============================================
// BATCH CREATORS
// ============================================

export function createMockMembers(count: number, overrides?: Partial<Member>): Member[] {
  return Array.from({ length: count }, () => createMockMember(overrides))
}

export function createMockSatellites(count: number): SatelliteRow[] {
  return Array.from({ length: count }, () => createMockSatelliteRow())
}

export function createMockCellGroups(count: number, overrides?: Partial<CellGroup>): CellGroup[] {
  return Array.from({ length: count }, () => createMockCellGroup(overrides))
}

export function createMockMinistries(count: number, overrides?: Partial<Ministry>): Ministry[] {
  return Array.from({ length: count }, () => createMockMinistry(overrides))
}

// ============================================
// RESET COUNTERS (for test isolation)
// ============================================

export function resetFactoryCounters() {
  satelliteCounter = 0
  memberCounter = 0
  cellGroupCounter = 0
  ministryCounter = 0
  userProfileCounter = 0
  memberCellGroupCounter = 0
  memberMinistryCounter = 0
  eventRegCounter = 0
  funFactCounter = 0
}
