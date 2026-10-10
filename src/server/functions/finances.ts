// Quest Laguna - Financial Management Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { getCaller, requirePermission } from './_authGuard'
import type {
  FinancialTransaction,
  FinancialTransactionInsert,
  FinancialTransactionUpdate,
  FinancialTransactionWithRelations,
  FinancialOverview,
  MemberGivingStatement,
  MemberGivingEntry,
  MemberGivingCategoryTotal,
  PaginatedResult,
} from '../../lib/types'

// ============================================
// VALIDATION SCHEMAS
// ============================================

const transactionInsertSchema = z.object({
  transaction_date: z.string().min(1, 'Date is required'),
  transaction_type: z.enum(['income', 'expense']),
  category: z.string().min(1, 'Category is required'),
  amount: z
    .number()
    .positive('Amount must be greater than 0')
    .max(99999999.99, 'Amount is too large'),
  description: z.string().max(500).optional().nullable(),
  reference_number: z.string().max(100).optional().nullable(),
  satellite_id: z.string().uuid('Select a satellite'),
  member_id: z.string().uuid().optional().nullable(),
  receipt_url: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

const transactionUpdateSchema = transactionInsertSchema.partial()

const transactionFilterSchema = z.object({
  accessToken: z.string(),
  search: z.string().optional(),
  satelliteId: z.string().uuid().optional(),
  transactionType: z.enum(['income', 'expense']).optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  memberId: z.string().uuid().optional(),
  minAmount: z.number().min(0).optional(),
  maxAmount: z.number().min(0).optional(),
  hasReceipt: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['transaction_date', 'amount', 'created_at']).default('transaction_date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// ============================================
// GET FINANCIAL TRANSACTIONS (paginated + filtered)
// ============================================

export const getFinancialTransactions = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof transactionFilterSchema>) =>
    transactionFilterSchema.parse(data)
  )
  .handler(async ({ data }): Promise<PaginatedResult<FinancialTransactionWithRelations>> => {
    await requirePermission(data.accessToken, 'finances.read')
    const supabase = createServerAdminClient()

    const from = (data.page - 1) * data.limit
    const to = from + data.limit - 1

    let query = supabase
      .from('financial_transactions')
      .select(
        '*, satellite:satellites!financial_transactions_satellite_id_fkey(id, name), member:members!financial_transactions_member_id_fkey(id, name)',
        { count: 'exact' }
      )

    // Apply filters
    if (data.search) {
      const searchTerm = data.search.trim()

      // Search member names via a separate lookup (PostgREST can't search across joins in .or())
      const [membersRes, satellitesRes] = await Promise.all([
        supabase.from('members').select('id').ilike('name', `%${searchTerm}%`),
        supabase.from('satellites').select('id').ilike('name', `%${searchTerm}%`),
      ])

      let orConditions = `description.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%,reference_number.ilike.%${searchTerm}%,notes.ilike.%${searchTerm}%,transaction_type.ilike.%${searchTerm}%`

      // Match by amount if search term is a number
      const asNumber = parseFloat(searchTerm)
      if (!isNaN(asNumber)) {
        orConditions += `,amount.eq.${asNumber}`
      }

      if (membersRes.data && membersRes.data.length > 0) {
        const ids = membersRes.data.map((m) => m.id).join(',')
        orConditions += `,member_id.in.(${ids})`
      }

      if (satellitesRes.data && satellitesRes.data.length > 0) {
        const ids = satellitesRes.data.map((s) => s.id).join(',')
        orConditions += `,satellite_id.in.(${ids})`
      }

      query = query.or(orConditions)
    }
    if (data.satelliteId) {
      query = query.eq('satellite_id', data.satelliteId)
    }
    if (data.transactionType) {
      query = query.eq('transaction_type', data.transactionType)
    }
    if (data.category) {
      query = query.eq('category', data.category)
    }
    if (data.startDate) {
      query = query.gte('transaction_date', data.startDate)
    }
    if (data.endDate) {
      query = query.lte('transaction_date', data.endDate)
    }
    if (data.memberId) {
      query = query.eq('member_id', data.memberId)
    }
    if (data.minAmount !== undefined) {
      query = query.gte('amount', data.minAmount)
    }
    if (data.maxAmount !== undefined) {
      query = query.lte('amount', data.maxAmount)
    }
    if (data.hasReceipt === true) {
      query = query.not('receipt_url', 'is', null)
    } else if (data.hasReceipt === false) {
      query = query.is('receipt_url', null)
    }

    // Sort and paginate
    query = query
      .order(data.sortBy, { ascending: data.sortOrder === 'asc' })
      .range(from, to)

    const { data: transactions, error, count } = await query

    if (error) {
      console.error('Error fetching transactions:', error)
      throw new Error('Failed to fetch transactions')
    }

    const total = count || 0

    return {
      data: (transactions || []) as unknown as FinancialTransactionWithRelations[],
      pagination: {
        page: data.page,
        limit: data.limit,
        total,
        totalPages: Math.ceil(total / data.limit),
      },
    }
  })

// ============================================
// CREATE FINANCIAL TRANSACTION
// ============================================

const transactionCreateSchema = transactionInsertSchema.extend({
  accessToken: z.string(),
})

export const createFinancialTransaction = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof transactionCreateSchema>) =>
    transactionCreateSchema.parse(data)
  )
  .handler(async ({ data }): Promise<FinancialTransaction> => {
    await requirePermission(data.accessToken, 'finances.write')
    const supabase = createServerAdminClient()

    // Strip the auth token before it reaches the DB row.
    const { accessToken: _token, ...fields } = data

    // Enforce: member_id only for income
    const insertData: FinancialTransactionInsert = {
      ...fields,
      member_id: fields.transaction_type === 'income' ? fields.member_id : null,
    }

    const { data: transaction, error } = await supabase
      .from('financial_transactions')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('Error creating transaction:', error)
      throw new Error('Failed to create transaction')
    }

    return transaction as FinancialTransaction
  })

