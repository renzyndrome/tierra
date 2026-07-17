// Quest Laguna Directory - Inventory Maintenance Log server functions
//
// Dated service history per inventory item (cleaning, repair, inspection, ...).
// All access is authorized: reads require inventory.read, writes inventory.write.
// See src/server/functions/_authGuard.ts for the token/permission model.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission } from './_authGuard'
import { MAINTENANCE_TYPES } from '../../lib/constants'
import type { InventoryMaintenanceLog } from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

const maintenanceInsertSchema = z.object({
  accessToken: z.string(),
  item_id: z.string().uuid(),
  maintenance_date: dateStr,
  maintenance_type: z.enum(MAINTENANCE_TYPES).default('Cleaning'),
  description: z.string().max(1000).optional().nullable(),
  performed_by: z.string().max(200).optional().nullable(),
  cost: z.number().min(0).max(99999999).optional().nullable(),
  next_due_date: dateStr.optional().nullable(),
})

// ============================================
// LIST MAINTENANCE LOGS FOR AN ITEM
// ============================================

export const getMaintenanceLogs = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; itemId: string }) =>
    z.object({ accessToken: z.string(), itemId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<InventoryMaintenanceLog[]> => {
    await requirePermission(data.accessToken, 'inventory.read')
    const supabase = createServerAdminClient()

    const { data: logs, error } = await supabase
      .from('inventory_maintenance_logs')
      .select('*')
      .eq('item_id', data.itemId)
      .order('maintenance_date', { ascending: false })

    if (error) {
      console.error('Error fetching maintenance logs:', error)
      throw new Error('Failed to fetch maintenance logs')
    }

    return logs as InventoryMaintenanceLog[]
  })

// ============================================
// CREATE MAINTENANCE LOG
// ============================================

export const createMaintenanceLog = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof maintenanceInsertSchema>) => maintenanceInsertSchema.parse(data))
  .handler(async ({ data }): Promise<InventoryMaintenanceLog> => {
    const caller = await requirePermission(data.accessToken, 'inventory.write')
    const supabase = createServerAdminClient()

    const { accessToken: _token, ...fields } = data
    const { data: log, error } = await supabase
      .from('inventory_maintenance_logs')
      .insert({ ...fields, logged_by: caller.userId })
      .select()
      .single()

    if (error) {
      console.error('Error creating maintenance log:', error)
      throw new Error('Failed to create maintenance log')
    }

    return log as InventoryMaintenanceLog
  })

// ============================================
// DELETE MAINTENANCE LOG
// ============================================

export const deleteMaintenanceLog = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'inventory.write')
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('inventory_maintenance_logs')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting maintenance log:', error)
      throw new Error('Failed to delete maintenance log')
    }

    return { success: true }
  })
