// Quest Laguna Directory - Event Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerSupabaseClient, createServerAdminClient } from '../../lib/supabase'
import type { Event, EventInsert, EventUpdate, EventWithStats, Attendee } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const eventInsertSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(200),
  description: z.string().max(1000).optional().nullable(),
  event_date: z.string(),
  event_time: z.string().optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  expected_attendees: z.number().min(1).max(10000).optional(),
  early_bird_cutoff: z.string().optional().nullable(),
  registration_open: z.boolean().optional(),
  is_active: z.boolean().optional(),
  banner_url: z.string().url().optional().nullable(),
  registration_start: z.string().optional().nullable(),
  registration_end: z.string().optional().nullable(),
})

// ============================================
// REGISTRATION STATUS HELPER
// ============================================

export type RegistrationStatus = 'open' | 'not_started' | 'ended' | 'closed'

export function getRegistrationStatus(event: {
  registration_open: boolean
  registration_start?: string | null
  registration_end?: string | null
}): RegistrationStatus {
  if (!event.registration_open) return 'closed'
  const now = new Date()
  if (event.registration_start && now < new Date(event.registration_start)) return 'not_started'
  if (event.registration_end && now > new Date(event.registration_end)) return 'ended'
  return 'open'
}

const eventUpdateSchema = eventInsertSchema.partial()

// ============================================
// GET ALL EVENTS
// ============================================

export const getEvents = createServerFn({ method: 'GET' })
  .inputValidator((data: { activeOnly?: boolean }) =>
    z.object({ activeOnly: z.boolean().optional().default(false) }).parse(data)
  )
  .handler(async ({ data }): Promise<EventWithStats[]> => {
    const supabase = createServerAdminClient()

    let query = supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false })

    if (data.activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: events, error } = await query

    if (error) {
      console.error('Error fetching events:', error)
      throw new Error('Failed to fetch events')
    }

    // Get registration stats for all events. Fetch every relevant registration in ONE
    // query and aggregate in memory, instead of issuing up to 2 count queries per event
    // (previously 2N+1 round-trips).
    const eventList = events || []
    const eventIds = eventList.map((e) => e.id)

    const registeredAtByEvent = new Map<string, string[]>()
    if (eventIds.length > 0) {
      const { data: regs, error: regError } = await supabase
        .from('event_registrations')
        .select('event_id, registered_at')
        .in('event_id', eventIds)

      if (regError) {
        console.error('Error fetching event registrations:', regError)
      } else {
        const regRows = (regs || []) as Array<{ event_id: string; registered_at: string }>
        for (const r of regRows) {
          const list = registeredAtByEvent.get(r.event_id) ?? []
          list.push(r.registered_at)
          registeredAtByEvent.set(r.event_id, list)
        }
      }
    }

    const eventsWithStats: EventWithStats[] = eventList.map((event) => {
      const timestamps = registeredAtByEvent.get(event.id) ?? []

      // Early-bird = registered before `${event_date}T${cutoff}`. registered_at is a
      // timestamptz (UTC), so compare absolute instants against the cutoff read as UTC.
      let earlyBirdCount = 0
      if (event.early_bird_cutoff) {
        // Normalize 'HH:MM' or 'HH:MM:SS' to a full UTC instant.
        const cutoff = event.early_bird_cutoff
        const cutoffTime = cutoff.length === 5 ? `${cutoff}:00` : cutoff
        const cutoffMs = Date.parse(`${event.event_date}T${cutoffTime}Z`)
        if (!Number.isNaN(cutoffMs)) {
          earlyBirdCount = timestamps.filter((ts) => {
            const t = Date.parse(ts)
            return !Number.isNaN(t) && t < cutoffMs
          }).length
        }
      }

      return {
        ...event,
        registration_count: timestamps.length,
        early_bird_count: earlyBirdCount,
      } as EventWithStats
    })

    return eventsWithStats
  })

// ============================================
// GET SINGLE EVENT
// ============================================

export const getEvent = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<EventWithStats | null> => {
    const supabase = createServerAdminClient()

    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching event:', error)
      throw new Error('Failed to fetch event')
    }

    // Get registration count
    const { count: registrationCount } = await supabase
      .from('event_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', event.id)

    // Calculate early bird count
    let earlyBirdCount = 0
    if (event.early_bird_cutoff) {
      const { count } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .lt('registered_at', `${event.event_date}T${event.early_bird_cutoff}`)

      earlyBirdCount = count || 0
    }

    return {
      ...event,
      registration_count: registrationCount || 0,
      early_bird_count: earlyBirdCount,
    } as EventWithStats
  })

