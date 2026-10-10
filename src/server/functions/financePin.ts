// Account management — per-user, server-verified finance PIN.
// The PIN gates access to the finances area. Hashes are stored in
// user_finance_pins (service-role only) and never sent to the client.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission } from './_authGuard'
import { hashFinancePin, verifyFinancePinHash } from '../financePin'
import { FINANCE_PIN_MIN_LENGTH, FINANCE_PIN_MAX_LENGTH } from '../../lib/constants'

// ============================================
// STATUS — does the caller have a PIN set?
// ============================================

export const getFinancePinStatus = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await requirePermission(data.accessToken, 'finances.read')
    const admin = createServerAdminClient()
    const { data: row } = await admin
      .from('user_finance_pins')
      .select('user_id')
      .eq('user_id', caller.userId)
      .maybeSingle()
    return { hasPin: !!row }
  })

// ============================================
// SET / CHANGE PIN
// ============================================

const setPinSchema = z.object({
  accessToken: z.string(),
  pin: z.string().min(FINANCE_PIN_MIN_LENGTH).max(FINANCE_PIN_MAX_LENGTH),
  currentPin: z.string().optional(),
})

export const setFinancePin = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof setPinSchema>) => setPinSchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await requirePermission(data.accessToken, 'finances.read')
    const admin = createServerAdminClient()

    const { data: existing } = await admin
      .from('user_finance_pins')
      .select('pin_hash')
      .eq('user_id', caller.userId)
      .maybeSingle()

    // Changing an existing PIN requires proving the current one.
    if (existing) {
      if (!data.currentPin || !verifyFinancePinHash(data.currentPin, existing.pin_hash)) {
        throw new Error('Current PIN is incorrect')
      }
    }

    const pin_hash = hashFinancePin(data.pin)
    const { error } = await admin
      .from('user_finance_pins')
      .upsert({ user_id: caller.userId, pin_hash }, { onConflict: 'user_id' })
    if (error) throw new Error('Failed to save finance PIN')

    return { success: true }
  })

// ============================================
// VERIFY PIN (unlock the finances area)
// ============================================

const verifySchema = z.object({
  accessToken: z.string(),
  pin: z.string(),
})

export const verifyFinancePin = createServerFn({ method: 'POST' })
  .inputValidator((input: z.infer<typeof verifySchema>) => verifySchema.parse(input))
  .handler(async ({ data }) => {
    const caller = await requirePermission(data.accessToken, 'finances.read')
    const admin = createServerAdminClient()

    const { data: row } = await admin
      .from('user_finance_pins')
      .select('pin_hash')
      .eq('user_id', caller.userId)
      .maybeSingle()
    if (!row) return { valid: false, hasPin: false }

    return { valid: verifyFinancePinHash(data.pin, row.pin_hash), hasPin: true }
  })

// ============================================
// ADMIN: RESET ANOTHER USER'S PIN
// ============================================

export const clearFinancePin = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; userId: string }) =>
    z.object({ accessToken: z.string(), userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.accessToken, 'users.manage')
    const admin = createServerAdminClient()
    const { error } = await admin.from('user_finance_pins').delete().eq('user_id', data.userId)
    if (error) throw new Error('Failed to reset finance PIN')
    return { success: true }
  })
