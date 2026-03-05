// Quest Laguna - Financial Management Server Functions

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import type {
  FinancialTransaction,
  FinancialTransactionInsert,
  FinancialTransactionUpdate,
  FinancialTransactionWithRelations,
  FinancialOverview,
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
  receipt_url: z.string().url().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
})

const transactionUpdateSchema = transactionInsertSchema.partial()

const transactionFilterSchema = z.object({
  search: z.string().optional(),
  satelliteId: z.string().uuid().optional(),
  transactionType: z.enum(['income', 'expense']).optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  memberId: z.string().uuid().optional(),
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
      // Search member names via a separate lookup (PostgREST can't search across joins in .or())
      const { data: matchingMembers } = await supabase
        .from('members')
        .select('id')
        .ilike('name', `%${data.search}%`)

      let orConditions = `description.ilike.%${data.search}%,category.ilike.%${data.search}%,reference_number.ilike.%${data.search}%,notes.ilike.%${data.search}%`

      if (matchingMembers && matchingMembers.length > 0) {
        const ids = matchingMembers.map((m) => m.id).join(',')
        orConditions += `,member_id.in.(${ids})`
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

export const createFinancialTransaction = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof transactionInsertSchema>) =>
    transactionInsertSchema.parse(data)
  )
  .handler(async ({ data }): Promise<FinancialTransaction> => {
    const supabase = createServerAdminClient()

    // Enforce: member_id only for income
    const insertData: FinancialTransactionInsert = {
      ...data,
      member_id: data.transaction_type === 'income' ? data.member_id : null,
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
    (data: { id: string; updates: z.infer<typeof transactionUpdateSchema> }) =>
      z
        .object({
          id: z.string().uuid(),
          updates: transactionUpdateSchema,
        })
        .parse(data)
  )
  .handler(async ({ data }): Promise<FinancialTransaction> => {
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
  .inputValidator((data: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(data)
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
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
  .inputValidator((data: { satelliteId?: string; startDate?: string; endDate?: string }) =>
    z
      .object({
        satelliteId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }): Promise<FinancialOverview> => {
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
    (data: { satelliteId?: string; months?: number }) =>
      z
        .object({
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
    (data: { satelliteId?: string }) =>
      z.object({ satelliteId: z.string().uuid().optional() }).parse(data)
  )
  .handler(async ({ data }): Promise<TitheInsights> => {
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
