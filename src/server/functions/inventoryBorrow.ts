// Quest Laguna Directory - Inventory Borrow / Deployment server functions
//
// A borrow request is a single record covering the full lifecycle of an item
// leaving its shelf: request -> approve -> check out (condition before) ->
// return (condition after). It records the responsible custodian and the
// deployment destination (satellite / outreach), which is how the church tracks
// who is accountable for a unit while it is deployed.
//
// Authorization (see _authGuard.ts):
//   * reads + submitting a request : inventory.read
//   * approve / reject / checkout / return : inventory.write
//   * cancel : inventory.write, OR the original requester on a not-yet-out request

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission, getCaller, getPermissionMatrix } from './_authGuard'
import { permissionMatches, permissionsForRole } from '../../lib/auth'
import { BORROW_DESTINATION_TYPES, BORROW_STATUS_LABELS } from '../../lib/constants'
import type {
  InventoryBorrowRequest,
  InventoryBorrowRequestWithRelations,
  BorrowStatus,
} from '../../lib/types'

// ============================================
// CONSTANTS / VALIDATION
// ============================================

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
const conditionEnum = z.enum(['Good', 'Fair', 'Needs Repair', 'Damaged'])

// Columns pulled with the joined item / borrower / ministry / satellite. Each
// target table is referenced by exactly one FK, but constraint hints are given
// explicitly to avoid any PostgREST relationship ambiguity.
const BORROW_SELECT = `
  *,
  item:inventory_items!inventory_borrow_requests_item_id_fkey(id, name, location, photo_url),
  borrower:members!inventory_borrow_requests_borrower_member_id_fkey(id, name, photo_url),
  ministry:ministries!inventory_borrow_requests_ministry_id_fkey(id, name),
  destination_satellite:satellites!inventory_borrow_requests_destination_satellite_id_fkey(id, name)
`

const borrowInsertSchema = z
  .object({
    accessToken: z.string(),
    item_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(9999).default(1),
    borrower_member_id: z.string().uuid().optional().nullable(),
    borrower_name: z.string().max(200).optional().nullable(),
    ministry_id: z.string().uuid().optional().nullable(),
    destination_type: z.enum(BORROW_DESTINATION_TYPES),
    destination_satellite_id: z.string().uuid().optional().nullable(),
    destination_detail: z.string().max(300).optional().nullable(),
    purpose: z.string().max(1000).optional().nullable(),
    borrow_date: dateStr.optional().nullable(),
    expected_return_date: dateStr.optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
  })
  .refine((d) => Boolean(d.borrower_member_id) || Boolean(d.borrower_name?.trim()), {
    message: 'A responsible borrower (member or name) is required',
    path: ['borrower_name'],
  })
  .refine((d) => d.destination_type !== 'satellite' || Boolean(d.destination_satellite_id), {
    message: 'Select the destination satellite',
    path: ['destination_satellite_id'],
  })

// ============================================
// LIST BORROW REQUESTS
// ============================================

export const getBorrowRequests = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { accessToken: string; status?: BorrowStatus; itemId?: string }) =>
      z
        .object({
          accessToken: z.string(),
          status: z
            .enum(['pending', 'approved', 'rejected', 'checked_out', 'returned', 'cancelled'])
            .optional(),
          itemId: z.string().uuid().optional(),
        })
        .parse(data),
  )
  .handler(async ({ data }): Promise<InventoryBorrowRequestWithRelations[]> => {
    await requirePermission(data.accessToken, 'inventory.read')
    const supabase = createServerAdminClient()

    let query = supabase.from('inventory_borrow_requests').select(BORROW_SELECT)
    if (data.status) query = query.eq('status', data.status)
    if (data.itemId) query = query.eq('item_id', data.itemId)
    query = query.order('created_at', { ascending: false })

    const { data: rows, error } = await query
    if (error) {
      console.error('Error fetching borrow requests:', error)
      throw new Error('Failed to fetch borrow requests')
    }

    return (rows ?? []) as unknown as InventoryBorrowRequestWithRelations[]
  })

// ============================================
// CREATE (SUBMIT) A BORROW REQUEST
// ============================================

