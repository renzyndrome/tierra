import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import type {
  DashboardStats,
  AgeDistribution,
  RegistrationTimeline,
  Satellite,
  DiscipleshipStage,
} from '../../lib/types'
import { EARLY_BIRD_HOUR } from '../../lib/constants'

// Server-side Supabase client
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

// Type for attendee row from Supabase
interface AttendeeRow {
  id: string
  name: string
  age: number
  city: string
  satellite: string
  discipleship_stage: string
  spiritual_description: string
  spiritual_score: number | null
  spiritual_sentiment: string | null
  needs_support: boolean
  registered_at: string
  created_at: string
}

// Get comprehensive dashboard stats
export const getDashboardStats = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    // Get all attendees
    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('*')

    if (error) {
      console.error('Dashboard stats error:', error)
      throw new Error('Failed to fetch dashboard stats')
    }

    const rows = (attendees || []) as AttendeeRow[]

    if (rows.length === 0) {
      return {
        total: 0,
        bySatellite: {
          'Quest Laguna Main': 0,
          'Quest Biñan': 0,
          'Quest Sta. Rosa': 0,
        },
        byStage: {
          Newbie: 0,
          Growing: 0,
          Leader: 0,
        },
        earlyBirdCount: 0,
        averageAge: 0,
        needsSupportCount: 0,
      } as DashboardStats
    }

    // Calculate stats
    const bySatellite: Record<Satellite, number> = {
      'Quest Laguna Main': 0,
      'Quest Biñan': 0,
      'Quest Sta. Rosa': 0,
    }

    const byStage: Record<DiscipleshipStage, number> = {
      Newbie: 0,
      Growing: 0,
      Leader: 0,
    }

    let totalAge = 0
    let earlyBirdCount = 0
    let needsSupportCount = 0

    rows.forEach((attendee) => {
      // Count by satellite
      if (attendee.satellite in bySatellite) {
        bySatellite[attendee.satellite as Satellite]++
      }

      // Count by stage
      if (attendee.discipleship_stage in byStage) {
        byStage[attendee.discipleship_stage as DiscipleshipStage]++
      }

      // Sum ages
      totalAge += attendee.age

      // Count early birds (registered before cutoff hour)
      const registeredHour = new Date(attendee.registered_at).getHours()
      if (registeredHour < EARLY_BIRD_HOUR) {
        earlyBirdCount++
      }

      // Count needs support
      if (attendee.needs_support) {
        needsSupportCount++
      }
    })

    return {
      total: rows.length,
      bySatellite,
      byStage,
      earlyBirdCount,
      averageAge: Math.round(totalAge / rows.length),
      needsSupportCount,
    } as DashboardStats
  }
)

// Get age distribution for histogram
export const getAgeDistribution = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('age')

    if (error) {
      console.error('Age distribution error:', error)
      throw new Error('Failed to fetch age distribution')
    }

    const rows = (attendees || []) as { age: number }[]

    // Create 10-year buckets
    const buckets: Record<string, number> = {
      '0-9': 0,
      '10-19': 0,
      '20-29': 0,
      '30-39': 0,
      '40-49': 0,
      '50-59': 0,
      '60-69': 0,
      '70+': 0,
    }

    rows.forEach((a) => {
      const age = a.age
      if (age < 10) buckets['0-9']++
      else if (age < 20) buckets['10-19']++
      else if (age < 30) buckets['20-29']++
      else if (age < 40) buckets['30-39']++
      else if (age < 50) buckets['40-49']++
      else if (age < 60) buckets['50-59']++
      else if (age < 70) buckets['60-69']++
      else buckets['70+']++
    })

    return Object.entries(buckets).map(([bucket, count]) => ({
      bucket,
      count,
    })) as AgeDistribution[]
  }
)

// Get registration timeline (hourly counts)
export const getRegistrationTimeline = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('registered_at')
      .order('registered_at', { ascending: true })

    if (error) {
      console.error('Registration timeline error:', error)
      throw new Error('Failed to fetch registration timeline')
    }

    const rows = (attendees || []) as { registered_at: string }[]

    // Group by hour
    const hourCounts: Record<string, number> = {}

    rows.forEach((a) => {
      const date = new Date(a.registered_at)
      const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`
      hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1
    })

    // Sort by hour and return
    return Object.entries(hourCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({
        hour,
        count,
      })) as RegistrationTimeline[]
  }
)

// Get early bird count
export const getEarlyBirdCount = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('registered_at')

    if (error) {
      console.error('Early bird count error:', error)
      return 0
    }

    const rows = (attendees || []) as { registered_at: string }[]

    let count = 0
    rows.forEach((a) => {
      const hour = new Date(a.registered_at).getHours()
      if (hour < EARLY_BIRD_HOUR) {
        count++
      }
    })

    return count
  }
)

// Get stats by satellite (for display screen)
export const getStatsBySatellite = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    const { data: attendees, error } = await supabase
      .from('attendees')
      .select('satellite')

    if (error) {
      console.error('Stats by satellite error:', error)
      throw new Error('Failed to fetch satellite stats')
    }

    const rows = (attendees || []) as { satellite: string }[]

    const counts: Record<Satellite, number> = {
      'Quest Laguna Main': 0,
      'Quest Biñan': 0,
      'Quest Sta. Rosa': 0,
    }

    rows.forEach((a) => {
      if (a.satellite in counts) {
        counts[a.satellite as Satellite]++
      }
    })

    return counts
  }
)
