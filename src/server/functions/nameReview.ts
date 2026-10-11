// Admin name review: split each member's `name` into first / middle / last /
// suffix, one member at a time (/admin/name-review).
//
// Both functions need members.write. Confirming writes only the four parts and
// the review stamp; `name` is never written here, so display, search, the
// check-in matcher and Agapay keep reading the same value.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission } from './_authGuard'
import { withNamePartsReview } from '../../lib/nameParts'
import type { NamePartsStatus, NameReviewCounts, NameReviewItem } from '../../lib/types'

const REVIEW_COLUMNS =
  'id, name, first_name, middle_name, last_name, suffix, name_parts_status, is_archived, membership_status, photo_url'

const STATUSES: readonly NamePartsStatus[] = ['pending', 'auto', 'confirmed']

const QUEUE_PAGE_MAX = 100

// ============================================
// GET QUEUE (one page of one status + counts)
// ============================================

export const getNameReviewQueue = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; status: NamePartsStatus; offset?: number; limit?: number }) =>
    z.object({
      accessToken: z.string(),
      status: z.enum(['pending', 'auto', 'confirmed']),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(QUEUE_PAGE_MAX).default(25),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<{ items: NameReviewItem[]; counts: NameReviewCounts }> => {
    await requirePermission(data.accessToken, 'members.write')
    const supabase = createServerAdminClient()

    // Active members first, then archived; alphabetical; id keeps the order
    // stable between pages.
    const [list, ...countResults] = await Promise.all([
      supabase
        .from('members')
        .select(REVIEW_COLUMNS)
        .eq('name_parts_status', data.status)
        .order('is_archived', { ascending: true })
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(data.offset, data.offset + data.limit - 1),
      ...STATUSES.map((status) =>
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('name_parts_status', status),
      ),
    ])

    if (list.error) {
      console.error('Error loading name review queue:', list.error)
      throw new Error('Queue failed to load. Retry.')
    }
    const countError = countResults.find((r) => r.error)?.error
    if (countError) {
      console.error('Error counting name review queue:', countError)
      throw new Error('Queue failed to load. Retry.')
    }

    const [pending, auto, confirmed] = countResults.map((r) => r.count ?? 0)
    return {
      items: (list.data ?? []) as unknown as NameReviewItem[],
      counts: { pending, auto, confirmed, total: pending + auto + confirmed },
    }
  })

// ============================================
// CONFIRM ONE MEMBER'S SPLIT
// ============================================

export const confirmNameParts = createServerFn({ method: 'POST' })
  .inputValidator((data: {
    accessToken: string
    id: string
    /** The name the admin saw. A rename since then refuses the confirm. */
    name: string
    first_name: string
    middle_name?: string | null
    last_name: string
    suffix?: string | null
  }) =>
    z.object({
      accessToken: z.string(),
      id: z.string().uuid(),
      name: z.string(),
      first_name: z.string().max(60),
      middle_name: z.string().max(60).nullable().optional(),
      last_name: z.string().max(60),
      suffix: z.string().max(20).nullable().optional(),
    }).parse(data)
  )
  .handler(async ({ data }): Promise<NameReviewItem> => {
    const caller = await requirePermission(data.accessToken, 'members.write')
    // Cleans blanks to null, requires first and last, adds the review stamp.
    const fields = withNamePartsReview(
      {
        first_name: data.first_name,
        middle_name: data.middle_name ?? null,
        last_name: data.last_name,
        suffix: data.suffix ?? null,
      },
      caller.userId,
    )

    const supabase = createServerAdminClient()
    const { data: row, error } = await supabase
      .from('members')
      .update(fields)
      .eq('id', data.id)
      .eq('name', data.name)
      .select(REVIEW_COLUMNS)
      .maybeSingle()

    if (error) {
      console.error('Error confirming name parts:', error)
      throw new Error('Confirm failed. Retry.')
    }
    // No row: the member was renamed (the split would describe the old name)
    // or deleted since the queue loaded.
    if (!row) throw new Error('Member record changed. Reload the queue.')
    return row as unknown as NameReviewItem
  })
