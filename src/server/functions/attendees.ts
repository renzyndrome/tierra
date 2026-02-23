import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { registrationSchema } from '../../lib/validations'
import type { Attendee } from '../../lib/types'

// Server-side Supabase client (without generic types for simpler inference)
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

// Register a new attendee
export const registerAttendee = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof registrationSchema>) => registrationSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabase()

    const { data: attendee, error } = await supabase
      .from('event_registrations')
      .insert({
        name: data.name,
        age: data.age,
        city: data.city,
        satellite: data.satellite,
        discipleship_stage: data.discipleship_stage,
        spiritual_description: data.spiritual_description,
      })
      .select()
      .single()

    if (error) {
      console.error('Registration error:', error)
      throw new Error('Failed to register. Please try again.')
    }

    return attendee as Attendee
  })

// Filter schema for getAttendees
const attendeesFilterSchema = z.object({
  satellite: z.string().optional(),
  discipleship_stage: z.string().optional(),
  needs_support: z.boolean().optional(),
}).optional()

// Get all attendees with optional filters
export const getAttendees = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof attendeesFilterSchema>) => attendeesFilterSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabase()

    let query = supabase
      .from('event_registrations')
      .select('*')
      .order('registered_at', { ascending: false })

    if (data?.satellite) {
      query = query.eq('satellite', data.satellite)
    }

    if (data?.discipleship_stage) {
      query = query.eq('discipleship_stage', data.discipleship_stage)
    }

    if (data?.needs_support !== undefined) {
      query = query.eq('needs_support', data.needs_support)
    }

    const { data: attendees, error } = await query

    if (error) {
      console.error('Get attendees error:', error)
      throw new Error('Failed to fetch attendees')
    }

    return attendees as Attendee[]
  })

// Get single attendee by ID
export const getAttendee = createServerFn({ method: 'GET' })
  .inputValidator((id: string) => z.string().uuid().parse(id))
  .handler(async ({ data: id }) => {
    const supabase = getSupabase()

    const { data: attendee, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Get attendee error:', error)
      throw new Error('Attendee not found')
    }

    return attendee as Attendee
  })

// Update attendee AI fields schema
const updateAISchema = z.object({
  id: z.string().uuid(),
  spiritual_score: z.number().min(1).max(10),
  spiritual_sentiment: z.enum(['struggling', 'stable', 'thriving']),
  needs_support: z.boolean(),
})

// Update attendee AI fields
export const updateAttendeeAI = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof updateAISchema>) => updateAISchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabase()

    const { data: attendee, error } = await supabase
      .from('event_registrations')
      .update({
        spiritual_score: data.spiritual_score,
        spiritual_sentiment: data.spiritual_sentiment,
        needs_support: data.needs_support,
      })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Update attendee AI error:', error)
      throw new Error('Failed to update attendee')
    }

    return attendee as Attendee
  })

// Purge all attendees (admin only)
export const purgeAllAttendees = createServerFn({ method: 'POST' })
  .inputValidator((pin: string) => z.string().parse(pin))
  .handler(async ({ data: pin }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    // Use gt (greater than) with a null UUID to delete all rows
    const { error } = await supabase.from('event_registrations').delete().gte('created_at', '1970-01-01')

    if (error) {
      console.error('Purge error:', error)
      throw new Error('Failed to purge attendees')
    }

    return { success: true, message: 'All attendees have been deleted' }
  })

// Get total count for display screen
export const getAttendeeCount = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    const { count, error } = await supabase
      .from('event_registrations')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Count error:', error)
      return 0
    }

    return count || 0
  }
)

// Get latest registrant name (for display screen) - returns single name
export const getLatestRegistrant = createServerFn({ method: 'GET' }).handler(
  async () => {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('event_registrations')
      .select('name')
      .order('registered_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return null
    }

    // Return only first name for privacy
    const firstName = (data as { name: string }).name.split(' ')[0]
    return firstName
  }
)

// Get recent registrant names (for display screen carousel)
const recentCountSchema = z.number().min(1).max(20).default(10)

export const getRecentRegistrants = createServerFn({ method: 'GET' })
  .inputValidator((count?: number) => recentCountSchema.parse(count ?? 10))
  .handler(async ({ data: count }) => {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('event_registrations')
      .select('name, registered_at')
      .order('registered_at', { ascending: false })
      .limit(count)

    if (error || !data) {
      return []
    }

    // Return only first names for privacy
    return data.map((row) => ({
      name: (row as { name: string }).name.split(' ')[0],
      registeredAt: (row as { registered_at: string }).registered_at,
    }))
  })

// Seed test data (admin only)
const seedDataSchema = z.object({
  pin: z.string(),
  count: z.number().min(1).max(100).default(30),
  eventId: z.string().uuid().optional(),
})

