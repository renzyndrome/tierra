// Quest Laguna - Financial Management Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../components/AuthProvider'
import {
  getFinancialOverview,
  getFinancialTransactions,
  getFinancialChartData,
  getTitheInsights,
  createFinancialTransaction,
  updateFinancialTransaction,
  deleteFinancialTransaction,
} from '../../server/functions/finances'
import type { TitheInsights } from '../../server/functions/finances'
import { supabase } from '../../lib/supabase'
import { uploadReceipt } from '../../lib/storage'
import { seedFinancialData, purgeFinancialData } from '../../server/functions/seedData'
import type {
  FinancialOverview,
  FinancialTransactionWithRelations,
  PaginatedResult,
  Satellite,
  Member,
  TransactionType,
} from '../../lib/types'
import {
  ADMIN_PIN,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  getCategoriesByType,
  getCategoryColor,
  formatCurrency,
} from '../../lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export const Route = createFileRoute('/finances/')({
  component: FinancesPage,
})

function FinancesPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, profile } = useAuth()

  // Data state
  const [overview, setOverview] = useState<FinancialOverview | null>(null)
  const [transactions, setTransactions] = useState<PaginatedResult<FinancialTransactionWithRelations> | null>(null)
  const [chartData, setChartData] = useState<{
    monthlyData: { month: string; income: number; expenses: number }[]
    monthlyCategoryData: { month: string; Tithe: number; Offering: number; Missions: number; Expenses: number }[]
    incomeByCategoryData: { category: string; amount: number; color: string }[]
    expenseByCategoryData: { category: string; amount: number; color: string }[]
  } | null>(null)
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [insights, setInsights] = useState<TitheInsights | null>(null)

  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransactionWithRelations | null>(null)
  const [transactionToDelete, setTransactionToDelete] = useState<FinancialTransactionWithRelations | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Chart type state
  const [trendChartType, setTrendChartType] = useState<'bar' | 'line' | 'area'>('bar')
  const [compareChartType, setCompareChartType] = useState<'bar' | 'line' | 'area'>('bar')

  // Filter state
  const [filterSatelliteId, setFilterSatelliteId] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [filterStartDate, setFilterStartDate] = useState<string>('')
  const [filterEndDate, setFilterEndDate] = useState<string>('')
  const [filterMemberId, setFilterMemberId] = useState<string>('')
  const [filterMinAmount, setFilterMinAmount] = useState<string>('')
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>('')
  const [filterHasReceipt, setFilterHasReceipt] = useState<string>('')
  const [txSortBy, setTxSortBy] = useState<'transaction_date' | 'amount' | 'created_at'>('transaction_date')
  const [txSortOrder, setTxSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransactionWithRelations | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // Form state
  const [formType, setFormType] = useState<TransactionType>('income')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formCategory, setFormCategory] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formSatelliteId, setFormSatelliteId] = useState('')
  const [formMemberId, setFormMemberId] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formReferenceNumber, setFormReferenceNumber] = useState('')
  const [formReceiptFile, setFormReceiptFile] = useState<File | null>(null)
  const [formReceiptPreview, setFormReceiptPreview] = useState<string | null>(null)
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null)
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')

  // Seed/purge state
  const [isSeeding, setIsSeeding] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [seedMessage, setSeedMessage] = useState('')

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'satellite_leader'
  const isSuperAdmin = profile?.role === 'super_admin'
  const userSatelliteId = profile?.role === 'satellite_leader' ? profile.satellite_id : null

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/finances')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  // Fetch satellites and members for dropdowns
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchRefs = async () => {
      const [satsRes, memsRes] = await Promise.all([
        supabase.from('satellites').select('*').eq('is_active', true).order('name'),
        supabase.from('members').select('id, name').eq('is_archived', false).order('name'),
      ])
      if (satsRes.data) {
        setSatellites(satsRes.data as Satellite[])

        // Default satellite: satellite leader's own, or Quest Laguna Main
        if (userSatelliteId) {
          setFilterSatelliteId(userSatelliteId)
          setFormSatelliteId(userSatelliteId)
        } else {
          const mainSat = (satsRes.data as Satellite[]).find(s => s.name === 'Quest Laguna Main')
          if (mainSat) setFormSatelliteId(mainSat.id)
        }
      }
      if (memsRes.data) setMembers(memsRes.data as { id: string; name: string }[])
    }
    fetchRefs()
  }, [isAuthenticated, userSatelliteId])

  // Fetch overview + chart data + insights
  const fetchOverviewData = useCallback(async () => {
    try {
      const [overviewRes, chartRes, insightsRes] = await Promise.all([
        getFinancialOverview({
          data: {
            satelliteId: filterSatelliteId || undefined,
            startDate: filterStartDate || undefined,
            endDate: filterEndDate || undefined,
          },
        }),
        getFinancialChartData({
          data: {
            satelliteId: filterSatelliteId || undefined,
            months: 6,
          },
        }),
        getTitheInsights({
          data: {
            satelliteId: filterSatelliteId || undefined,
          },
        }),
      ])
      setOverview(overviewRes)
      setChartData(chartRes)
      setInsights(insightsRes)
    } catch (error) {
      console.error('Error fetching overview:', error)
    }
  }, [filterSatelliteId, filterStartDate, filterEndDate])

  // Fetch transactions list
  const fetchTransactions = useCallback(async () => {
    try {
      const minAmt = filterMinAmount ? parseFloat(filterMinAmount) : undefined
      const maxAmt = filterMaxAmount ? parseFloat(filterMaxAmount) : undefined
      const res = await getFinancialTransactions({
        data: {
          search: filterSearch || undefined,
          satelliteId: filterSatelliteId || undefined,
          transactionType: (filterType as TransactionType) || undefined,
          category: filterCategory || undefined,
          startDate: filterStartDate || undefined,
          endDate: filterEndDate || undefined,
          memberId: filterMemberId || undefined,
          minAmount: minAmt && minAmt > 0 ? minAmt : undefined,
          maxAmount: maxAmt && maxAmt > 0 ? maxAmt : undefined,
          hasReceipt: filterHasReceipt === 'yes' ? true : filterHasReceipt === 'no' ? false : undefined,
          page: currentPage,
          limit: 20,
          sortBy: txSortBy,
          sortOrder: txSortOrder,
        },
      })
      setTransactions(res)
    } catch (error) {
      console.error('Error fetching transactions:', error)
    }
  }, [filterSatelliteId, filterType, filterCategory, filterSearch, filterStartDate, filterEndDate, filterMemberId, filterMinAmount, filterMaxAmount, filterHasReceipt, txSortBy, txSortOrder, currentPage])

  // Fetch overview when overview-relevant filters change (satellite, date range)
  useEffect(() => {
    if (!isAuthenticated) return
    setIsLoading(true)
    fetchOverviewData().finally(() => setIsLoading(false))
  }, [isAuthenticated, fetchOverviewData])

  // Fetch transactions when any filter changes (search, type, category, page, etc.)
  useEffect(() => {
    if (!isAuthenticated) return
    fetchTransactions()
  }, [isAuthenticated, fetchTransactions])

  // Get default satellite id
  const getDefaultSatelliteId = () => {
    if (userSatelliteId) return userSatelliteId
    const mainSat = satellites.find(s => s.name === 'Quest Laguna Main')
    return mainSat?.id || ''
  }

  // Reset form
  const resetForm = () => {
    setFormType('income')
    setFormDate(new Date().toISOString().split('T')[0])
    setFormCategory('')
    setFormAmount('')
    setFormSatelliteId(getDefaultSatelliteId())
    setFormMemberId('')
    setFormDescription('')
    setFormReferenceNumber('')
    setFormReceiptFile(null)
    setFormReceiptPreview(null)
    setExistingReceiptUrl(null)
    setFormNotes('')
    setFormError('')
    setEditingTransaction(null)
  }

  // Open form for new transaction
  const openNewTransaction = (type: TransactionType) => {
    resetForm()
    setFormType(type)
    setShowFormDialog(true)
  }

  // Open form for editing
  const openEditTransaction = (tx: FinancialTransactionWithRelations) => {
    setEditingTransaction(tx)
    setFormType(tx.transaction_type)
    setFormDate(tx.transaction_date)
    setFormCategory(tx.category)
    setFormAmount(String(tx.amount))
    setFormSatelliteId(tx.satellite_id)
    setFormMemberId(tx.member_id || '')
    setFormDescription(tx.description || '')
    setFormReferenceNumber(tx.reference_number || '')
    setFormReceiptFile(null)
    setFormReceiptPreview(null)
    setExistingReceiptUrl(tx.receipt_url || null)
    setFormNotes(tx.notes || '')
    setFormError('')
    setShowFormDialog(true)
  }

  // Save transaction
  const handleSaveTransaction = async () => {
    setFormError('')

    // Validate
    const amount = parseFloat(formAmount)
    if (!formDate) return setFormError('Date is required')
    if (!formCategory) return setFormError('Category is required')
    if (!amount || amount <= 0) return setFormError('Enter a valid amount')
    if (!formSatelliteId) return setFormError('Select a satellite')

    setIsSaving(true)
    try {
      // Upload receipt if file selected
      let receiptUrl: string | null = existingReceiptUrl
      if (formReceiptFile) {
        const { url, error: uploadError } = await uploadReceipt(formReceiptFile)
        if (uploadError) {
          setFormError(`Receipt upload failed: ${uploadError.message}`)
          setIsSaving(false)
          return
        }
        receiptUrl = url
      }

      const payload = {
        transaction_date: formDate,
        transaction_type: formType as TransactionType,
        category: formCategory,
        amount,
        satellite_id: formSatelliteId,
        member_id: (formType === 'income' && formMemberId) ? formMemberId : null,
        description: formDescription.trim() || undefined,
        reference_number: formReferenceNumber.trim() || undefined,
        receipt_url: receiptUrl || undefined,
        notes: formNotes.trim() || undefined,
      }

      if (editingTransaction) {
        await updateFinancialTransaction({
          data: { id: editingTransaction.id, updates: payload },
        })
      } else {
        await createFinancialTransaction({ data: payload as any })
      }

      setShowFormDialog(false)
      resetForm()
      await Promise.all([fetchOverviewData(), fetchTransactions()])
    } catch (error) {
      console.error('Error saving transaction:', error)
      const msg = error instanceof Error ? error.message : 'Unknown error'
      setFormError(`Failed to save transaction: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  // Delete transaction
  const handleDeleteTransaction = async () => {
    if (!transactionToDelete) return
    setIsDeleting(true)
    try {
      await deleteFinancialTransaction({ data: { id: transactionToDelete.id } })
      setShowDeleteDialog(false)
      setTransactionToDelete(null)
      await Promise.all([fetchOverviewData(), fetchTransactions()])
    } catch (error) {
      console.error('Error deleting transaction:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  // CSV Export
  const handleExportCSV = () => {
    if (!transactions?.data.length) return

    const headers = ['Date', 'Type', 'Category', 'Amount', 'Description', 'Satellite', 'Member', 'Reference', 'Receipt', 'Notes']
    const rows = transactions.data.map((tx) => [
      tx.transaction_date,
      tx.transaction_type,
      tx.category,
      tx.amount,
      tx.description || '',
      tx.satellite?.name || '',
      tx.member?.name || '',
      tx.reference_number || '',
      tx.receipt_url || '',
      tx.notes || '',
    ])

    const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `finances_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // Seed financial test data
  const handleSeedFinancial = async () => {
    setIsSeeding(true)
    setSeedMessage('')
    try {
      const adminPin = ADMIN_PIN
      const result = await seedFinancialData({ data: { adminPin } })
      setSeedMessage(`Seeded ${result.count} transactions (${result.summary.income} income, ${result.summary.expenses} expenses)`)
      await Promise.all([fetchOverviewData(), fetchTransactions()])
    } catch (error) {
      setSeedMessage(`Error: ${error instanceof Error ? error.message : 'Failed to seed'}`)
    } finally {
      setIsSeeding(false)
    }
  }

  // Purge financial data
  const handlePurgeFinancial = async () => {
    if (!confirm('Are you sure you want to delete ALL financial transactions? This cannot be undone.')) return
    setIsPurging(true)
    setSeedMessage('')
    try {
      const adminPin = ADMIN_PIN
      const result = await purgeFinancialData({ data: { adminPin } })
      setSeedMessage(`Purged ${result.deleted} transactions`)
      await Promise.all([fetchOverviewData(), fetchTransactions()])
    } catch (error) {
      setSeedMessage(`Error: ${error instanceof Error ? error.message : 'Failed to purge'}`)
    } finally {
      setIsPurging(false)
    }
  }

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1538]" />
      </div>
    )
  }

  if (!isAuthenticated) return null

  // Not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <p className="text-lg font-medium text-gray-900 mb-2">Access Restricted</p>
            <p className="text-gray-600 mb-4">Only administrators can access the financial dashboard.</p>
            <Link to="/admin">
              <Button>Back to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const categories = getCategoriesByType(formType)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link to="/admin" className="text-sm text-gray-500 hover:text-gray-700">
                  Dashboard
                </Link>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-700">Finances</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Financial Management</h1>
              <p className="text-sm text-gray-500">Track tithes, offerings, and expenses</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => openNewTransaction('income')} className="bg-emerald-600 hover:bg-emerald-700">
                + Record Income
              </Button>
              <Button onClick={() => openNewTransaction('expense')} className="bg-red-600 hover:bg-red-700">
                + Record Expense
              </Button>
              <Button variant="outline" onClick={handleExportCSV} disabled={!transactions?.data.length}>
                Export CSV
              </Button>
              {isSuperAdmin && (
                <>
                  <Button variant="outline" onClick={handleSeedFinancial} disabled={isSeeding}>
                    {isSeeding ? 'Seeding...' : 'Seed Test Data'}
                  </Button>
                  <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={handlePurgeFinancial} disabled={isPurging}>
                    {isPurging ? 'Purging...' : 'Purge All'}
                  </Button>
                </>
              )}
            </div>
            {seedMessage && (
              <p className={`text-sm mt-2 ${seedMessage.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                {seedMessage}
              </p>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mt-4">
            <select
              className="border rounded-md px-3 py-1.5 text-sm"
              value={filterSatelliteId}
              onChange={(e) => { setFilterSatelliteId(e.target.value); setCurrentPage(1) }}
              disabled={!!userSatelliteId}
            >
              <option value="">All Satellites</option>
              {satellites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Input
              type="date"
              className="w-auto"
              value={filterStartDate}
              onChange={(e) => { setFilterStartDate(e.target.value); setCurrentPage(1) }}
              placeholder="Start date"
            />
            <Input
              type="date"
              className="w-auto"
              value={filterEndDate}
              onChange={(e) => { setFilterEndDate(e.target.value); setCurrentPage(1) }}
              placeholder="End date"
            />
            {(filterSatelliteId || filterStartDate || filterEndDate || filterType || filterCategory || filterSearch || filterMemberId || filterMinAmount || filterMaxAmount || filterHasReceipt) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!userSatelliteId) setFilterSatelliteId('')
                  setFilterStartDate('')
                  setFilterEndDate('')
                  setFilterType('')
                  setFilterCategory('')
                  setFilterSearch('')
                  setSearchInput('')
                  setFilterMemberId('')
                  setFilterMinAmount('')
                  setFilterMaxAmount('')
                  setFilterHasReceipt('')
                  setTxSortBy('transaction_date')
                  setTxSortOrder('desc')
                  setCurrentPage(1)
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1538]" />
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">Current Balance</p>
                  <p className={`text-2xl font-bold ${(overview?.currentBalance ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(overview?.currentBalance ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">Total Income</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    {formatCurrency(overview?.totalIncome ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-gray-500">Total Expenses</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(overview?.totalExpenses ?? 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="bg-white border shadow-sm p-1 h-auto rounded-lg">
                <TabsTrigger value="overview" className="data-[state=active]:bg-[#8B1538] data-[state=active]:text-white data-[state=active]:shadow-sm px-6 py-2.5 text-sm font-semibold rounded-md transition-all">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="transactions" className="data-[state=active]:bg-[#8B1538] data-[state=active]:text-white data-[state=active]:shadow-sm px-6 py-2.5 text-sm font-semibold rounded-md transition-all">
                  Transactions
                </TabsTrigger>
              </TabsList>

              {/* OVERVIEW TAB */}
              <TabsContent value="overview" className="space-y-6 mt-4">
                {/* Month-over-Month Insights */}
                {insights && (
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Tithes', current: insights.currentMonth.tithe, previous: insights.previousMonth.tithe, change: insights.titheChange },
                      { label: 'Offerings', current: insights.currentMonth.offering, previous: insights.previousMonth.offering, change: insights.offeringChange },
                      { label: 'Missions', current: insights.currentMonth.missions, previous: insights.previousMonth.missions, change: insights.missionsChange },
                      { label: 'Total Income', current: insights.currentMonth.totalIncome, previous: insights.previousMonth.totalIncome, change: insights.incomeChange },
                      { label: 'Total Expenses', current: insights.currentMonth.totalExpenses, previous: insights.previousMonth.totalExpenses, change: insights.expensesChange },
                    ].map((item) => (
                      <Card key={item.label}>
                        <CardContent className="p-4">
                          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{item.label}</p>
                          <p className="text-lg font-bold mt-1">{formatCurrency(item.current)}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            {item.change > 0 ? (
                              <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                            ) : item.change < 0 ? (
                              <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                            )}
                            <span className={`text-xs font-medium ${item.change > 0 ? 'text-emerald-600' : item.change < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {item.change > 0 ? '+' : ''}{item.change}%
                            </span>
                            <span className="text-xs text-gray-400">vs {insights.previousMonth.label}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{insights.previousMonth.label}: {formatCurrency(item.previous)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Monthly Category Breakdown Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Monthly Breakdown</CardTitle>
                        <CardDescription>Tithes, Offerings, Missions & Expenses over the last 6 months</CardDescription>
                      </div>
                      <div className="flex bg-gray-100 rounded-lg p-0.5">
                        {([['bar', 'Bar'], ['line', 'Line'], ['area', 'Area']] as const).map(([type, label]) => (
                          <button
                            key={type}
                            onClick={() => setCompareChartType(type)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${compareChartType === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[320px]">
                      {chartData?.monthlyCategoryData.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          {(() => {
                            const monthTickFormatter = (v: string) => {
                              const [y, m] = v.split('-')
                              return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'short' })
                            }
                            const chartProps = { data: chartData.monthlyCategoryData, margin: { top: 5, right: 20, left: 10, bottom: 5 } }
                            const axisProps = {
                              xAxis: { dataKey: 'month' as const, tickFormatter: monthTickFormatter, tick: { fontSize: 12 } },
                              yAxis: { tickFormatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) },
                            }
                            const tooltipLabelFormatter = (label: string) => {
                              const [y, m] = label.split('-')
                              return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' })
                            }
                            const tooltipProps = { formatter: (v: number) => formatCurrency(v), labelFormatter: tooltipLabelFormatter, contentStyle: { borderRadius: '8px', border: '1px solid #e5e7eb' } }
                            const series = [
                              { key: 'Tithe', color: '#10B981' },
                              { key: 'Offering', color: '#3B82F6' },
                              { key: 'Missions', color: '#8B5CF6' },
                              { key: 'Expenses', color: '#EF4444' },
                            ]

                            if (compareChartType === 'line') {
                              return (
                                <LineChart {...chartProps}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis {...axisProps.xAxis} />
                                  <YAxis {...axisProps.yAxis} />
                                  <Tooltip {...tooltipProps} />
                                  <Legend />
                                  {series.map((s) => (
                                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2.5} dot={{ r: 4, fill: s.color, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} name={s.key} />
                                  ))}
                                </LineChart>
                              )
                            }
                            if (compareChartType === 'area') {
                              return (
                                <AreaChart {...chartProps}>
                                  <defs>
                                    {series.map((s) => (
                                      <linearGradient key={s.key} id={`grad${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                                        <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                                      </linearGradient>
                                    ))}
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                  <XAxis {...axisProps.xAxis} />
                                  <YAxis {...axisProps.yAxis} />
                                  <Tooltip {...tooltipProps} />
                                  <Legend />
                                  {series.map((s) => (
                                    <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#grad${s.key})`} name={s.key} />
                                  ))}
                                </AreaChart>
                              )
                            }
                            // Default: bar
                            return (
                              <BarChart {...chartProps}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis {...axisProps.xAxis} />
                                <YAxis {...axisProps.yAxis} />
                                <Tooltip {...tooltipProps} />
                                <Legend />
                                {series.map((s) => (
                                  <Bar key={s.key} dataKey={s.key} fill={s.color} name={s.key} radius={[4, 4, 0, 0]} />
                                ))}
                              </BarChart>
                            )
                          })()}
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                          No data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Monthly Income vs Expenses Trend */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Monthly Income vs Expenses</CardTitle>
                        <CardDescription>Last 6 months</CardDescription>
                      </div>
                      <div className="flex bg-gray-100 rounded-lg p-0.5">
                        {([['bar', 'Bar'], ['line', 'Line'], ['area', 'Area']] as const).map(([type, label]) => (
                          <button
                            key={type}
                            onClick={() => setTrendChartType(type)}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${trendChartType === type ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      {chartData?.monthlyData.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                          {trendChartType === 'bar' ? (
                            <BarChart data={chartData.monthlyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis
                                dataKey="month"
                                tickFormatter={(v) => {
                                  const [y, m] = v.split('-')
                                  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'short' })
                                }}
                              />
                              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                              <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(label: string) => { const [y, m] = label.split('-'); return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' }) }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                              <Legend />
                              <Bar dataKey="income" fill="#10B981" name="Income" radius={[6, 6, 0, 0]} />
                              <Bar dataKey="expenses" fill="#EF4444" name="Expenses" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          ) : trendChartType === 'line' ? (
                            <LineChart data={chartData.monthlyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis
                                dataKey="month"
                                tickFormatter={(v) => {
                                  const [y, m] = v.split('-')
                                  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'short' })
                                }}
                              />
                              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                              <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(label: string) => { const [y, m] = label.split('-'); return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' }) }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                              <Legend />
                              <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2.5} dot={{ r: 5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} name="Income" />
                              <Line type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 5, fill: '#EF4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7 }} name="Expenses" />
                            </LineChart>
                          ) : (
                            <AreaChart data={chartData.monthlyData}>
                              <defs>
                                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                              <XAxis
                                dataKey="month"
                                tickFormatter={(v) => {
                                  const [y, m] = v.split('-')
                                  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'short' })
                                }}
                              />
                              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                              <Tooltip formatter={(v: number) => formatCurrency(v)} labelFormatter={(label: string) => { const [y, m] = label.split('-'); return new Date(Number(y), Number(m) - 1).toLocaleDateString('en', { month: 'long', year: 'numeric' }) }} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                              <Legend />
                              <Area type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} fill="url(#gradIncome)" name="Income" />
                              <Area type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} fill="url(#gradExpenses)" name="Expenses" />
                            </AreaChart>
                          )}
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                          No data available
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Category Breakdown — Horizontal Bar Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Income by Category */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Income by Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {chartData?.incomeByCategoryData.length ? (
                        <div className="space-y-3">
                          {(() => {
                            const maxAmt = Math.max(...chartData.incomeByCategoryData.map((d) => d.amount))
                            const total = chartData.incomeByCategoryData.reduce((s, d) => s + d.amount, 0)
                            return chartData.incomeByCategoryData
                              .sort((a, b) => b.amount - a.amount)
                              .map((d) => (
                                <div key={d.category}>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                      <span className="text-sm font-medium">{d.category}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold">{formatCurrency(d.amount)}</span>
                                      <span className="text-xs text-gray-400 w-10 text-right">{total > 0 ? `${((d.amount / total) * 100).toFixed(0)}%` : '0%'}</span>
                                    </div>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{ width: `${maxAmt > 0 ? (d.amount / maxAmt) * 100 : 0}%`, backgroundColor: d.color }}
                                    />
                                  </div>
                                </div>
                              ))
                          })()}
                          <div className="pt-2 border-t mt-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-gray-500">Total</span>
                              <span className="font-bold text-emerald-600">{formatCurrency(chartData.incomeByCategoryData.reduce((s, d) => s + d.amount, 0))}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-400">No income data</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Expenses by Category */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Expenses by Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {chartData?.expenseByCategoryData.length ? (
                        <div className="space-y-3">
                          {(() => {
                            const maxAmt = Math.max(...chartData.expenseByCategoryData.map((d) => d.amount))
                            const total = chartData.expenseByCategoryData.reduce((s, d) => s + d.amount, 0)
                            return chartData.expenseByCategoryData
                              .sort((a, b) => b.amount - a.amount)
                              .map((d) => (
                                <div key={d.category}>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                                      <span className="text-sm font-medium">{d.category}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold">{formatCurrency(d.amount)}</span>
                                      <span className="text-xs text-gray-400 w-10 text-right">{total > 0 ? `${((d.amount / total) * 100).toFixed(0)}%` : '0%'}</span>
                                    </div>
                                  </div>
                                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{ width: `${maxAmt > 0 ? (d.amount / maxAmt) * 100 : 0}%`, backgroundColor: d.color }}
                                    />
                                  </div>
                                </div>
                              ))
                          })()}
                          <div className="pt-2 border-t mt-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium text-gray-500">Total</span>
                              <span className="font-bold text-red-600">{formatCurrency(chartData.expenseByCategoryData.reduce((s, d) => s + d.amount, 0))}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-400">No expense data</div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Satellite Summary */}
                {overview?.bySatellite.length ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>By Satellite</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Satellite</TableHead>
                            <TableHead className="text-right">Income</TableHead>
                            <TableHead className="text-right">Expenses</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {overview.bySatellite.map((s) => (
                            <TableRow key={s.satelliteId}>
                              <TableCell className="font-medium">{s.satelliteName}</TableCell>
                              <TableCell className="text-right text-emerald-600">{formatCurrency(s.income)}</TableCell>
                              <TableCell className="text-right text-red-600">{formatCurrency(s.expenses)}</TableCell>
                              <TableCell className={`text-right font-medium ${s.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                {formatCurrency(s.balance)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Recent Transactions */}
                {overview?.recentTransactions.length ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Transactions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {overview.recentTransactions.map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50 px-2 rounded"
                            onClick={() => openEditTransaction(tx)}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-2 h-2 rounded-full ${tx.transaction_type === 'income' ? 'bg-emerald-500' : 'bg-red-500'}`}
                              />
                              <div>
                                <p className="text-sm font-medium">{tx.category}</p>
                                <p className="text-xs text-gray-500">
                                  {tx.transaction_date} {tx.satellite?.name ? `· ${tx.satellite.name}` : ''}
                                  {tx.member?.name ? ` · ${tx.member.name}` : ''}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`font-medium ${tx.transaction_type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}
                            >
                              {tx.transaction_type === 'income' ? '+' : '-'}
                              {formatCurrency(Number(tx.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </TabsContent>

              {/* TRANSACTIONS TAB */}
              <TabsContent value="transactions" className="mt-4">
                <div className="space-y-4">
                  {/* Search & Filters Bar */}
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      {/* Row 1: Search + Search Button */}
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <Input
                            className="pl-9"
                            placeholder="Search member, satellite, category, amount, description, reference..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setFilterSearch(searchInput)
                                setCurrentPage(1)
                              }
                            }}
                          />
                        </div>
                        <Button
                          onClick={() => { setFilterSearch(searchInput); setCurrentPage(1) }}
                          size="sm"
                          className="whitespace-nowrap"
                        >
                          Search
                        </Button>
                      </div>

                      {/* Row 2: Filter dropdowns */}
                      <div className="flex flex-wrap gap-2">
                        {/* Type */}
                        <select
                          className="border rounded-md px-3 py-1.5 text-sm"
                          value={filterType}
                          onChange={(e) => {
                            setFilterType(e.target.value)
                            setFilterCategory('')
                            setCurrentPage(1)
                          }}
                        >
                          <option value="">All Types</option>
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                        </select>
                        {/* Category */}
                        <select
                          className="border rounded-md px-3 py-1.5 text-sm"
                          value={filterCategory}
                          onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1) }}
                        >
                          <option value="">All Categories</option>
                          {filterType !== 'expense' && (
                            <optgroup label="Income">
                              {INCOME_CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </optgroup>
                          )}
                          {filterType !== 'income' && (
                            <optgroup label="Expenses">
                              {EXPENSE_CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {/* Member */}
                        <select
                          className="border rounded-md px-3 py-1.5 text-sm"
                          value={filterMemberId}
                          onChange={(e) => { setFilterMemberId(e.target.value); setCurrentPage(1) }}
                        >
                          <option value="">All Members</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                        {/* Receipt */}
                        <select
                          className="border rounded-md px-3 py-1.5 text-sm"
                          value={filterHasReceipt}
                          onChange={(e) => { setFilterHasReceipt(e.target.value); setCurrentPage(1) }}
                        >
                          <option value="">Receipt</option>
                          <option value="yes">Has Receipt</option>
                          <option value="no">No Receipt</option>
                        </select>
                        {/* Amount Range */}
                        <Input
                          type="number"
                          placeholder="Min amount"
                          className="w-28"
                          value={filterMinAmount}
                          onChange={(e) => { setFilterMinAmount(e.target.value); setCurrentPage(1) }}
                          min="0"
                          step="0.01"
                        />
                        <Input
                          type="number"
                          placeholder="Max amount"
                          className="w-28"
                          value={filterMaxAmount}
                          onChange={(e) => { setFilterMaxAmount(e.target.value); setCurrentPage(1) }}
                          min="0"
                          step="0.01"
                        />
                        {/* Sort */}
                        <select
                          className="border rounded-md px-3 py-1.5 text-sm"
                          value={txSortBy}
                          onChange={(e) => { setTxSortBy(e.target.value as 'transaction_date' | 'amount' | 'created_at'); setCurrentPage(1) }}
                        >
                          <option value="transaction_date">Sort: Date</option>
                          <option value="amount">Sort: Amount</option>
                          <option value="created_at">Sort: Date Added</option>
                        </select>
                        <button
                          onClick={() => setTxSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                          className="px-3 py-1.5 border rounded-md text-sm bg-white hover:bg-gray-50"
                          title={txSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                        >
                          {txSortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                        </button>
                      </div>

                      {/* Active filter tags */}
                      {(filterSearch || filterType || filterCategory || filterMemberId || filterMinAmount || filterMaxAmount || filterHasReceipt || filterSatelliteId || filterStartDate || filterEndDate) && (
                        <div className="flex flex-wrap gap-2">
                          {filterSearch && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                              Search: "{filterSearch}"
                              <button onClick={() => { setFilterSearch(''); setSearchInput(''); setCurrentPage(1) }} className="hover:text-blue-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterType && (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${filterType === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                              {filterType === 'income' ? 'Income' : 'Expense'}
                              <button onClick={() => { setFilterType(''); setFilterCategory(''); setCurrentPage(1) }} className="hover:opacity-70">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterCategory && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getCategoryColor(filterCategory) }} />
                              {filterCategory}
                              <button onClick={() => { setFilterCategory(''); setCurrentPage(1) }} className="hover:text-purple-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterMemberId && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                              Member: {members.find(m => m.id === filterMemberId)?.name || 'Unknown'}
                              <button onClick={() => { setFilterMemberId(''); setCurrentPage(1) }} className="hover:text-indigo-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterHasReceipt && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-cyan-50 text-cyan-700 rounded-full text-xs font-medium">
                              {filterHasReceipt === 'yes' ? 'Has Receipt' : 'No Receipt'}
                              <button onClick={() => { setFilterHasReceipt(''); setCurrentPage(1) }} className="hover:text-cyan-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {(filterMinAmount || filterMaxAmount) && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">
                              Amount: {filterMinAmount ? formatCurrency(parseFloat(filterMinAmount)) : '0'} – {filterMaxAmount ? formatCurrency(parseFloat(filterMaxAmount)) : '∞'}
                              <button onClick={() => { setFilterMinAmount(''); setFilterMaxAmount(''); setCurrentPage(1) }} className="hover:text-amber-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterSatelliteId && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-xs font-medium">
                              Satellite: {satellites.find(s => s.id === filterSatelliteId)?.name || filterSatelliteId}
                              <button onClick={() => { if (!userSatelliteId) { setFilterSatelliteId(''); setCurrentPage(1) } }} className={userSatelliteId ? 'opacity-30 cursor-not-allowed' : 'hover:text-rose-900'}>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterStartDate && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium">
                              From: {new Date(filterStartDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              <button onClick={() => { setFilterStartDate(''); setCurrentPage(1) }} className="hover:text-teal-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                          {filterEndDate && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-medium">
                              To: {new Date(filterEndDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              <button onClick={() => { setFilterEndDate(''); setCurrentPage(1) }} className="hover:text-teal-900">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Table + Detail Split */}
                  <div className={`grid gap-4 ${selectedTransaction ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
                    {/* Table */}
                    <Card className={selectedTransaction ? 'lg:col-span-2' : ''}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            {transactions?.pagination.total ?? 0} Transaction{(transactions?.pagination.total ?? 0) !== 1 ? 's' : ''}
                          </CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="p-0">
                        {transactions?.data.length ? (
                          <>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-gray-50/50">
                                    <TableHead className="pl-6">Date</TableHead>
                                    <TableHead>Category</TableHead>
                                    <TableHead>Details</TableHead>
                                    <TableHead className="text-right pr-6">Amount</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {transactions.data.map((tx) => (
                                    <TableRow
                                      key={tx.id}
                                      className={`cursor-pointer transition-colors ${selectedTransaction?.id === tx.id ? 'bg-blue-50 hover:bg-blue-50' : 'hover:bg-gray-50'}`}
                                      onClick={() => setSelectedTransaction(selectedTransaction?.id === tx.id ? null : tx)}
                                    >
                                      <TableCell className="pl-6">
                                        <div className="flex items-center gap-2.5">
                                          <div className={`w-1.5 h-8 rounded-full ${tx.transaction_type === 'income' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                          <div>
                                            <p className="text-sm font-medium whitespace-nowrap">
                                              {new Date(tx.transaction_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </p>
                                            <p className="text-xs text-gray-400">
                                              {new Date(tx.transaction_date + 'T00:00:00').getFullYear()}
                                            </p>
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(tx.category) }} />
                                          <div>
                                            <p className="text-sm font-medium">{tx.category}</p>
                                            <p className="text-xs text-gray-400">{tx.transaction_type === 'income' ? 'Income' : 'Expense'}</p>
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div>
                                          <p className="text-sm text-gray-700 truncate max-w-[250px]">{tx.description || tx.satellite?.name || '-'}</p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            {tx.satellite?.name && <span className="text-xs text-gray-400">{tx.satellite.name}</span>}
                                            {tx.member?.name && <span className="text-xs text-gray-400">· {tx.member.name}</span>}
                                            {tx.receipt_url && (
                                              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                              </svg>
                                            )}
                                            {tx.reference_number && <span className="text-xs text-gray-400">· #{tx.reference_number}</span>}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="pr-6 text-right">
                                        <span className={`text-sm font-semibold ${tx.transaction_type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                                          {tx.transaction_type === 'income' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                                        </span>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>

                            {/* Pagination */}
                            {transactions.pagination.totalPages > 1 && (
                              <div className="flex items-center justify-between px-6 py-3 border-t">
                                <p className="text-sm text-gray-500">
                                  {(currentPage - 1) * 20 + 1}–{Math.min(currentPage * 20, transactions.pagination.total)} of {transactions.pagination.total}
                                </p>
                                <div className="flex gap-1">
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                                    First
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                    Prev
                                  </Button>
                                  <span className="flex items-center px-3 text-sm text-gray-500">
                                    {currentPage} / {transactions.pagination.totalPages}
                                  </span>
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(transactions.pagination.totalPages, p + 1))} disabled={currentPage === transactions.pagination.totalPages}>
                                    Next
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(transactions.pagination.totalPages)} disabled={currentPage === transactions.pagination.totalPages}>
                                    Last
                                  </Button>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-16 text-gray-400 px-6">
                            <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-base font-medium mb-1">No transactions found</p>
                            <p className="text-sm">{filterSearch || filterType || filterCategory ? 'Try adjusting your search or filters.' : 'Record your first income or expense to get started.'}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Detail Panel */}
                    {selectedTransaction && (
                      <Card className="lg:col-span-1 h-fit lg:sticky lg:top-6">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Transaction Details</CardTitle>
                            <button onClick={() => setSelectedTransaction(null)} className="text-gray-400 hover:text-gray-600">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Amount + type badge */}
                          <div className="text-center py-3 rounded-lg bg-gray-50">
                            <p className={`text-2xl font-bold ${selectedTransaction.transaction_type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}>
                              {selectedTransaction.transaction_type === 'income' ? '+' : '-'}{formatCurrency(Number(selectedTransaction.amount))}
                            </p>
                            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${selectedTransaction.transaction_type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {selectedTransaction.transaction_type === 'income' ? 'Income' : 'Expense'}
                            </span>
                          </div>

                          {/* Fields */}
                          <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Date</span>
                              <span className="font-medium">{new Date(selectedTransaction.transaction_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-gray-500">Category</span>
                              <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getCategoryColor(selectedTransaction.category) }} />
                                <span className="font-medium">{selectedTransaction.category}</span>
                              </div>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Satellite</span>
                              <span className="font-medium">{selectedTransaction.satellite?.name || '-'}</span>
                            </div>
                            {selectedTransaction.member?.name && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Member</span>
                                <span className="font-medium">{selectedTransaction.member.name}</span>
                              </div>
                            )}
                            {selectedTransaction.description && (
                              <div>
                                <span className="text-gray-500 block mb-0.5">Description</span>
                                <p className="font-medium">{selectedTransaction.description}</p>
                              </div>
                            )}
                            {selectedTransaction.reference_number && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Reference #</span>
                                <span className="font-medium font-mono text-xs">{selectedTransaction.reference_number}</span>
                              </div>
                            )}
                            {selectedTransaction.receipt_url && (
                              <div>
                                <span className="text-gray-500 block mb-1">Receipt</span>
                                {selectedTransaction.receipt_url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i) ? (
                                  <a href={selectedTransaction.receipt_url} target="_blank" rel="noopener noreferrer">
                                    <img src={selectedTransaction.receipt_url} alt="Receipt" className="max-h-40 rounded border hover:opacity-90 transition-opacity" />
                                  </a>
                                ) : (
                                  <a href={selectedTransaction.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                                    View receipt file
                                  </a>
                                )}
                              </div>
                            )}
                            {selectedTransaction.notes && (
                              <div>
                                <span className="text-gray-500 block mb-0.5">Notes</span>
                                <p className="text-gray-700">{selectedTransaction.notes}</p>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-2 border-t">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => { openEditTransaction(selectedTransaction); setSelectedTransaction(null) }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => {
                                setTransactionToDelete(selectedTransaction)
                                setShowDeleteDialog(true)
                                setSelectedTransaction(null)
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Transaction Form Dialog */}
      <Dialog open={showFormDialog} onOpenChange={(open) => { if (!open) { setShowFormDialog(false); resetForm() } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? 'Edit Transaction' : `Record ${formType === 'income' ? 'Income' : 'Expense'}`}
            </DialogTitle>
            <DialogDescription>
              {formType === 'income'
                ? 'Record tithes, offerings, or missions giving'
                : 'Record church expenses'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Type Toggle */}
            <div>
              <Label>Transaction Type</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    formType === 'income'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  onClick={() => { setFormType('income'); setFormCategory(''); setFormMemberId('') }}
                >
                  Income
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                    formType === 'expense'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  onClick={() => { setFormType('expense'); setFormCategory(''); setFormMemberId('') }}
                >
                  Expense
                </button>
              </div>
            </div>

            {/* Date */}
            <div>
              <Label htmlFor="tx-date">Date</Label>
              <Input
                id="tx-date"
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            {/* Category */}
            <div>
              <Label htmlFor="tx-category">Category</Label>
              <select
                id="tx-category"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
              >
                <option value="">Select category...</option>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} — {c.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <Label htmlFor="tx-amount">Amount (PHP)</Label>
              <Input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>

            {/* Satellite */}
            <div>
              <Label htmlFor="tx-satellite">Satellite</Label>
              <select
                id="tx-satellite"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={formSatelliteId}
                onChange={(e) => setFormSatelliteId(e.target.value)}
                disabled={!!userSatelliteId}
              >
                <option value="">Select satellite...</option>
                {satellites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Member (income only) */}
            {formType === 'income' && (
              <div>
                <Label htmlFor="tx-member">Member (optional)</Label>
                <select
                  id="tx-member"
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  value={formMemberId}
                  onChange={(e) => setFormMemberId(e.target.value)}
                >
                  <option value="">No member linked</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Description */}
            <div>
              <Label htmlFor="tx-desc">Description (optional)</Label>
              <Input
                id="tx-desc"
                placeholder="Brief description..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                maxLength={500}
              />
            </div>

            {/* Reference Number */}
            <div>
              <Label htmlFor="tx-ref">Reference Number (optional)</Label>
              <Input
                id="tx-ref"
                placeholder="Receipt #, check #, etc."
                value={formReferenceNumber}
                onChange={(e) => setFormReferenceNumber(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Receipt Upload */}
            <div>
              <Label htmlFor="tx-receipt">Receipt / Screenshot (optional)</Label>
              <div className="mt-1">
                <input
                  id="tx-receipt"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 file:cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setFormReceiptFile(file)
                    if (file && file.type.startsWith('image/')) {
                      const reader = new FileReader()
                      reader.onload = (ev) => setFormReceiptPreview(ev.target?.result as string)
                      reader.readAsDataURL(file)
                    } else {
                      setFormReceiptPreview(null)
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, GIF, or PDF. Max 10MB.</p>
              </div>
              {/* Preview */}
              {formReceiptPreview && (
                <div className="mt-2 relative">
                  <img src={formReceiptPreview} alt="Receipt preview" className="max-h-32 rounded border" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-500 hover:text-red-600"
                    onClick={() => {
                      setFormReceiptFile(null)
                      setFormReceiptPreview(null)
                      const input = document.getElementById('tx-receipt') as HTMLInputElement
                      if (input) input.value = ''
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {!formReceiptFile && existingReceiptUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <a href={existingReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                    View current receipt
                  </a>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={() => setExistingReceiptUrl(null)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="tx-notes">Notes (optional)</Label>
              <Textarea
                id="tx-notes"
                placeholder="Additional notes..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                maxLength={1000}
                rows={2}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowFormDialog(false); resetForm() }}>
              Cancel
            </Button>
            <Button onClick={handleSaveTransaction} disabled={isSaving}>
              {isSaving ? 'Saving...' : editingTransaction ? 'Update' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {transactionToDelete?.transaction_type} transaction
              for {transactionToDelete ? formatCurrency(Number(transactionToDelete.amount)) : ''}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleDeleteTransaction}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