export const createBorrowRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof borrowInsertSchema>) => borrowInsertSchema.parse(data))
  .handler(async ({ data }): Promise<InventoryBorrowRequest> => {
    const caller = await requirePermission(data.accessToken, 'inventory.read')
    const supabase = createServerAdminClient()

    const { accessToken: _token, ...fields } = data
    const { data: row, error } = await supabase
      .from('inventory_borrow_requests')
      .insert({
        ...fields,
        // satellite id is only meaningful for satellite destinations
        destination_satellite_id:
          fields.destination_type === 'satellite' ? fields.destination_satellite_id : null,
        requested_by: caller.userId,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating borrow request:', error)
      throw new Error('Failed to submit borrow request')
    }

    return row as InventoryBorrowRequest
  })

// ============================================
// STATE TRANSITIONS
// ============================================

/**
 * Load a request and assert it is in one of the allowed source states before a
 * transition. Throws a clear message otherwise.
 */
async function loadAndAssertStatus(
  supabase: ReturnType<typeof createServerAdminClient>,
  id: string,
  allowed: BorrowStatus[],
): Promise<InventoryBorrowRequest> {
  const { data: row, error } = await supabase
    .from('inventory_borrow_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !row) throw new Error('Borrow request not found')
  const current = row.status as BorrowStatus
  if (!allowed.includes(current)) {
    throw new Error(`Cannot perform this action on a ${BORROW_STATUS_LABELS[current] ?? current} request`)
  }
  return row as InventoryBorrowRequest
}

export const approveBorrowRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<InventoryBorrowRequest> => {
    const caller = await requirePermission(data.accessToken, 'inventory.write')
    const supabase = createServerAdminClient()
    await loadAndAssertStatus(supabase, data.id, ['pending'])

    const { data: row, error } = await supabase
      .from('inventory_borrow_requests')
      .update({ status: 'approved', approved_by: caller.userId, approved_at: new Date().toISOString() })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error approving borrow request:', error)
      throw new Error('Failed to approve request')
    }
    return row as InventoryBorrowRequest
  })

export const rejectBorrowRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; notes?: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid(), notes: z.string().max(1000).optional() }).parse(data),
  )
  .handler(async ({ data }): Promise<InventoryBorrowRequest> => {
    const caller = await requirePermission(data.accessToken, 'inventory.write')
    const supabase = createServerAdminClient()
    await loadAndAssertStatus(supabase, data.id, ['pending'])

    const { data: row, error } = await supabase
      .from('inventory_borrow_requests')
      .update({
        status: 'rejected',
        approved_by: caller.userId,
        approved_at: new Date().toISOString(),
        notes: data.notes ?? null,
      })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error rejecting borrow request:', error)
      throw new Error('Failed to reject request')
    }
    return row as InventoryBorrowRequest
  })

export const checkoutBorrowRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; condition_before: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid(), condition_before: conditionEnum }).parse(data),
  )
  .handler(async ({ data }): Promise<InventoryBorrowRequest> => {
    await requirePermission(data.accessToken, 'inventory.write')
    const supabase = createServerAdminClient()
    await loadAndAssertStatus(supabase, data.id, ['approved'])

    const { data: row, error } = await supabase
      .from('inventory_borrow_requests')
      .update({
        status: 'checked_out',
        condition_before: data.condition_before,
        checked_out_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error checking out borrow request:', error)
      throw new Error('Failed to check out item')
    }
    return row as InventoryBorrowRequest
  })

export const returnBorrowRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; condition_after: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid(), condition_after: conditionEnum }).parse(data),
  )
  .handler(async ({ data }): Promise<InventoryBorrowRequest> => {
    await requirePermission(data.accessToken, 'inventory.write')
    const supabase = createServerAdminClient()
    const req = await loadAndAssertStatus(supabase, data.id, ['checked_out'])

    const { data: row, error } = await supabase
      .from('inventory_borrow_requests')
      .update({
        status: 'returned',
        condition_after: data.condition_after,
        returned_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error returning borrow request:', error)
      throw new Error('Failed to record return')
    }

    // Reflect the returned condition on the item's current condition.
    const { error: itemErr } = await supabase
      .from('inventory_items')
      .update({ condition: data.condition_after, updated_at: new Date().toISOString() })
      .eq('id', req.item_id)
    if (itemErr) {
      // Non-fatal: the return is recorded; log and continue.
      console.error('Error syncing item condition after return:', itemErr)
    }

    return row as InventoryBorrowRequest
  })

export const cancelBorrowRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<InventoryBorrowRequest> => {
    // A request can be cancelled by any inventory manager, or by the person who
    // submitted it — but only while it has not yet been handed out.
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()
    const req = await loadAndAssertStatus(supabase, data.id, ['pending', 'approved'])

    let allowed = caller.role === 'admin' || req.requested_by === caller.userId
    if (!allowed) {
      const matrix = await getPermissionMatrix(supabase)
      allowed = permissionMatches(permissionsForRole(caller.role, matrix), 'inventory.write')
    }
    if (!allowed) throw new Error('You do not have permission to cancel this request')

    const { data: row, error } = await supabase
      .from('inventory_borrow_requests')
      .update({ status: 'cancelled' })
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error cancelling borrow request:', error)
      throw new Error('Failed to cancel request')
    }
    return row as InventoryBorrowRequest
  })
