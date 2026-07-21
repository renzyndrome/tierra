// Quest Laguna - Church expense report requests.
//
// Flow: a member requests a church expense report for a period -> finance reviews
// and RELEASES or REJECTS it -> once released, the member may view/download an
// AGGREGATE expense summary (totals by category) for that period. Expenses are
// church-wide (no per-member tagging), so disclosure is gated behind an explicit
// finance release with an audit trail.
//
// Authorization:
//   * request + view own requests/report : any authenticated caller (own data only)
//   * list / release / reject            : finances.read (list) / finances.write (act)
// All access goes through the service-role client; the table has no client RLS.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, requirePermission } from './_authGuard'
import type {
  ExpenseReportRequest,
  ExpenseReportRequestWithRequester,
  ExpenseReportSummary,
} from '../../lib/types'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

// ============================================
// MEMBER: CREATE A REQUEST
// ============================================

const createRequestSchema = z
  .object({
    accessToken: z.string(),
    periodStart: dateStr,
    periodEnd: dateStr,
    note: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.periodEnd >= d.periodStart, {
    message: 'End date must be on or after the start date',
    path: ['periodEnd'],
  })

export const createExpenseReportRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof createRequestSchema>) => createRequestSchema.parse(data))
  .handler(async ({ data }): Promise<ExpenseReportRequest> => {
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    // Only members linked to a member record may request a report.
    const { data: profileRow } = await supabase
      .from('user_profiles')
      .select('member_id')
      .eq('id', caller.userId)
      .single()
    const memberId = (profileRow as unknown as { member_id: string | null } | null)?.member_id ?? null
    if (!memberId) {
      throw new Error(
        "Your account isn't linked to a member record yet. Please contact an admin to link your account.",
      )
    }

    // Avoid duplicate pending requests for the exact same period.
    const { data: dupe } = await supabase
      .from('expense_report_requests')
      .select('id')
      .eq('requested_by', caller.userId)
      .eq('status', 'pending')
      .eq('period_start', data.periodStart)
      .eq('period_end', data.periodEnd)
      .maybeSingle()
    if (dupe) {
      throw new Error('You already have a pending request for this period.')
    }

    const { data: row, error } = await supabase
      .from('expense_report_requests')
      .insert({
        requested_by: caller.userId,
        member_id: memberId,
        period_start: data.periodStart,
        period_end: data.periodEnd,
        note: data.note ?? null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating expense report request:', error)
      throw new Error('Failed to submit request')
    }
    return row as ExpenseReportRequest
  })

// ============================================
// MEMBER: LIST OWN REQUESTS
// ============================================

export const getMyExpenseReportRequests = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string }) =>
    z.object({ accessToken: z.string() }).parse(data),
  )
  .handler(async ({ data }): Promise<ExpenseReportRequest[]> => {
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    const { data: rows, error } = await supabase
      .from('expense_report_requests')
      .select('*')
      .eq('requested_by', caller.userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading own expense report requests:', error)
      throw new Error('Failed to load your requests')
    }
    return (rows ?? []) as unknown as ExpenseReportRequest[]
  })

// ============================================
// MEMBER: VIEW A RELEASED REPORT (aggregate summary)
// ============================================

export const getMyExpenseReport = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; requestId: string }) =>
    z.object({ accessToken: z.string(), requestId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }): Promise<ExpenseReportSummary> => {
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    // The request must belong to the caller AND be released.
    const { data: reqRow, error: reqErr } = await supabase
      .from('expense_report_requests')
      .select('id, requested_by, status, period_start, period_end')
      .eq('id', data.requestId)
      .single()

    const req = reqRow as unknown as {
      id: string
      requested_by: string
      status: string
      period_start: string
      period_end: string
    } | null

    if (reqErr || !req) throw new Error('Report request not found')
    if (req.requested_by !== caller.userId) throw new Error('You do not have access to this report')
    if (req.status !== 'released') throw new Error('This report has not been released yet')

    return computeExpenseSummary(supabase, req.id, req.period_start, req.period_end)
  })

/**
 * Compute the aggregate church expense summary for a period. Expenses only,
 * church-wide, aggregated by category and satellite. No per-transaction rows.
 */