export const seedTestData = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof seedDataSchema>) => seedDataSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    // Filipino names for realistic test data - separated by gender for mentorship matching
    const maleFirstNames = [
      'Juan', 'Jose', 'Pedro', 'Carlos', 'Miguel', 'Antonio', 'Francisco', 'Rafael',
      'Manuel', 'Luis', 'Fernando', 'Roberto', 'David', 'Daniel', 'Pablo', 'Marco',
      'Andres', 'Ricardo', 'Eduardo', 'Gabriel'
    ]
    const femaleFirstNames = [
      'Maria', 'Ana', 'Rosa', 'Elena', 'Sofia', 'Isabella', 'Lucia', 'Gabriela',
      'Patricia', 'Carmen', 'Angela', 'Teresa', 'Cristina', 'Victoria', 'Andrea',
      'Camila', 'Valentina', 'Beatriz', 'Claudia', 'Diana'
    ]

    const lastNames = [
      'Santos', 'Reyes', 'Cruz', 'Garcia', 'Mendoza', 'Torres', 'Flores', 'Ramos',
      'Gonzales', 'Bautista', 'Villanueva', 'Fernandez', 'Martinez', 'Lopez', 'Hernandez',
      'Rivera', 'Castro', 'Dela Cruz', 'Aquino', 'Pascual'
    ]

    const cities = [
      'Santa Rosa', 'Biñan', 'San Pedro', 'Cabuyao', 'Calamba',
      'Los Baños', 'Bay', 'Alaminos', 'San Pablo', 'Laguna',
      'Las Piñas', 'Cavinti', 'Southville', 'Parañaque', 'Muntinlupa'
    ]

    // Get active satellites from database
    const { data: satelliteRows } = await supabase
      .from('satellites')
      .select('name')
      .eq('is_active', true)

    const allSatellites = satelliteRows?.map((s) => s.name) || ['Quest Laguna Main', 'Quest Biñan', 'Quest Sta. Rosa']

    // Weighted satellite distribution - main satellites get more, new ones get less
    const getWeightedSatellite = () => {
      const weights: Record<string, number> = {
        'Quest Laguna Main': 50,
        'Quest Biñan': 5,
        'Quest Sta. Rosa': 10,
        'Quest Las Piñas': 15,
        'Quest San Pedro': 7,
        'Quest Cavinti': 6,
        'Quest Southville': 7,
      }
      // Build weighted array
      const weightedArray: string[] = []
      allSatellites.forEach((sat) => {
        const weight = weights[sat] || 5
        for (let i = 0; i < weight; i++) {
          weightedArray.push(sat)
        }
      })
      return weightedArray[Math.floor(Math.random() * weightedArray.length)]
    }

    const stages = ['Newbie', 'Growing', 'Leader'] as const

    const spiritualDescriptions = [
      "I've been attending church for about a year now and I'm excited to learn more about my faith.",
      "Just started my spiritual journey. Looking forward to growing with the community.",
      "Been a believer for 5 years. Currently leading a small group in our area.",
      "New to Quest but not new to faith. Excited to find a new church home.",
      "I want to deepen my relationship with God and learn how to serve others better.",
      "Recently rededicated my life to Christ. Ready for a fresh start.",
      "Been through a lot lately but my faith keeps me going. Looking for support.",
      "Grew up in the church but only recently started taking my faith seriously.",
      "I lead worship at our satellite. Excited for the anniversary celebration!",
      "First time attending. A friend invited me and I'm curious about faith.",
      "Walking with God for 10+ years. Here to celebrate and encourage others.",
      "Struggling with some things but believe God is working in my life.",
      "Part of the discipleship program. Growing each day in my walk with Christ.",
      "Youth leader here. Love seeing the next generation grow in faith.",
      "New believer. Got baptized last month and ready to learn more!",
    ]

    // Generate test attendees
    const testAttendees = Array.from({ length: data.count }, () => {
      // Randomly select gender (roughly 50/50)
      const isMale = Math.random() < 0.5
      const firstName = isMale
        ? maleFirstNames[Math.floor(Math.random() * maleFirstNames.length)]
        : femaleFirstNames[Math.floor(Math.random() * femaleFirstNames.length)]
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
      const age = Math.floor(Math.random() * 45) + 15 // 15-60 years old
      const city = cities[Math.floor(Math.random() * cities.length)]
      const satellite = getWeightedSatellite()
      const stage = stages[Math.floor(Math.random() * stages.length)]
      const description = spiritualDescriptions[Math.floor(Math.random() * spiritualDescriptions.length)]

      // Random registration time within the last 7 days
      const hoursAgo = Math.floor(Math.random() * 168) // 0-168 hours (7 days)
      const registeredAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString()

      return {
        name: `${firstName} ${lastName}`,
        age,
        city,
        satellite,
        discipleship_stage: stage,
        spiritual_description: description,
        registered_at: registeredAt,
        ...(data.eventId ? { event_id: data.eventId } : {}),
      }
    })

    const { data: inserted, error } = await supabase
      .from('event_registrations')
      .insert(testAttendees)
      .select()

    if (error) {
      console.error('Seed error:', error)
      throw new Error('Failed to seed test data')
    }

    return { success: true, count: inserted?.length || 0 }
  })
