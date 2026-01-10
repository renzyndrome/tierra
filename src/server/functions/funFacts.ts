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

export interface FunFactRow {
  id: string
  content: string
  is_active: boolean
  created_at: string
}

// Get all fun facts (active only by default)
export const getFunFacts = createServerFn({ method: 'GET' })
  .inputValidator((includeInactive?: boolean) => z.boolean().optional().parse(includeInactive))
  .handler(async ({ data: includeInactive }) => {
    const supabase = getSupabase()

    let query = supabase
      .from('fun_facts')
      .select('*')
      .order('created_at', { ascending: true })

    if (!includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Get fun facts error:', error)
      // Return default fun facts if table doesn't exist yet
      return []
    }

    return data as FunFactRow[]
  })

// Add a new fun fact
const addFunFactSchema = z.object({
  content: z.string().min(1, 'Content is required').max(500),
  pin: z.string(),
})

export const addFunFact = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof addFunFactSchema>) => addFunFactSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    const { data: funFact, error } = await supabase
      .from('fun_facts')
      .insert({ content: data.content })
      .select()
      .single()

    if (error) {
      console.error('Add fun fact error:', error)
      throw new Error('Failed to add fun fact')
    }

    return funFact as FunFactRow
  })

// Toggle fun fact active status
const toggleFunFactSchema = z.object({
  id: z.string().uuid(),
  is_active: z.boolean(),
  pin: z.string(),
})

export const toggleFunFact = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof toggleFunFactSchema>) => toggleFunFactSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    const { data: funFact, error } = await supabase
      .from('fun_facts')
      .update({ is_active: data.is_active })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Toggle fun fact error:', error)
      throw new Error('Failed to update fun fact')
    }

    return funFact as FunFactRow
  })

// Delete a fun fact
const deleteFunFactSchema = z.object({
  id: z.string().uuid(),
  pin: z.string(),
})

export const deleteFunFact = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof deleteFunFactSchema>) => deleteFunFactSchema.parse(data))
  .handler(async ({ data }) => {
    const adminPin = process.env.VITE_ADMIN_PIN || 'quest2026'

    if (data.pin !== adminPin) {
      throw new Error('Invalid admin PIN')
    }

    const supabase = getSupabase()

    const { error } = await supabase
      .from('fun_facts')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Delete fun fact error:', error)
      throw new Error('Failed to delete fun fact')
    }

    return { success: true }
  })
