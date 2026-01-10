import type { DiscipleshipStage } from './types'

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
  'We now have 3 satellite locations across Laguna.',
  'Over 500 people have been discipled through Quest.',
  'This is our biggest anniversary celebration yet!',
  'NEXTLEVEL Stronger 2026 - Going to the next level together!',
]