// ============================================
// UPDATE FINANCIAL TRANSACTION
// ============================================

export const updateFinancialTransaction = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { accessToken: string; id: string; updates: z.infer<typeof transactionUpdateSchema> }) =>
      z
        .object({
          accessToken: z.string(),
          id: z.string().uuid(),
          updates: transactionUpdateSchema,
        })
        .parse(data)
  )
  .handler(async ({ data }): Promise<FinancialTransaction> => {
    await requirePermission(data.accessToken, 'finances.write')
    const supabase = createServerAdminClient()

    const updateData: FinancialTransactionUpdate = { ...data.updates }

    // Enforce: member_id only for income
    if (updateData.transaction_type === 'expense') {
      updateData.member_id = null
    }

    const { data: transaction, error } = await supabase
      .from('financial_transactions')
      .update(updateData)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating transaction:', error)
      throw new Error('Failed to update transaction')
    }

    return transaction as FinancialTransaction
  })

// ============================================
// DELETE FINANCIAL TRANSACTION
// ============================================

export const deleteFinancialTransaction = createServerFn({ method: 'POST' })
  .inputValidator((data: { accessToken: string; id: string }) =>
    z.object({ accessToken: z.string(), id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'finances.write')
    const supabase = createServerAdminClient()

    const { error } = await supabase
      .from('financial_transactions')
      .delete()
      .eq('id', data.id)

    if (error) {
      console.error('Error deleting transaction:', error)
      throw new Error('Failed to delete transaction')
    }

    return { success: true }
  })

// ============================================
// GET FINANCIAL OVERVIEW (dashboard data)
// ============================================

export const getFinancialOverview = createServerFn({ method: 'GET' })
  .inputValidator((data: { accessToken: string; satelliteId?: string; startDate?: string; endDate?: string }) =>
    z
      .object({
        accessToken: z.string(),
        satelliteId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }): Promise<FinancialOverview> => {
    await requirePermission(data.accessToken, 'finances.read')
    const supabase = createServerAdminClient()

    // Build base query for all transactions
    let query = supabase
      .from('financial_transactions')
      .select(
        '*, satellite:satellites!financial_transactions_satellite_id_fkey(id, name), member:members!financial_transactions_member_id_fkey(id, name)'
      )

    if (data.satelliteId) {
      query = query.eq('satellite_id', data.satelliteId)
    }
    if (data.startDate) {
      query = query.gte('transaction_date', data.startDate)
    }
    if (data.endDate) {
      query = query.lte('transaction_date', data.endDate)
    }

    const { data: transactions, error } = await query.order('transaction_date', {
      ascending: false,
    })

    if (error) {
      console.error('Error fetching financial overview:', error)
      throw new Error('Failed to fetch financial overview')
    }

    const allTx = (transactions || []) as unknown as FinancialTransactionWithRelations[]

    // Calculate totals
    let totalIncome = 0
    let totalExpenses = 0
    const incomeByCategory: Record<string, number> = {}
    const expensesByCategory: Record<string, number> = {}
    const satelliteMap: Record<
      string,
      { satelliteId: string; satelliteName: string; income: number; expenses: number }
    > = {}

    for (const tx of allTx) {
      const amt = Number(tx.amount)
      const satId = tx.satellite_id
      const satName = tx.satellite?.name || 'Unknown'

      if (!satelliteMap[satId]) {
        satelliteMap[satId] = {
          satelliteId: satId,
          satelliteName: satName,
          income: 0,
          expenses: 0,
        }
      }

      if (tx.transaction_type === 'income') {
        totalIncome += amt
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] || 0) + amt
        satelliteMap[satId].income += amt
      } else {
        totalExpenses += amt
        expensesByCategory[tx.category] = (expensesByCategory[tx.category] || 0) + amt
        satelliteMap[satId].expenses += amt
      }
    }

    const bySatellite = Object.values(satelliteMap).map((s) => ({
      ...s,
      balance: s.income - s.expenses,
    }))

    // Recent 10 transactions
    const recentTransactions = allTx.slice(0, 10)

    return {
      currentBalance: totalIncome - totalExpenses,
      totalIncome,
      totalExpenses,
      incomeByCategory,
      expensesByCategory,
      bySatellite,
      recentTransactions,
    }
  })