async function computeExpenseSummary(
  supabase: ReturnType<typeof createServerAdminClient>,
  requestId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ExpenseReportSummary> {
  const { data: rows, error } = await supabase
    .from('financial_transactions')
    .select('category, amount, satellite:satellites!financial_transactions_satellite_id_fkey(name)')
    .eq('transaction_type', 'expense')
    .gte('transaction_date', periodStart)
    .lte('transaction_date', periodEnd)

  if (error) {
    console.error('Error computing expense summary:', error)
    throw new Error('Failed to build the expense report')
  }

  type Row = { category: string; amount: number | string; satellite: { name: string } | null }
  const txs = (rows ?? []) as unknown as Row[]

  const categoryMap = new Map<string, { amount: number; count: number }>()
  const satelliteMap = new Map<string, number>()
  let totalExpenses = 0

  for (const tx of txs) {
    const amt = Number(tx.amount)
    totalExpenses += amt

    const cat = categoryMap.get(tx.category) ?? { amount: 0, count: 0 }
    cat.amount += amt
    cat.count += 1
    categoryMap.set(tx.category, cat)

    const satName = tx.satellite?.name ?? 'Unspecified'
    satelliteMap.set(satName, (satelliteMap.get(satName) ?? 0) + amt)
  }

  return {
    request_id: requestId,
    period_start: periodStart,
    period_end: periodEnd,
    totalExpenses,
    byCategory: [...categoryMap.entries()]
      .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount),
    bySatellite: [...satelliteMap.entries()]
      .map(([satellite_name, amount]) => ({ satellite_name, amount }))
      .sort((a, b) => b.amount - a.amount),
  }
}

// ============================================
// FINANCE: REVIEW QUEUE
// ============================================

export const listExpenseReportRequests = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; status?: string }) =>
    z
      .object({
        accessToken: z.string(),
        status: z.enum(['pending', 'released', 'rejected']).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<ExpenseReportRequestWithRequester[]> => {
    await requirePermission(data.accessToken, 'finances.read')
    const supabase = createServerAdminClient()

    let query = supabase.from('expense_report_requests').select('*')
    if (data.status) query = query.eq('status', data.status)
    query = query.order('created_at', { ascending: false })

    const { data: rows, error } = await query
    if (error) {
      console.error('Error listing expense report requests:', error)
      throw new Error('Failed to load requests')
    }
    const requests = (rows ?? []) as unknown as ExpenseReportRequest[]
    if (requests.length === 0) return []

    // Resolve requester member name + email.
    const memberIds = [...new Set(requests.map((r) => r.member_id).filter(Boolean))] as string[]
    const membersRes = memberIds.length
      ? await supabase.from('members').select('id, name').in('id', memberIds)
      : { data: [] as { id: string; name: string }[] }
    const memberName = new Map(
      ((membersRes.data ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]),
    )

    const emailById = new Map<string, string | null>()
    for (let page = 1; page <= 20; page++) {
      const { data: authPage, error: authErr } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (authErr) break
      for (const u of authPage.users) emailById.set(u.id, u.email ?? null)
      if (authPage.users.length < 200) break
    }

    return requests.map((r) => ({
      ...r,
      requester_email: emailById.get(r.requested_by) ?? null,
      requester_name: r.member_id ? memberName.get(r.member_id) ?? null : null,
    }))
  })

// ============================================
// FINANCE: RELEASE / REJECT
// ============================================

async function transitionRequest(
  accessToken: string,
  id: string,
  status: 'released' | 'rejected',
  note: string | null | undefined,
): Promise<ExpenseReportRequest> {
  const caller = await requirePermission(accessToken, 'finances.write')
  const supabase = createServerAdminClient()

  // Only pending requests can be acted upon.
  const { data: existing } = await supabase
    .from('expense_report_requests')
    .select('status')
    .eq('id', id)
    .single()
  const current = (existing as unknown as { status: string } | null)?.status
  if (!current) throw new Error('Request not found')
  if (current !== 'pending') throw new Error('This request has already been reviewed')

  const { data: row, error } = await supabase
    .from('expense_report_requests')
    .update({
      status,
      note: note ?? null,
      reviewed_by: caller.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`Error setting expense report request to ${status}:`, error)
    throw new Error('Failed to update the request')
  }
  return row as ExpenseReportRequest
}

export const releaseExpenseReportRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; note?: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid(), note: z.string().max(500).optional() }).parse(data),
  )
  .handler(({ data }) => transitionRequest(data.accessToken, data.id, 'released', data.note))

export const rejectExpenseReportRequest = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string; note?: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid(), note: z.string().max(500).optional() }).parse(data),
  )
  .handler(({ data }) => transitionRequest(data.accessToken, data.id, 'rejected', data.note))
