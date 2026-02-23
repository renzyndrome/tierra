import type { DiscipleshipStage, CivilStatus, MemberCategory, FollowThrough, DiscipleshipJourney, LeadershipLevel } from './types'

// Discipleship stage options
export const DISCIPLESHIP_STAGES: {
  value: DiscipleshipStage
  label: string
  description: string
}[] = [
  {
    value: 'Newbie',
    label: 'Newbie',
    description: 'New believer or first-time attendee',
  },
  {
    value: 'Growing',
    label: 'Growing',
    description: 'Regular member in discipleship',
  },
  {
    value: 'Leader',
    label: 'Leader',
    description: 'Small group leader or ministry head',
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
  { value: 'Cell and Church', label: 'Cell & Church', description: 'Integrated into cell group and church' },
]

// Discipleship journey stages (ordered 1-9)
export const DISCIPLESHIP_JOURNEY_STAGES: {
  value: DiscipleshipJourney
  label: string
  description: string
  simpleStage: DiscipleshipStage
}[] = [
  { value: 'Consolidations', label: 'Consolidations', description: 'Initial follow-up after first contact', simpleStage: 'Newbie' },
  { value: 'Pre Encounter', label: 'Pre Encounter', description: 'Preparing for encounter weekend', simpleStage: 'Newbie' },
  { value: 'Encounter', label: 'Encounter', description: 'Attended encounter weekend', simpleStage: 'Growing' },
  { value: 'Post-Encounter', label: 'Post-Encounter', description: 'After encounter, starting discipleship', simpleStage: 'Growing' },
  { value: 'SOD1', label: 'SOD 1', description: 'School of Disciples Level 1', simpleStage: 'Growing' },
  { value: 'SOD2', label: 'SOD 2', description: 'School of Disciples Level 2', simpleStage: 'Growing' },
  { value: 'SOD3', label: 'SOD 3', description: 'School of Disciples Level 3', simpleStage: 'Leader' },
  { value: 'QBS Theology 101', label: 'QBS Theology 101', description: 'Quest Bible Seminary - Theology', simpleStage: 'Leader' },
  { value: 'QBS Preaching 101', label: 'QBS Preaching 101', description: 'Quest Bible Seminary - Preaching', simpleStage: 'Leader' },
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

// Early bird cutoff time (9:00 AM)
export const EARLY_BIRD_HOUR = 9

// Event details
export const EVENT_NAME = 'NEXTLEVEL Stronger 2026'
export const EVENT_TITLE = "Celebrating Quest Laguna's 10th Anniversary"
export const EVENT_DATES = 'January 4, 11, 18, 25 | 10AM'
export const EVENT_VENUE = 'Moriah and NXTGN Hall'

// Logo path
export const LOGO_PATH = '/questlogo.jpg'

// Success message
export const REGISTRATION_SUCCESS_MESSAGE = `Welcome to ${EVENT_NAME}! You're officially registered. See you at the event!`

// Registration URL (update with your actual domain)
export const REGISTRATION_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/register`
    : '/register'

// Admin PIN (from environment)
export const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || 'quest2026'

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