// ============================================
// GET FINANCIAL CHART DATA (monthly breakdown)
// ============================================

export const getFinancialChartData = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { accessToken: string; satelliteId?: string; months?: number }) =>
      z
        .object({
          accessToken: z.string(),
          satelliteId: z.string().uuid().optional(),
          months: z.number().min(1).max(24).default(6),
        })
        .parse(data)
  )
  .handler(
    async ({
      data,
    }): Promise<{
      monthlyData: { month: string; income: number; expenses: number }[]
      monthlyCategoryData: { month: string; Tithe: number; Offering: number; Missions: number; Expenses: number }[]
      incomeByCategoryData: { category: string; amount: number; color: string }[]
      expenseByCategoryData: { category: string; amount: number; color: string }[]
    }> => {
      await requirePermission(data.accessToken, 'finances.read')
      const supabase = createServerAdminClient()

      // Calculate start date (N months ago)
      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - data.months)
      const startDateStr = startDate.toISOString().split('T')[0]

      let query = supabase
        .from('financial_transactions')
        .select('*')
        .gte('transaction_date', startDateStr)

      if (data.satelliteId) {
        query = query.eq('satellite_id', data.satelliteId)
      }

      const { data: transactions, error } = await query.order('transaction_date', {
        ascending: true,
      })

      if (error) {
        console.error('Error fetching chart data:', error)
        throw new Error('Failed to fetch chart data')
      }

      const allTx = (transactions || []) as FinancialTransaction[]

      // Monthly income vs expenses
      const monthlyMap: Record<string, { income: number; expenses: number }> = {}
      // Monthly breakdown by category (Tithe, Offering, Missions, Expenses)
      const monthlyCategoryMap: Record<string, { Tithe: number; Offering: number; Missions: number; Expenses: number }> = {}

      // Pre-fill months
      for (let i = 0; i < data.months; i++) {
        const d = new Date()
        d.setMonth(d.getMonth() - (data.months - 1 - i))
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthlyMap[key] = { income: 0, expenses: 0 }
        monthlyCategoryMap[key] = { Tithe: 0, Offering: 0, Missions: 0, Expenses: 0 }
      }

      // Category totals
      const incomeCategoryMap: Record<string, number> = {}
      const expenseCategoryMap: Record<string, number> = {}

      for (const tx of allTx) {
        const amt = Number(tx.amount)
        const monthKey = tx.transaction_date.substring(0, 7) // YYYY-MM

        if (monthlyMap[monthKey]) {
          if (tx.transaction_type === 'income') {
            monthlyMap[monthKey].income += amt
          } else {
            monthlyMap[monthKey].expenses += amt
          }
        }

        // Monthly category breakdown
        if (monthlyCategoryMap[monthKey]) {
          if (tx.transaction_type === 'expense') {
            monthlyCategoryMap[monthKey].Expenses += amt
          } else if (tx.category === 'Tithe') {
            monthlyCategoryMap[monthKey].Tithe += amt
          } else if (tx.category === 'Offering') {
            monthlyCategoryMap[monthKey].Offering += amt
          } else if (tx.category === 'Missions') {
            monthlyCategoryMap[monthKey].Missions += amt
          }
        }

        if (tx.transaction_type === 'income') {
          incomeCategoryMap[tx.category] = (incomeCategoryMap[tx.category] || 0) + amt
        } else {
          expenseCategoryMap[tx.category] = (expenseCategoryMap[tx.category] || 0) + amt
        }
      }

      // Import category colors
      const { INCOME_CATEGORIES, EXPENSE_CATEGORIES } = await import('../../lib/constants')

      const monthlyData = Object.entries(monthlyMap).map(([month, values]) => ({
        month,
        income: values.income,
        expenses: values.expenses,
      }))

      const incomeByCategoryData = Object.entries(incomeCategoryMap).map(
        ([category, amount]) => ({
          category,
          amount,
          color:
            INCOME_CATEGORIES.find((c) => c.value === category)?.color || '#6B7280',
        })
      )

      const expenseByCategoryData = Object.entries(expenseCategoryMap).map(
        ([category, amount]) => ({
          category,
          amount,
          color:
            EXPENSE_CATEGORIES.find((c) => c.value === category)?.color || '#6B7280',
        })
      )

      const monthlyCategoryData = Object.entries(monthlyCategoryMap).map(
        ([month, values]) => ({ month, ...values })
      )

      return {
        monthlyData,
        monthlyCategoryData,
        incomeByCategoryData,
        expenseByCategoryData,
      }
    }
  )