// ============================================
// CREATE EVENT
// ============================================

export const createEvent = createServerFn({ method: 'POST' })
  .inputValidator((data: EventInsert) => eventInsertSchema.parse(data))
  .handler(async ({ data }): Promise<Event> => {
    const supabase = createServerAdminClient()

    const { data: event, error } = await supabase
      .from('events')
      .insert(data)
      .select()
      .single()

    if (error) {
      console.error('Error creating event:', error)
      throw new Error('Failed to create event')
    }

    return event as Event
  })

// ============================================
// UPDATE EVENT
// ============================================

export const updateEvent = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; updates: EventUpdate }) =>
    z.object({
      id: z.string().uuid(),
      updates: eventUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Event> => {
    const supabase = createServerAdminClient()

    const { data: event, error } = await supabase
      .from('events')
      .update({ ...data.updates, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating event:', error)
      throw new Error('Failed to update event')
    }

    return event as Event
  })

// ============================================
// DELETE EVENT
// ============================================

export const deleteEvent = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting event:', error)
      throw new Error('Failed to delete event')
    }

    return { success: true }
  })

// ============================================
// TOGGLE EVENT REGISTRATION
// ============================================

export const toggleEventRegistration = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; registration_open: boolean }) =>
    z.object({
      id: z.string().uuid(),
      registration_open: z.boolean(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<Event> => {
    const supabase = createServerAdminClient()

    const { data: event, error } = await supabase
      .from('events')
      .update({ registration_open: data.registration_open, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error toggling event registration:', error)
      throw new Error('Failed to toggle event registration')
    }

    return event as Event
  })

// ============================================
// GET EVENT STATS
// ============================================

export const getEventStats = createServerFn({ method: 'GET' })
  .inputValidator((data: { eventId: string }) => z.object({ eventId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createServerAdminClient()

    // Get all registrations for this event
    const { data: registrations, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', data.eventId)

    if (error) {
      console.error('Error fetching event stats:', error)
      throw new Error('Failed to fetch event stats')
    }

    const regs = registrations || []

    // Calculate stats
    const total = regs.length
    const bySatellite: Record<string, number> = {}
    const byStage: Record<string, number> = { Newbie: 0, Growing: 0, Leader: 0 }
    let needsSupportCount = 0
    let totalAge = 0
    let ageCount = 0

    regs.forEach((reg) => {
      // By satellite
      bySatellite[reg.satellite] = (bySatellite[reg.satellite] || 0) + 1

      // By stage
      if (reg.discipleship_stage) {
        byStage[reg.discipleship_stage] = (byStage[reg.discipleship_stage] || 0) + 1
      }

      // Needs support
      if (reg.needs_support) {
        needsSupportCount++
      }

      // Age
      if (reg.age) {
        totalAge += reg.age
        ageCount++
      }
    })

    return {
      total,
      bySatellite,
      byStage,
      needsSupportCount,
      averageAge: ageCount > 0 ? Math.round(totalAge / ageCount) : 0,
    }
  })

// ============================================
// GET EVENT REGISTRATIONS
// ============================================

export const getEventRegistrations = createServerFn({ method: 'GET' })
  .inputValidator((data: { eventId: string }) => z.object({ eventId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createServerAdminClient()

    const { data: registrations, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', data.eventId)
      .order('registered_at', { ascending: false })

    if (error) {
      console.error('Error fetching event registrations:', error)
      throw new Error('Failed to fetch event registrations')
    }

    return (registrations || []) as Attendee[]
  })

// ============================================
// GET EVENT PUBLIC (for registration page)
// ============================================

export const getEventPublic = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = createServerAdminClient()

    const { data: event, error } = await supabase
      .from('events')
      .select('id, name, description, event_date, event_time, location, banner_url, registration_open, registration_start, registration_end, is_active')
      .eq('id', data.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      console.error('Error fetching event for registration:', error)
      throw new Error('Failed to fetch event')
    }

    if (!event || !event.is_active) return null

    return {
      ...event,
      registration_status: getRegistrationStatus(event),
    } as {
      id: string
      name: string
      description: string | null
      event_date: string
      event_time: string | null
      location: string | null
      banner_url: string | null
      registration_open: boolean
      registration_start: string | null
      registration_end: string | null
      is_active: boolean
      registration_status: RegistrationStatus
    }
  })
