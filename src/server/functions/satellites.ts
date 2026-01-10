import { createServerFn } from '@tanstack/react-start'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Server-side Supabase client
function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(url, key)
}

export interface SatelliteRow {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

// Get all satellites (active only by default)
export const getSatellites = createServerFn({ method: 'GET' })
  .inputValidator((includeInactive?: boolean) => z.boolean().optional().parse(includeInactive))
  .handler(async ({ data: includeInactive }) => {
    const supabase = getSupabase()

    let query = supabase
      .from('satellites')
      .select('*')
      .order('name', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Get satellites error:', error)
      throw new Error('Failed to fetch satellites')
    }

    return data as SatelliteRow[]
  })

// Add a new satellite
const addSatelliteSchema = z.object({
  name: z.string().min(1, 'Satellite name is required').max(100),
  pin: z.string(),
})

export const addSatellite = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof addSatelliteSchema>) => addSatelliteSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    const { data: satellite, error } = await supabase
      .from('satellites')
      .insert({ name: data.name })
      .select()
      .single()

    if (error) {
      console.error('Add satellite error:', error)
      if (error.code === '23505') {
        throw new Error('A satellite with this name already exists')
      }
      throw new Error('Failed to add satellite')
    }

    return satellite as SatelliteRow
  })

// Toggle satellite active status
const toggleSatelliteSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
  pin: z.string(),
})

export const toggleSatellite = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof toggleSatelliteSchema>) => toggleSatelliteSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    const { data: satellite, error } = await supabase
      .from('satellites')
      .update({ is_active: data.is_active })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Toggle satellite error:', error)
      throw new Error('Failed to update satellite')
    }

    return satellite as SatelliteRow
  })

// Delete a satellite (only if no attendees are using it)
const deleteSatelliteSchema = z.object({
  id: z.string().uuid(),
  pin: z.string(),
})

export const deleteSatellite = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof deleteSatelliteSchema>) => deleteSatelliteSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    // First check if any attendees are using this satellite
    const { data: satellite } = await supabase
      .from('satellites')
      .select('name')
      .eq('id', data.id)
      .single()

    if (satellite) {
      const { count } = await supabase
        .from('attendees')
        .select('*', { count: 'exact', head: true })
        .eq('satellite', satellite.name)

      if (count && count > 0) {
        throw new Error(`Cannot delete satellite with ${count} registered attendees`)
      }
    }

    const { error } = await supabase
      .from('satellites')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Delete satellite error:', error)
      throw new Error('Failed to delete satellite')
    }

    return { success: true }
  })