// ============================================
// GET TITHE INSIGHTS (month-over-month comparison)
// ============================================

export interface TitheInsights {
  currentMonth: { label: string; tithe: number; offering: number; missions: number; totalIncome: number; totalExpenses: number }
  previousMonth: { label: string; tithe: number; offering: number; missions: number; totalIncome: number; totalExpenses: number }
  titheChange: number // percentage change
  offeringChange: number
  missionsChange: number
  incomeChange: number
  expensesChange: number
}

export const getTitheInsights = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: { accessToken: string; satelliteId?: string }) =>
      z.object({ accessToken: z.string(), satelliteId: z.string().uuid().optional() }).parse(data)
  )
  .handler(async ({ data }): Promise<TitheInsights> => {
    await requirePermission(data.accessToken, 'finances.read')
    const supabase = createServerAdminClient()

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonthNum = now.getMonth() // 0-indexed

    // Current month range
    const currentStart = `${currentYear}-${String(currentMonthNum + 1).padStart(2, '0')}-01`
    const nextMonth = currentMonthNum === 11
      ? `${currentYear + 1}-01-01`
      : `${currentYear}-${String(currentMonthNum + 2).padStart(2, '0')}-01`

    // Previous month range
    const prevYear = currentMonthNum === 0 ? currentYear - 1 : currentYear
    const prevMonthNum = currentMonthNum === 0 ? 12 : currentMonthNum
    const prevStart = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-01`

    // Fetch both months in parallel
    let currentQuery = supabase
      .from('financial_transactions')
      .select('transaction_type, category, amount')
      .gte('transaction_date', currentStart)
      .lt('transaction_date', nextMonth)

    let prevQuery = supabase
      .from('financial_transactions')
      .select('transaction_type, category, amount')
      .gte('transaction_date', prevStart)
      .lt('transaction_date', currentStart)

    if (data.satelliteId) {
      currentQuery = currentQuery.eq('satellite_id', data.satelliteId)
      prevQuery = prevQuery.eq('satellite_id', data.satelliteId)
    }

    const [currentRes, prevRes] = await Promise.all([currentQuery, prevQuery])

    if (currentRes.error) throw new Error('Failed to fetch current month data')
    if (prevRes.error) throw new Error('Failed to fetch previous month data')

    const summarize = (txs: { transaction_type: string; category: string; amount: number }[]) => {
      let tithe = 0, offering = 0, missions = 0, totalIncome = 0, totalExpenses = 0
      for (const tx of txs) {
        const amt = Number(tx.amount)
        if (tx.transaction_type === 'income') {
          totalIncome += amt
          if (tx.category === 'Tithe') tithe += amt
          else if (tx.category === 'Offering') offering += amt
          else if (tx.category === 'Missions') missions += amt
        } else {
          totalExpenses += amt
        }
      }
      return { tithe, offering, missions, totalIncome, totalExpenses }
    }

    const current = summarize(currentRes.data || [])
    const prev = summarize(prevRes.data || [])

    const pctChange = (curr: number, previous: number) =>
      previous === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - previous) / previous) * 100)

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return {
      currentMonth: { label: `${monthNames[currentMonthNum]} ${currentYear}`, ...current },
      previousMonth: { label: `${monthNames[prevMonthNum - 1]} ${prevYear}`, ...prev },
      titheChange: pctChange(current.tithe, prev.tithe),
      offeringChange: pctChange(current.offering, prev.offering),
      missionsChange: pctChange(current.missions, prev.missions),
      incomeChange: pctChange(current.totalIncome, prev.totalIncome),
      expensesChange: pctChange(current.totalExpenses, prev.totalExpenses),
    }
  })

// ============================================
// MEMBER SELF-SERVICE: MY GIVING / STATEMENT OF ACCOUNT
// ============================================
//
// A member views their OWN contribution history (tithes / offerings / missions
// recorded against their member_id). The caller's member is resolved server-side
// from their access token — never from client input — so a member can only ever
// retrieve their own giving. member_id is only ever set on income rows (enforced
// by the chk_member_income_only DB constraint), and we additionally scope to
// transaction_type='income' as defense-in-depth. Unlike the admin finance area,
// this does not require the finances.* permission or the finance PIN, exactly
// like the "My Attendance" self-view.

const givingStatementSchema = z.object({
  accessToken: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional(),
})

export const getMyGivingStatement = createServerFn({ method: 'GET' })
  .inputValidator((data: z.infer<typeof givingStatementSchema>) =>
    givingStatementSchema.parse(data)
  )
  .handler(async ({ data }): Promise<MemberGivingStatement | null> => {
    const caller = await getCaller(data.accessToken)
    const supabase = createServerAdminClient()

    // Resolve the caller's own linked member (source of truth = their profile).
    const { data: profileRow } = await supabase
      .from('user_profiles')
      .select('member_id')
      .eq('id', caller.userId)
      .single()

    const profile = profileRow as unknown as { member_id: string | null } | null
    if (!profile?.member_id) return null

    const { data: memberRow } = await supabase
      .from('members')
      .select('id, name')
      .eq('id', profile.member_id)
      .single()

    const member = memberRow as unknown as { id: string; name: string } | null
    if (!member) return null

    let query = supabase
      .from('financial_transactions')
      .select(
        'id, transaction_date, category, amount, reference_number, description, satellite:satellites!financial_transactions_satellite_id_fkey(name)'
      )
      .eq('member_id', profile.member_id)
      .eq('transaction_type', 'income')

    if (data.startDate) query = query.gte('transaction_date', data.startDate)
    if (data.endDate) query = query.lte('transaction_date', data.endDate)

    query = query.order('transaction_date', { ascending: false })

    const { data: rows, error } = await query

    if (error) {
      console.error('Error loading giving statement:', error)
      throw new Error('Failed to load giving statement')
    }

    type Row = {
      id: string
      transaction_date: string
      category: string
      amount: number | string
      reference_number: string | null
      description: string | null
      satellite: { name: string } | null
    }

    const txs = (rows ?? []) as unknown as Row[]

    const entries: MemberGivingEntry[] = []
    const categoryMap = new Map<string, { amount: number; count: number }>()
    let totalGiven = 0
    let firstGiftDate: string | null = null
    let lastGiftDate: string | null = null

    for (const tx of txs) {
      const amt = Number(tx.amount)
      totalGiven += amt

      const cat = categoryMap.get(tx.category) ?? { amount: 0, count: 0 }
      cat.amount += amt
      cat.count += 1
      categoryMap.set(tx.category, cat)

      // rows are ordered newest-first; track the true min/max defensively.
      if (!lastGiftDate || tx.transaction_date > lastGiftDate) lastGiftDate = tx.transaction_date
      if (!firstGiftDate || tx.transaction_date < firstGiftDate) firstGiftDate = tx.transaction_date

      entries.push({
        id: tx.id,
        transaction_date: tx.transaction_date,
        category: tx.category as MemberGivingEntry['category'],
        amount: amt,
        reference_number: tx.reference_number,
        description: tx.description,
        satellite_name: tx.satellite?.name ?? null,
      })
    }

    const byCategory: MemberGivingCategoryTotal[] = [...categoryMap.entries()]
      .map(([category, v]) => ({ category, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount)

    return {
      member: { id: member.id, name: member.name },
      totalGiven,
      giftCount: txs.length,
      byCategory,
      firstGiftDate,
      lastGiftDate,
      range: { startDate: data.startDate ?? null, endDate: data.endDate ?? null },
      entries,
    }
  })
