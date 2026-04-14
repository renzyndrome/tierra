// Quest Laguna Directory - Inventory Management Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import type { InventoryItem, InventoryItemInsert, InventoryItemUpdate, InventoryCategory } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const inventoryItemInsertSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(1000).optional().nullable(),
  location: z.enum(['Moriah Hall', 'Nxtgen Hall']),
  quantity: z.number().int().min(1).max(9999).optional().default(1),
  photo_url: z.string().optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  condition: z.enum(['Good', 'Fair', 'Needs Repair', 'Damaged']).optional().default('Good'),
})

const inventoryItemUpdateSchema = inventoryItemInsertSchema.partial()

const inventorySearchSchema = z.object({
  query: z.string().optional(),
  location: z.enum(['Moriah Hall', 'Nxtgen Hall']).optional(),
  category: z.string().optional(),
  condition: z.enum(['Good', 'Fair', 'Needs Repair', 'Damaged']).optional(),
  sortBy: z.enum(['name', 'created_at', 'quantity', 'location']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
})

// ============================================
// GET ALL INVENTORY ITEMS (with filters)
// ============================================

export const getInventoryItems = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof inventorySearchSchema>) => inventorySearchSchema.parse(data))
  .handler(async ({ data }): Promise<InventoryItem[]> => {
    const supabase = createServerAdminClient()

    let query = supabase
      .from('inventory_items')
      .select('*')

    if (data.query) {
      query = query.or(`name.ilike.%${data.query}%,description.ilike.%${data.query}%`)
    }

    if (data.location) {
      query = query.eq('location', data.location)
    }

    if (data.category) {
      query = query.eq('category', data.category)
    }

    if (data.condition) {
      query = query.eq('condition', data.condition)
    }

    query = query.order(data.sortBy, { ascending: data.sortOrder === 'asc' })

    const { data: items, error } = await query

    if (error) {
      console.error('Error fetching inventory items:', error)
      throw new Error('Failed to fetch inventory items')
    }

    // Generate signed URLs for items with photo paths (private bucket)
    const itemsWithSignedUrls = await Promise.all(
      (items as InventoryItem[]).map(async (item) => {
        if (!item.photo_url) return item

        // Extract file path from stored value
        let filePath = item.photo_url
        if (filePath.startsWith('http')) {
          // Legacy: full public URL stored — extract path after bucket name
          const pathMatch = filePath.match(/\/storage\/v1\/object\/public\/media\/(.+)$/)
          if (pathMatch) {
            filePath = pathMatch[1]
          } else {
            console.error('[inventory] Could not extract path from URL:', filePath)
            return item
          }
        }

        const { data: signedData, error: signError } = await supabase.storage
          .from('media')
          .createSignedUrl(filePath, 3600)

        if (signError) {
          console.error('[inventory] Signed URL error for', filePath, signError)
          return { ...item, photo_url: null }
        }

        return { ...item, photo_url: signedData.signedUrl }
      })
    )

    return itemsWithSignedUrls
  })

// ============================================
// CREATE INVENTORY ITEM
// ============================================

export const createInventoryItem = createServerFn({ method: 'POST' })
  .inputValidator((data: InventoryItemInsert) => inventoryItemInsertSchema.parse(data))
  .handler(async ({ data }): Promise<InventoryItem> => {
    const supabase = createServerAdminClient()

    const { data: item, error } = await supabase
      .from('inventory_items')
      .insert(data)
      .select()
      .single()

    if (error) {
      console.error('Error creating inventory item:', error)
      throw new Error('Failed to create inventory item')
    }

    return item as InventoryItem
  })

// ============================================
// UPDATE INVENTORY ITEM
// ============================================

export const updateInventoryItem = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; updates: InventoryItemUpdate }) =>
    z.object({
      id: z.string().uuid(),
      updates: inventoryItemUpdateSchema,
    }).parse(data)
  )
  .handler(async ({ data }): Promise<InventoryItem> => {
    const supabase = createServerAdminClient()

    const { data: item, error } = await supabase
      .from('inventory_items')
      .update({ ...data.updates, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating inventory item:', error)
      throw new Error('Failed to update inventory item')
    }

    return item as InventoryItem
  })

// ============================================
// DELETE INVENTORY ITEM
// ============================================

export const deleteInventoryItem = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting inventory item:', error)
      throw new Error('Failed to delete inventory item')
    }

    return { success: true }
  })

// ============================================
// GET INVENTORY CATEGORIES
// ============================================

export const getInventoryCategories = createServerFn({ method: 'GET' })
  .inputValidator((data: Record<string, never>) => data)
  .handler(async (): Promise<InventoryCategory[]> => {
    const supabase = createServerAdminClient()

    const { data: categories, error } = await supabase
      .from('inventory_categories')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching inventory categories:', error)
      throw new Error('Failed to fetch inventory categories')
    }

    return categories as InventoryCategory[]
  })

// ============================================
// CREATE INVENTORY CATEGORY
// ============================================

export const createInventoryCategory = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string }) =>
    z.object({ name: z.string().min(1).max(100) }).parse(data)
  )
  .handler(async ({ data }): Promise<InventoryCategory> => {
    const supabase = createServerAdminClient()

    const { data: category, error } = await supabase
      .from('inventory_categories')
      .insert({ name: data.name.trim() })
      .select()
      .single()

    if (error) {
      console.error('Error creating inventory category:', error)
      if (error.code === '23505') {
        throw new Error('Category already exists')
      }
      throw new Error('Failed to create category')
    }

    return category as InventoryCategory
  })

// ============================================
// DELETE INVENTORY CATEGORY
// ============================================

export const deleteInventoryCategory = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('inventory_categories')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting inventory category:', error)
      throw new Error('Failed to delete category')
    }

    return { success: true }
  })
