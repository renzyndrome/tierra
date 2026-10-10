// Satellite server functions. getSatellites is deliberately PUBLIC: it uses the
// anon client and the satellites table is public-read (names only). Writes
// need satellites.write.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerSupabaseClient, createServerAdminClient } from '../../lib/supabase'
import { requirePermission } from './_authGuard'

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
    const supabase = createServerSupabaseClient()

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
  accessToken: z.string(),
  name: z.string().min(1, 'Satellite name is required').max(100),
})

export const addSatellite = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof addSatelliteSchema>) => addSatelliteSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'satellites.write')
    const supabase = createServerAdminClient()

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

// Delete a satellite
const deleteSatelliteSchema = z.object({
  accessToken: z.string(),
  id: z.string().uuid(),
})

export const deleteSatellite = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof deleteSatelliteSchema>) => deleteSatelliteSchema.parse(data))
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'satellites.write')
    const supabase = createServerAdminClient()

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
