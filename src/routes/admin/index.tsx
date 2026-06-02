// Quest Laguna Directory - Admin Dashboard (Protected)

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { supabase } from '../../lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { purgeAllData, seedTestAccounts } from '../../server/functions/seedData'
import { importSpreadsheetData, relinkMemberRelationships, generateCellGroupsFromDisciplers } from '../../server/functions/importMembers'
import { createCellGroup, updateCellGroup, deleteCellGroup } from '../../server/functions/cellGroups'
import { createMinistry, updateMinistry, deleteMinistry } from '../../server/functions/ministries'
import { addSatellite, deleteSatellite } from '../../server/functions/satellites'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { MemberCard, MemberCardSkeleton } from '../../components/MemberCard'
import { MembersTabContent } from '../../components/MembersTabContent'
import { CellGroupCard, CellGroupCardSkeleton } from '../../components/CellGroupCard'
import { MinistryCard, MinistryCardSkeleton } from '../../components/MinistryCard'
import type { Member, CellGroupWithRelations, MinistryWithRelations, Satellite, EventWithStats, FinancialOverview, InventoryItem, InventoryCategory } from '../../lib/types'
import { getEvents } from '../../server/functions/events'
import { getFinancialOverview } from '../../server/functions/finances'
import { getInventoryItems, createInventoryItem, updateInventoryItem, deleteInventoryItem, getInventoryCategories, createInventoryCategory, deleteInventoryCategory } from '../../server/functions/inventory'
import { uploadInventoryPhoto } from '../../lib/storage'
import { ADMIN_PIN, formatCurrency, formatNumber, INVENTORY_LOCATIONS, INVENTORY_CONDITIONS } from '../../lib/constants'
import { downloadExcel, downloadPDF } from '../../lib/export'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || undefined,
  }),
})

function AdminDashboard() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, profile, signOut } = useAuth()

  // Data states
  const [members, setMembers] = useState<Member[]>([])
  const [cellGroups, setCellGroups] = useState<CellGroupWithRelations[]>([])
  const [ministries, setMinistries] = useState<MinistryWithRelations[]>([])
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [events, setEvents] = useState<EventWithStats[]>([])
  const [financialOverview, setFinancialOverview] = useState<FinancialOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSatellite, setSelectedSatellite] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { tab: searchTab } = Route.useSearch()
  const [activeTab, setActiveTab] = useState(searchTab || 'overview')

  // Keep the visible tab in sync with the URL search param. Without this, the tab is
  // seeded from the URL only on first mount, so browser back/forward and deep links
  // to /admin?tab=X (while the dashboard is already mounted) would not switch the tab
  // until a full browser refresh. Re-lock the finances gate when leaving that tab.
  useEffect(() => {
    const next = searchTab || 'overview'
    setActiveTab(prev => (prev === next ? prev : next))
    if (next !== 'finances') {
      setFinancesUnlocked(false)
      setFinancesPinInput('')
      setFinancesPinError('')
    }
  }, [searchTab])

  // Satellite detail view
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null)

  // Admin setup
  const [isSettingUpAdmin, setIsSettingUpAdmin] = useState(false)
  const [adminSetupResult, setAdminSetupResult] = useState<string | null>(null)

  // Finances PIN gate
  const [financesUnlocked, setFinancesUnlocked] = useState(false)
  const [financesPinInput, setFinancesPinInput] = useState('')
  const [financesPinError, setFinancesPinError] = useState('')

  const handleFinancesPinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (financesPinInput === ADMIN_PIN) {
      setFinancesUnlocked(true)
      setFinancesPinError('')
    } else {
      setFinancesPinError('Invalid PIN. Please try again.')
    }
  }

  // Inventory state
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [showInventoryDialog, setShowInventoryDialog] = useState(false)
  const [editingInventory, setEditingInventory] = useState<InventoryItem | null>(null)
  const [inventoryToDelete, setInventoryToDelete] = useState<InventoryItem | null>(null)
  const [isSavingInventory, setIsSavingInventory] = useState(false)
  const [inventoryFilterLocation, setInventoryFilterLocation] = useState('')
  const [inventoryFilterCategory, setInventoryFilterCategory] = useState('')
  const [inventorySearch, setInventorySearch] = useState('')
  const [inventoryPhotoFile, setInventoryPhotoFile] = useState<File | null>(null)
  const [inventoryPhotoPreview, setInventoryPhotoPreview] = useState<string | null>(null)
  const [inventoryPhotoRemoved, setInventoryPhotoRemoved] = useState(false)
  const [inventoryForm, setInventoryForm] = useState({
    name: '',
    description: '',
    location: 'Moriah Hall' as string,
    quantity: 1,
    category: '',
    condition: 'Good' as string,
  })
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategory[]>([])
  const [showCategoryDialog, setShowCategoryDialog] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isSavingCategory, setIsSavingCategory] = useState(false)
  const [inventoryView, setInventoryView] = useState<'grid' | 'list'>('grid')

  // Journey collapsible sections
  const [expandedJourneyGroups, setExpandedJourneyGroups] = useState<Record<string, boolean>>({})
  const isJourneyGroupExpanded = (key: string) => expandedJourneyGroups[key] !== false
  const toggleJourneyGroup = (key: string) => setExpandedJourneyGroups(prev => ({ ...prev, [key]: !isJourneyGroupExpanded(key) }))

  // Export menus
  const [showExportMenu, setShowExportMenu] = useState<string | null>(null)
  const toggleExportMenu = (key: string) => setShowExportMenu(prev => prev === key ? null : key)

  const exportOverview = (format: 'excel' | 'pdf') => {
    setShowExportMenu(null)
    const headers = ['Metric', 'Count']
    const rows = [
      ['Total Members', String(members.length)],
      ['Quest Circles', String(cellGroups.length)],
      ['Ministries', String(ministries.length)],
      ['New Friends', String(members.filter(m => m.discipleship_stage === 'Newbie').length)],
      ['Growing', String(members.filter(m => m.discipleship_stage === 'Growing').length)],
      ['Disciple Makers', String(members.filter(m => m.leadership_level === 'Disciple Maker').length)],
    ]
    if (format === 'excel') downloadExcel('overview', headers, rows, 'Overview')
    else downloadPDF('overview', headers, rows, 'Dashboard Overview')
  }

  const exportCellGroups = (format: 'excel' | 'pdf') => {
    setShowExportMenu(null)
    const headers = ['Name', 'Satellite', 'Leader', 'Co-Leader', 'Meeting Day', 'Meeting Time', 'Location', 'Members', 'Active']
    const rows = cellGroups.map(g => [
      g.name,
      g.satellite?.name || '',
      g.leader?.name || '',
      g.co_leader?.name || '',
      g.meeting_day || '',
      g.meeting_time || '',
      g.meeting_location || '',
      String(g.members?.filter(m => m.is_active).length || 0),
      g.is_active ? 'Yes' : 'No',
    ])
    if (format === 'excel') downloadExcel('quest-circles', headers, rows, 'Quest Circles')
    else downloadPDF('quest-circles', headers, rows, 'Quest Circles')
  }

  const exportMinistries = (format: 'excel' | 'pdf') => {
    setShowExportMenu(null)
    const headers = ['Name', 'Department', 'Head', 'Active Members', 'Active']
    const rows = ministries.map(m => [
      m.name,
      m.department || '',
      m.head?.name || '',
      String(m.members?.filter((mm: any) => mm.is_active).length || 0),
      m.is_active ? 'Yes' : 'No',
    ])
    if (format === 'excel') downloadExcel('ministries', headers, rows, 'Ministries')
    else downloadPDF('ministries', headers, rows, 'Ministries')
  }

  const exportEvents = (format: 'excel' | 'pdf') => {
    setShowExportMenu(null)
    const headers = ['Name', 'Date', 'Time', 'Location', 'Registrations', 'Expected', 'Active']
    const rows = (events || []).map(e => [
      e.name,
      e.event_date || '',
      e.event_time || '',
      e.location || '',
      String(e.registration_count ?? 0),
      String(e.expected_attendees ?? ''),
      e.is_active ? 'Yes' : 'No',
    ])
    if (format === 'excel') downloadExcel('events', headers, rows, 'Events')
    else downloadPDF('events', headers, rows, 'Events')
  }

  const exportSatellites = (format: 'excel' | 'pdf') => {
    setShowExportMenu(null)
    const headers = ['Name', 'Address', 'Pastor', 'Contact Email', 'Contact Phone', 'Members', 'Quest Circles', 'Active']
    const rows = satellites.map(s => [
      s.name,
      s.address || '',
      members.find(m => m.id === s.pastor_id)?.name || '',
      s.contact_email || '',
      s.contact_phone || '',
      String(members.filter(m => m.satellite_id === s.id).length),
      String(cellGroups.filter(g => g.satellite_id === s.id).length),
      s.is_active ? 'Yes' : 'No',
    ])
    if (format === 'excel') downloadExcel('satellites', headers, rows, 'Satellites')
    else downloadPDF('satellites', headers, rows, 'Satellites')
  }

  // Dialogs
  const [showPurgeDialog, setShowPurgeDialog] = useState(false)
  const [isPurgingDirectory, setIsPurgingDirectory] = useState(false)
  const [purgeConfirmText, setPurgeConfirmText] = useState('')
  const [purgeResult, setPurgeResult] = useState<{ member_ministries: number; member_cell_groups: number; ministries: number; cell_groups: number; members: number } | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; disciplerLinks: number; ministryLinks: number; errors: string[] } | null>(null)
  const [isRelinking, setIsRelinking] = useState(false)
  const [relinkResult, setRelinkResult] = useState<{ disciplerLinks: number; ministryLinks: number; errors: string[] } | null>(null)
  const [isGeneratingCellGroups, setIsGeneratingCellGroups] = useState(false)
  const [cellGroupGenResult, setCellGroupGenResult] = useState<{ cellGroupsCreated: number; membershipsCreated: number; disciplerLinksUpdated: number; disciplersAutoCreated: number; skipped: number; errors: string[] } | null>(null)

  // Cell Group CRUD
  const [showCGDialog, setShowCGDialog] = useState(false)
  const [editingCG, setEditingCG] = useState<CellGroupWithRelations | null>(null)
  const [cgToDelete, setCGToDelete] = useState<CellGroupWithRelations | null>(null)
  const [isSavingCG, setIsSavingCG] = useState(false)
  const [cgForm, setCGForm] = useState({
    name: '',
    description: '',
    satellite_id: '',
    leader_id: '',
    co_leader_id: '',
    meeting_day: '',
    meeting_time: '',
    meeting_location: '',
    max_members: 12,
    is_active: true,
  })

  // Ministry CRUD
  const [showMinDialog, setShowMinDialog] = useState(false)
  const [editingMin, setEditingMin] = useState<MinistryWithRelations | null>(null)
  const [minToDelete, setMinToDelete] = useState<MinistryWithRelations | null>(null)
  const [isSavingMin, setIsSavingMin] = useState(false)
  const [minForm, setMinForm] = useState({
    name: '',
    description: '',
    department: '',
    head_id: '',
    is_active: true,
  })
  const [minPhotoFile, setMinPhotoFile] = useState<File | null>(null)
  const [minPhotoPreview, setMinPhotoPreview] = useState<string | null>(null)
  const [existingMinPhotoUrl, setExistingMinPhotoUrl] = useState<string | null>(null)

  // Satellite CRUD
  const [showSatDialog, setShowSatDialog] = useState(false)
  const [satToDelete, setSatToDelete] = useState<Satellite | null>(null)
  const [isSavingSat, setIsSavingSat] = useState(false)
  const [satForm, setSatForm] = useState({ name: '' })

  // Compute member IDs that are in cell groups (for filtering)
  const memberIdsInCellGroups = useMemo(() => {
    const ids = new Set<string>()
    for (const group of cellGroups) {
      if (group.members) {
        for (const m of group.members) {
          if ((m as any).member_id) ids.add((m as any).member_id)
        }
      }
    }
    return ids
  }, [cellGroups])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/admin')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  // Opening/closing the inline satellite detail is a state switch (not a route change),
  // so the browser keeps the current scroll and you land mid-page. Scroll to top so the
  // detail (or the returned-to list) starts at the beginning, like a real page change.
  // Skip the initial mount so this doesn't override the router's scroll restoration.
  const satelliteScrollInit = useRef(true)
  useEffect(() => {
    if (satelliteScrollInit.current) {
      satelliteScrollInit.current = false
      return
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [selectedSatelliteId])

  // Fetch all dashboard data
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) return

    let cancelled = false

    const doFetch = async (showLoading: boolean) => {
      if (showLoading) setIsLoading(true)

      try {
        const [satsRes, memsRes, groupsRes, minsRes] = await Promise.all([
          supabase.from('satellites').select('*').order('name'),
          supabase.from('members').select('*').eq('is_archived', false).order('name'),
          supabase.from('cell_groups').select(`
            *,
            leader:members!cell_groups_leader_id_fkey(id, name, photo_url),
            co_leader:members!cell_groups_co_leader_id_fkey(id, name, photo_url),
            satellite:satellites(id, name),
            members:member_cell_groups(id, member_id, is_active)
          `).eq('is_active', true).order('name'),
          supabase.from('ministries').select(`
            *,
            head:members(id, name, photo_url, city, discipleship_stage),
            members:member_ministries(id, role, is_active)
          `).eq('is_active', true).order('name'),
        ])

        if (cancelled) return

        if (satsRes.data) setSatellites(satsRes.data as Satellite[])
        if (memsRes.data) setMembers(memsRes.data as Member[])
        if (groupsRes.data) {
          const groupsWithCount = groupsRes.data.map(g => ({
            ...g,
            // Count only ACTIVE memberships (exclude members who left the circle),
            // matching how ministry member_count is computed just below.
            member_count: ((g as any).members || []).filter((mm: any) => mm.is_active).length,
          }))
          setCellGroups(groupsWithCount as CellGroupWithRelations[])
        }
        if (minsRes.data) {
          const minsWithCount = minsRes.data.map(m => ({
            ...m,
            member_count: ((m as any).members || []).filter((mm: any) => mm.is_active).length,
          }))
          setMinistries(minsWithCount as MinistryWithRelations[])
        }
      } catch (err) {
        console.error('[Dashboard] fetchData error:', err)
      }

      // Always stop loading after core queries (success or fail)
      if (!cancelled) {
        setIsLoading(false)
        hasFetchedRef.current = true
      }

      // Fetch events, financial overview, and inventory in the background
      try {
        const [eventsData, finOverview, inventoryData, categoriesData] = await Promise.all([
          getEvents({ data: { activeOnly: false } }),
          getFinancialOverview({ data: {} }),
          getInventoryItems({ data: { sortBy: 'name', sortOrder: 'asc' } }),
          getInventoryCategories({ data: {} }),
        ])
        if (!cancelled) {
          setEvents(eventsData)
          setFinancialOverview(finOverview)
          setInventoryItems(inventoryData)
          setInventoryCategories(categoriesData)
        }
      } catch (evtErr) {
        if (!cancelled) console.error('[Dashboard] events/finances/inventory fetch error:', evtErr)
      }
    }

    // Start fetch immediately (no debounce)
    doFetch(!hasFetchedRef.current)

    // Silently refresh when the user returns to this tab/window. 'visibilitychange'
    // fires on browser-tab switches and 'focus' on window/app switches; neither alone
    // is reliable. They often fire together, so throttle to coalesce into one refetch.
    let lastRefetchAt = Date.now()
    const maybeRefetch = () => {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastRefetchAt < 1000) return
      lastRefetchAt = now
      doFetch(false)
    }
    window.addEventListener('focus', maybeRefetch)
    document.addEventListener('visibilitychange', maybeRefetch)

    return () => {
      cancelled = true
      window.removeEventListener('focus', maybeRefetch)
      document.removeEventListener('visibilitychange', maybeRefetch)
    }
  }, [isAuthenticated, refreshTrigger])

  // Check admin access
  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'satellite_leader'

  // Handle setup admin account
  const handleSetupAdmin = async () => {
    setIsSettingUpAdmin(true)
    setAdminSetupResult(null)
    try {
      const result = await seedTestAccounts({ data: { adminPin: ADMIN_PIN } })
      const admin = result.accounts[0]
      setAdminSetupResult(admin ? `${admin.email}: ${admin.status}` : 'No result')
    } catch (error) {
      setAdminSetupResult(error instanceof Error ? error.message : 'Failed')
    } finally {
      setIsSettingUpAdmin(false)
    }
  }

  // Handle purge directory
  const handlePurgeDirectory = async () => {
    if (purgeConfirmText !== 'DELETE ALL DATA') return
    setIsPurgingDirectory(true)
    setPurgeResult(null)
    try {
      const result = await purgeAllData({ data: { adminPin: ADMIN_PIN, confirmText: 'DELETE ALL DATA' } })
      setPurgeResult(result.results)
    } catch (error) {
      console.error('Purge failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to purge data')
    } finally {
      setIsPurgingDirectory(false)
    }
  }

  // Handle import spreadsheet data
  const handleImportSpreadsheet = async () => {
    setIsImporting(true)
    setImportResult(null)
    try {
      // Fetch the spreadsheet-raw.json data
      const response = await fetch('/data/spreadsheet-raw.json')
      if (!response.ok) {
        throw new Error('Could not load spreadsheet data file. Copy ../data/spreadsheet-raw.json to public/data/spreadsheet-raw.json first.')
      }
      const rawData = await response.json()

      const result = await importSpreadsheetData({
        data: {
          adminPin: ADMIN_PIN,
          data: {
            COMMUNITY: rawData.tabs?.COMMUNITY,
            SATELIGHTS: rawData.tabs?.SATELIGHTS,
            QUEST_LAGUNA: rawData.tabs?.QUEST_LAGUNA,
          },
        },
      })
      setImportResult(result.results)
    } catch (error) {
      console.error('Import failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to import data')
    } finally {
      setIsImporting(false)
    }
  }

  // Handle re-link relationships (ministry + discipler)
  const handleRelinkRelationships = async () => {
    setIsRelinking(true)
    setRelinkResult(null)
    try {
      const response = await fetch('/data/spreadsheet-raw.json')
      if (!response.ok) {
        throw new Error('Could not load spreadsheet data file.')
      }
      const rawData = await response.json()

      const result = await relinkMemberRelationships({
        data: {
          adminPin: ADMIN_PIN,
          data: {
            COMMUNITY: rawData.tabs?.COMMUNITY,
            SATELIGHTS: rawData.tabs?.SATELIGHTS,
            QUEST_LAGUNA: rawData.tabs?.QUEST_LAGUNA,
          },
        },
      })
      setRelinkResult(result.results)
    } catch (error) {
      console.error('Re-link failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to re-link relationships')
    } finally {
      setIsRelinking(false)
    }
  }

  // Handle generate cell groups from discipler relationships
  const handleGenerateCellGroups = async () => {
    setIsGeneratingCellGroups(true)
    setCellGroupGenResult(null)
    try {
      // Fetch spreadsheet data for name matching
      const response = await fetch('/data/spreadsheet-raw.json')
      if (!response.ok) {
        throw new Error('Could not load spreadsheet data file.')
      }
      const rawData = await response.json()

      const result = await generateCellGroupsFromDisciplers({
        data: {
          adminPin: ADMIN_PIN,
          data: {
            COMMUNITY: rawData.tabs?.COMMUNITY,
            SATELIGHTS: rawData.tabs?.SATELIGHTS,
            QUEST_LAGUNA: rawData.tabs?.QUEST_LAGUNA,
          },
        },
      })
      setCellGroupGenResult(result.results)
    } catch (error) {
      console.error('Generate cell groups failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate Quest Circles')
    } finally {
      setIsGeneratingCellGroups(false)
    }
  }

  // Refresh data without showing loading spinner
  const refreshData = async () => {
    try {
      const [satsRes, memsRes, groupsRes, minsRes] = await Promise.all([
        supabase.from('satellites').select('*').order('name'),
        supabase.from('members').select('*').eq('is_archived', false).order('name'),
        supabase.from('cell_groups').select(`
          *,
          leader:members!cell_groups_leader_id_fkey(id, name, photo_url),
          co_leader:members!cell_groups_co_leader_id_fkey(id, name, photo_url),
          satellite:satellites(id, name),
          members:member_cell_groups(id, is_active)
        `).eq('is_active', true).order('name'),
        supabase.from('ministries').select(`
          *,
          head:members(id, name, photo_url, city, discipleship_stage),
          members:member_ministries(id, role, is_active)
        `).eq('is_active', true).order('name'),
      ])

      if (satsRes.data) setSatellites(satsRes.data as Satellite[])
      if (memsRes.data) setMembers(memsRes.data as Member[])
      if (groupsRes.data) {
        const groupsWithCount = groupsRes.data.map(g => ({
          ...g,
          // Count only ACTIVE memberships (exclude members who left the circle).
          member_count: ((g as any).members || []).filter((mm: any) => mm.is_active).length,
        }))
        setCellGroups(groupsWithCount as CellGroupWithRelations[])
      }
      if (minsRes.data) {
        const minsWithCount = minsRes.data.map(m => ({
          ...m,
          member_count: ((m as any).members || []).filter((mm: any) => mm.is_active).length,
        }))
        setMinistries(minsWithCount as MinistryWithRelations[])
      }

      try {
        const [eventsData, finOverview, inventoryData, categoriesData] = await Promise.all([
          getEvents({ data: { activeOnly: false } }),
          getFinancialOverview({ data: {} }),
          getInventoryItems({ data: { sortBy: 'name', sortOrder: 'asc' } }),
          getInventoryCategories({ data: {} }),
        ])
        setEvents(eventsData)
        setFinancialOverview(finOverview)
        setInventoryItems(inventoryData)
        setInventoryCategories(categoriesData)
      } catch (evtErr) {
        console.error('[Dashboard] events/finances/inventory fetch error:', evtErr)
      }
    } catch (err) {
      console.error('[Dashboard] refreshData error:', err)
    }
  }

  // ============================================
  // CELL GROUP CRUD HANDLERS
  // ============================================

  const openCGDialog = (cg?: CellGroupWithRelations) => {
    if (cg) {
      setEditingCG(cg)
      setCGForm({
        name: cg.name,
        description: cg.description || '',
        satellite_id: cg.satellite_id || '',
        leader_id: cg.leader_id || '',
        co_leader_id: cg.co_leader_id || '',
        meeting_day: cg.meeting_day || '',
        meeting_time: cg.meeting_time || '',
        meeting_location: cg.meeting_location || '',
        max_members: cg.max_members || 12,
        is_active: cg.is_active !== false,
      })
    } else {
      setEditingCG(null)
      setCGForm({
        name: '',
        description: '',
        satellite_id: '',
        leader_id: '',
        co_leader_id: '',
        meeting_day: '',
        meeting_time: '',
        meeting_location: '',
        max_members: 12,
        is_active: true,
      })
    }
    setShowCGDialog(true)
  }

  const handleSaveCG = async () => {
    if (!cgForm.name.trim()) return
    setIsSavingCG(true)
    try {
      const payload = {
        name: cgForm.name.trim(),
        description: cgForm.description.trim() || null,
        satellite_id: cgForm.satellite_id || null,
        leader_id: cgForm.leader_id || null,
        co_leader_id: cgForm.co_leader_id || null,
        meeting_day: (cgForm.meeting_day || null) as any,
        meeting_time: cgForm.meeting_time || null,
        meeting_location: cgForm.meeting_location.trim() || null,
        max_members: cgForm.max_members,
        is_active: cgForm.is_active,
      }
      if (editingCG) {
        await updateCellGroup({ data: { id: editingCG.id, updates: payload } })
      } else {
        await createCellGroup({ data: payload })
      }
      setShowCGDialog(false)
      await refreshData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save Quest Circle')
    } finally {
      setIsSavingCG(false)
    }
  }

  const handleDeleteCG = async () => {
    if (!cgToDelete) return
    setIsSavingCG(true)
    try {
      await deleteCellGroup({ data: { id: cgToDelete.id } })
      setCGToDelete(null)
      await refreshData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete Quest Circle')
    } finally {
      setIsSavingCG(false)
    }
  }

  // ============================================
  // MINISTRY CRUD HANDLERS
  // ============================================

  const openMinDialog = (min?: MinistryWithRelations) => {
    if (min) {
      setEditingMin(min)
      setMinForm({
        name: min.name,
        description: min.description || '',
        department: min.department || '',
        head_id: min.head_id || '',
        is_active: min.is_active !== false,
      })
      setExistingMinPhotoUrl(min.photo_url || null)
    } else {
      setEditingMin(null)
      setMinForm({
        name: '',
        description: '',
        department: '',
        head_id: '',
        is_active: true,
      })
      setExistingMinPhotoUrl(null)
    }
    setMinPhotoFile(null)
    setMinPhotoPreview(null)
    setShowMinDialog(true)
  }

  const handleSaveMin = async () => {
    if (!minForm.name.trim()) return
    setIsSavingMin(true)
    try {
      // Upload photo if a new file was selected
      let photoUrl: string | null = existingMinPhotoUrl
      if (minPhotoFile) {
        const { uploadMinistryPhoto } = await import('../../lib/storage')
        const tempId = editingMin?.id || crypto.randomUUID()
        const { url, error: uploadError } = await uploadMinistryPhoto(tempId, minPhotoFile)
        if (uploadError) {
          alert(`Photo upload failed: ${uploadError.message}`)
          setIsSavingMin(false)
          return
        }
        photoUrl = url
      }

      const payload = {
        name: minForm.name.trim(),
        description: minForm.description.trim() || null,
        department: minForm.department.trim() || null,
        head_id: minForm.head_id || null,
        photo_url: photoUrl,
        is_active: minForm.is_active,
      }
      if (editingMin) {
        await updateMinistry({ data: { id: editingMin.id, updates: payload } })
      } else {
        await createMinistry({ data: payload })
      }
      setShowMinDialog(false)
      setMinPhotoFile(null)
      setMinPhotoPreview(null)
      setExistingMinPhotoUrl(null)
      await refreshData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save ministry')
    } finally {
      setIsSavingMin(false)
    }
  }

  const handleDeleteMin = async () => {
    if (!minToDelete) return
    setIsSavingMin(true)
    try {
      await deleteMinistry({ data: { id: minToDelete.id } })
      setMinToDelete(null)
      await refreshData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete ministry')
    } finally {
      setIsSavingMin(false)
    }
  }

  // ============================================
  // SATELLITE CRUD HANDLERS
  // ============================================

  const handleSaveSat = async () => {
    if (!satForm.name.trim()) return
    setIsSavingSat(true)
    try {
      await addSatellite({ data: { name: satForm.name.trim(), pin: ADMIN_PIN } })
      setShowSatDialog(false)
      setSatForm({ name: '' })
      await refreshData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add satellite')
    } finally {
      setIsSavingSat(false)
    }
  }

  const handleDeleteSat = async () => {
    if (!satToDelete) return
    setIsSavingSat(true)
    try {
      await deleteSatellite({ data: { id: satToDelete.id, pin: ADMIN_PIN } })
      setSatToDelete(null)
      await refreshData()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete satellite')
    } finally {
      setIsSavingSat(false)
    }
  }

  // Inventory CRUD
  const openInventoryDialog = (item?: InventoryItem) => {
    if (item) {
      setEditingInventory(item)
      setInventoryForm({
        name: item.name,
        description: item.description || '',
        location: item.location,
        quantity: item.quantity,
        category: item.category || '',
        condition: item.condition,
      })
      setInventoryPhotoPreview(item.photo_url)
    } else {
      setEditingInventory(null)
      setInventoryForm({ name: '', description: '', location: 'Moriah Hall', quantity: 1, category: '', condition: 'Good' })
      setInventoryPhotoPreview(null)
    }
    setInventoryPhotoFile(null)
    setInventoryPhotoRemoved(false)
    setShowInventoryDialog(true)
  }

  const handleSaveInventory = async () => {
    if (!inventoryForm.name.trim()) return
    setIsSavingInventory(true)
    try {
      let photoUrl = inventoryPhotoRemoved ? null : (editingInventory?.photo_url || null)

      if (inventoryPhotoFile) {
        try {
          const tempId = editingInventory?.id || crypto.randomUUID()
          const { url, error: uploadErr } = await uploadInventoryPhoto(tempId, inventoryPhotoFile)
          if (uploadErr) {
            console.error('Photo upload failed:', uploadErr)
          } else {
            photoUrl = url
          }
        } catch (uploadError) {
          console.error('Photo upload failed:', uploadError)
        }
      }

      const payload = {
        name: inventoryForm.name.trim(),
        description: inventoryForm.description.trim() || null,
        location: inventoryForm.location as 'Moriah Hall' | 'Nxtgen Hall',
        quantity: inventoryForm.quantity,
        category: inventoryForm.category || null,
        condition: inventoryForm.condition as 'Good' | 'Fair' | 'Needs Repair' | 'Damaged',
        photo_url: photoUrl,
      }

      if (editingInventory) {
        await updateInventoryItem({ data: { id: editingInventory.id, updates: payload } })
      } else {
        await createInventoryItem({ data: payload })
      }

      setShowInventoryDialog(false)
      const items = await getInventoryItems({ data: { sortBy: 'name', sortOrder: 'asc' } })
      setInventoryItems(items)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save inventory item')
    } finally {
      setIsSavingInventory(false)
    }
  }

  const handleDeleteInventory = async () => {
    if (!inventoryToDelete) return
    try {
      await deleteInventoryItem({ data: { id: inventoryToDelete.id } })
      setInventoryToDelete(null)
      const items = await getInventoryItems({ data: { sortBy: 'name', sortOrder: 'asc' } })
      setInventoryItems(items)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete inventory item')
    }
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    setIsSavingCategory(true)
    try {
      await createInventoryCategory({ data: { name: newCategoryName.trim() } })
      const cats = await getInventoryCategories({ data: {} })
      setInventoryCategories(cats)
      setNewCategoryName('')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add category')
    } finally {
      setIsSavingCategory(false)
    }
  }

  const handleDeleteCategory = async (cat: InventoryCategory) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return
    try {
      await deleteInventoryCategory({ data: { id: cat.id } })
      const cats = await getInventoryCategories({ data: {} })
      setInventoryCategories(cats)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete category')
    }
  }

  const filteredInventory = useMemo(() => inventoryItems.filter((item) => {
    const matchesSearch = !inventorySearch ||
      item.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
      item.description?.toLowerCase().includes(inventorySearch.toLowerCase())
    const matchesLocation = !inventoryFilterLocation || item.location === inventoryFilterLocation
    const matchesCategory = !inventoryFilterCategory || item.category === inventoryFilterCategory
    return matchesSearch && matchesLocation && matchesCategory
  }), [inventoryItems, inventorySearch, inventoryFilterLocation, inventoryFilterCategory])

  const inventoryStats = useMemo(() => {
    const totalItems = inventoryItems.reduce((sum, i) => sum + i.quantity, 0)
    const byLocation: Record<string, number> = {}
    for (const item of inventoryItems) {
      byLocation[item.location] = (byLocation[item.location] || 0) + item.quantity
    }
    const needsRepair = inventoryItems.filter(i => i.condition === 'Needs Repair' || i.condition === 'Damaged').length
    return { totalItems, uniqueItems: inventoryItems.length, byLocation, needsRepair }
  }, [inventoryItems])

  const filteredCellGroups = useMemo(() => cellGroups.filter((group) => {
    const matchesSearch = !searchQuery ||
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSatellite = !selectedSatellite || group.satellite_id === selectedSatellite
    return matchesSearch && matchesSatellite
  }), [cellGroups, searchQuery, selectedSatellite])

  const filteredMinistries = useMemo(() => ministries.filter((ministry) => {
    const matchesSearch = !searchQuery ||
      ministry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ministry.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  }), [ministries, searchQuery])

  // Ministry role counts (from member_ministries join)
  const ministryRoleCounts = useMemo(() => {
    let volunteers = 0, coordinators = 0, heads = 0
    for (const m of ministries) {
      const activeMembers = (m.members || []).filter((mm: any) => mm.is_active)
      for (const mm of activeMembers) {
        if (mm.role === 'volunteer') volunteers++
        else if (mm.role === 'coordinator') coordinators++
        else if (mm.role === 'head') heads++
      }
    }
    return { volunteers, coordinators, heads, total: volunteers + coordinators + heads }
  }, [ministries])

  // Stats
  const totalMembers = members.length
  const totalCellGroups = cellGroups.length
  const totalMinistries = ministries.length
  const newbies = members.filter((m) => m.discipleship_stage === 'Newbie').length
  const growing = members.filter((m) => m.discipleship_stage === 'Growing').length
  const leaders = members.filter((m) => m.discipleship_stage === 'Leader').length
  const discipleMakers = members.filter((m) => m.leadership_level === 'Disciple Maker').length

  // Discipleship journey breakdown
  const journeyCounts = {
    'Consolidations': members.filter(m => m.discipleship_journey === 'Consolidations').length,
    'Pre Encounter': members.filter(m => m.discipleship_journey === 'Pre Encounter').length,
    'Encounter': members.filter(m => m.discipleship_journey === 'Encounter').length,
    'Post-Encounter': members.filter(m => m.discipleship_journey === 'Post-Encounter').length,
    'SOD1': members.filter(m => m.discipleship_journey === 'SOD1').length,
    'SOD2': members.filter(m => m.discipleship_journey === 'SOD2').length,
    'SOD3': members.filter(m => m.discipleship_journey === 'SOD3').length,
    'Bible School': members.filter(m => m.discipleship_journey === 'Bible School').length,
    'QBS Theology 101': members.filter(m => m.discipleship_journey === 'QBS Theology 101').length,
    'QBS Preaching 101': members.filter(m => m.discipleship_journey === 'QBS Preaching 101').length,
  }
  const noJourney = members.filter(m => !m.discipleship_journey).length

  // Follow-through breakdown
  const followThroughCounts = {
    'Salvation': members.filter(m => m.follow_through === 'Salvation').length,
    'Prayer': members.filter(m => m.follow_through === 'Prayer').length,
    'Bible and Devotion': members.filter(m => m.follow_through === 'Bible and Devotion').length,
    'Transformation': members.filter(m => m.follow_through === 'Transformation').length,
    'Cell and Church': members.filter(m => m.follow_through === 'Cell and Church').length,
  }
  const noFollowThrough = members.filter(m => !m.follow_through).length

  // Leadership level breakdown
  const leadershipCounts = {
    'Member': members.filter(m => m.leadership_level === 'Member').length,
    'Disciple Maker': members.filter(m => m.leadership_level === 'Disciple Maker').length,
    'Eagle': members.filter(m => m.leadership_level === 'Eagle').length,
    'Pastor': members.filter(m => m.leadership_level === 'Pastor').length,
    'Head Pastor': members.filter(m => m.leadership_level === 'Head Pastor').length,
  }
  const fullTimeCount = members.filter(m => m.is_full_time).length

  // Monthly total active member headcount
  const monthlyMemberCount = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return monthNames
      .slice(0, currentMonth + 1)
      .map((name, i) => {
        const endOfMonth = new Date(currentYear, i + 1, 0, 23, 59, 59)
        const count = members.filter(m => {
          if (!m.created_at) return true
          return new Date(m.created_at) <= endOfMonth
        }).length
        return { month: name, members: count }
      })
  }, [members])

  // Most recently ADDED members. The `members` array is ordered by name, so slicing it
  // shows the alphabetically-first members (static), not the newest — sort by created_at.
  const recentMembers = useMemo(
    () =>
      [...members]
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0
          return tb - ta
        })
        .slice(0, 6),
    [members],
  )

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null // Will redirect
  }

  const ExportBtn = ({ id, onExport }: { id: string; onExport: (f: 'excel' | 'pdf') => void }) => (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => toggleExportMenu(id)}>
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        Export
      </Button>
      {showExportMenu === id && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(null)} />
          <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 py-1 w-40">
            <button onClick={() => onExport('excel')} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
              <span className="text-green-600 font-bold text-xs">XLS</span> Excel
            </button>
            <button onClick={() => onExport('pdf')} className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2">
              <span className="text-red-600 font-bold text-xs">PDF</span> PDF
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-white/80 text-xs sm:text-sm mt-0.5">
                Quest Laguna Directory Management
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs sm:text-sm text-white/70">
                {profile?.role?.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs sm:text-sm"
                onClick={() => signOut()}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {isLoading && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500" role="status" aria-live="polite">
            <div className="w-4 h-4 border-2 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
            Loading dashboard data...
          </div>
        )}
        <Tabs value={activeTab} onValueChange={(tab) => {
          // Update local state for instant feedback and write the tab to the URL so
          // it survives reloads, deep-links and back/forward (replace + no scroll jump).
          setActiveTab(tab)
          navigate({ to: '/admin', search: { tab }, replace: true, resetScroll: false })
          if (tab !== 'finances') { setFinancesUnlocked(false); setFinancesPinInput(''); setFinancesPinError('') }
        }}>
          <div className="relative">
            <div className="w-full overflow-x-auto pb-1 mb-6">
              <TabsList className="w-max">
                <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3">Overview</TabsTrigger>
              <TabsTrigger value="satellites" className="text-xs sm:text-sm px-2 sm:px-3">Satellites</TabsTrigger>
              <TabsTrigger value="members" className="text-xs sm:text-sm px-2 sm:px-3">Members</TabsTrigger>
              <TabsTrigger value="cell-groups" className="text-xs sm:text-sm px-2 sm:px-3">
                <span className="hidden sm:inline">Quest </span>Circles
              </TabsTrigger>
              <TabsTrigger value="ministries" className="text-xs sm:text-sm px-2 sm:px-3">Ministries</TabsTrigger>
              <TabsTrigger value="events" className="text-xs sm:text-sm px-2 sm:px-3">Events</TabsTrigger>
              <TabsTrigger value="finances" className="text-xs sm:text-sm px-2 sm:px-3">Finances</TabsTrigger>
              <TabsTrigger value="inventory" className="text-xs sm:text-sm px-2 sm:px-3">Inventory</TabsTrigger>
              <TabsTrigger value="settings" className="text-xs sm:text-sm px-2 sm:px-3">Settings</TabsTrigger>
            </TabsList>
            </div>
            {/* Right-edge fade hints that more tabs are scrollable on mobile */}
            <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-gray-50 to-transparent sm:hidden" />
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="space-y-6">
              <div className="flex justify-end">
                <ExportBtn id="overview" onExport={exportOverview} />
              </div>
              {/* Stats Overview */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-[#8B1538]">{isLoading ? '—' : formatNumber(totalMembers)}</p>
                    <p className="text-xs text-gray-500">Members</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-teal-600">{isLoading ? '—' : formatNumber(totalCellGroups)}</p>
                    <p className="text-xs text-gray-500">Quest Circles</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{isLoading ? '—' : formatNumber(totalMinistries)}</p>
                    <p className="text-xs text-gray-500">Ministries</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600">{isLoading ? '—' : formatNumber(newbies)}</p>
                    <p className="text-xs text-purple-500">New Friends</p>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{isLoading ? '—' : formatNumber(growing)}</p>
                    <p className="text-xs text-yellow-600">Schooling</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-orange-600">{isLoading ? '—' : formatNumber(discipleMakers)}</p>
                    <p className="text-xs text-orange-500">Disciple Makers</p>
                  </CardContent>
                </Card>
              </div>

              {/* Member Count Over Time */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Member Count</CardTitle>
                  <CardDescription>
                    Total active members at end of each month — {new Date().getFullYear()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={monthlyMemberCount}
                        margin={{ top: 20, right: 20, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{ fontSize: 13, borderRadius: 8 }}
                          formatter={(value: number) => [value, 'Members']}
                        />
                        <Line
                          type="monotone"
                          dataKey="members"
                          stroke="#8B1538"
                          strokeWidth={2.5}
                          dot={{ r: 5, fill: '#8B1538', strokeWidth: 2, stroke: '#fff' }}
                          activeDot={{ r: 7, fill: '#8B1538' }}
                          label={{ position: 'top', fontSize: 12, fill: '#6b7280', offset: 10 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Discipleship Journey Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Discipleship Journey</CardTitle>
                  <CardDescription>Detailed breakdown by journey stage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* New Friends */}
                    <div>
                      <button type="button" onClick={() => toggleJourneyGroup('newFriends')} className="flex items-center gap-2 mb-1 w-full hover:opacity-80 transition-opacity">
                        <span className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="font-semibold text-sm">New Friends ({newbies})</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isJourneyGroupExpanded('newFriends') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                      {isJourneyGroupExpanded('newFriends') && (
                        <div className="space-y-2 mt-2 ml-5">
                          {([
                            { label: 'Consolidations', count: journeyCounts['Consolidations'] },
                          ] as const).map((item) => (
                            <div key={item.label} className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">{item.label}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full bg-purple-400 rounded-full" style={{ width: `${newbies > 0 ? (item.count / newbies) * 100 : 0}%` }} />
                                </div>
                                <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                              </div>
                            </div>
                          ))}
                          {newbies - journeyCounts['Consolidations'] > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-400 italic">Not assigned</span>
                              <span className="text-sm text-gray-400 w-8 text-right">{newbies - journeyCounts['Consolidations']}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Growing */}
                    {(() => {
                      const growingTotal = journeyCounts['Pre Encounter'] + journeyCounts['Encounter'] + journeyCounts['Post-Encounter']
                      return (
                        <div>
                          <button type="button" onClick={() => toggleJourneyGroup('growing')} className="flex items-center gap-2 mb-1 w-full hover:opacity-80 transition-opacity">
                            <span className="w-3 h-3 rounded-full bg-teal-500" />
                            <span className="font-semibold text-sm">Growing ({growingTotal})</span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isJourneyGroupExpanded('growing') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {isJourneyGroupExpanded('growing') && (
                            <div className="space-y-2 mt-2 ml-5">
                              {([
                                { label: 'Quest Life Preparation', count: journeyCounts['Pre Encounter'] },
                                { label: 'Quest Retreat', count: journeyCounts['Encounter'] },
                                { label: 'Post-Retreat', count: journeyCounts['Post-Encounter'] },
                              ] as const).map((item) => (
                                <div key={item.label} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600">{item.label}</span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-teal-400 rounded-full" style={{ width: `${growingTotal > 0 ? (item.count / growingTotal) * 100 : 0}%` }} />
                                    </div>
                                    <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Schooling */}
                    {(() => {
                      const schoolingTotal = journeyCounts['SOD1'] + journeyCounts['SOD2'] + journeyCounts['SOD3'] + journeyCounts['Bible School'] + journeyCounts['QBS Theology 101'] + journeyCounts['QBS Preaching 101']
                      return (
                        <div>
                          <button type="button" onClick={() => toggleJourneyGroup('schooling')} className="flex items-center gap-2 mb-1 w-full hover:opacity-80 transition-opacity">
                            <span className="w-3 h-3 rounded-full bg-yellow-500" />
                            <span className="font-semibold text-sm">Schooling ({schoolingTotal})</span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${isJourneyGroupExpanded('schooling') ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </button>
                          {isJourneyGroupExpanded('schooling') && (
                            <div className="space-y-2 mt-2 ml-5">
                              {([
                                { label: 'SOD 1', count: journeyCounts['SOD1'] },
                                { label: 'SOD 2', count: journeyCounts['SOD2'] },
                                { label: 'SOD 3', count: journeyCounts['SOD3'] },
                                { label: 'Bible School', count: journeyCounts['Bible School'] },
                                { label: 'QBS Theology 101', count: journeyCounts['QBS Theology 101'] },
                                { label: 'QBS Preaching 101', count: journeyCounts['QBS Preaching 101'] },
                              ] as const).map((item) => (
                                <div key={item.label} className="flex items-center justify-between">
                                  <span className="text-sm text-gray-600">{item.label}</span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${schoolingTotal > 0 ? (item.count / schoolingTotal) * 100 : 0}%` }} />
                                    </div>
                                    <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Disciple Makers */}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-3 h-3 rounded-full bg-orange-500" />
                        <span className="font-semibold text-sm">Disciple Makers ({discipleMakers})</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Follow-Through Stages */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Follow-Through Stages</CardTitle>
                  <CardDescription>Member engagement in follow-through process</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {([
                      { label: 'Salvation', count: followThroughCounts['Salvation'], bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-400' },
                      { label: 'Prayer', count: followThroughCounts['Prayer'], bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-400' },
                      { label: 'Bible & Devotion', count: followThroughCounts['Bible and Devotion'], bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-400' },
                      { label: 'Transformation', count: followThroughCounts['Transformation'], bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400' },
                      { label: 'Cell & Church', count: followThroughCounts['Cell and Church'], bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-400' },
                    ] as const).map((stage) => (
                      <div key={stage.label} className={`rounded-lg p-3 ${stage.bg} border`}>
                        <p className={`text-2xl font-bold ${stage.text}`}>{stage.count}</p>
                        <p className="text-xs font-medium text-gray-600 mb-2">{stage.label}</p>
                        <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                          <div className={`h-full ${stage.bar} rounded-full`} style={{ width: `${totalMembers > 0 ? (stage.count / totalMembers) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {noFollowThrough > 0 && (
                    <p className="text-xs text-gray-400 mt-3">{noFollowThrough} members with no follow-through data</p>
                  )}
                </CardContent>
              </Card>

              {/* Leadership Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Leadership Breakdown</CardTitle>
                  <CardDescription>Distribution of members by leadership level</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {([
                      { label: 'Member', count: leadershipCounts['Member'], bg: 'bg-gray-50', text: 'text-gray-700', bar: 'bg-gray-400' },
                      { label: 'Disciple Maker', count: leadershipCounts['Disciple Maker'], bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-400' },
                      { label: 'Eagle', count: leadershipCounts['Eagle'], bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400' },
                      { label: 'Pastor', count: leadershipCounts['Pastor'], bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-400' },
                      { label: 'Head Pastor', count: leadershipCounts['Head Pastor'], bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-400' },
                      { label: 'Full Time', count: fullTimeCount, bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400' },
                    ] as const).map((level) => (
                      <div key={level.label} className={`rounded-lg p-3 ${level.bg} border`}>
                        <p className={`text-2xl font-bold ${level.text}`}>{level.count}</p>
                        <p className="text-xs font-medium text-gray-600 mb-2">{level.label}</p>
                        <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                          <div className={`h-full ${level.bar} rounded-full`} style={{ width: `${totalMembers > 0 ? (level.count / totalMembers) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Links */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Link to="/admin/members/new">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <svg className="w-8 h-8 text-[#8B1538] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      <p className="font-medium">Add Member</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/event">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <svg className="w-8 h-8 text-[#8B1538] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="font-medium">Event Dashboard</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/finances">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <svg className="w-8 h-8 text-[#8B1538] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium">Finances</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/profile">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <svg className="w-8 h-8 text-[#8B1538] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="font-medium">My Profile</p>
                    </CardContent>
                  </Card>
                </Link>
                <Link to="/">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                      <svg className="w-8 h-8 text-[#8B1538] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <p className="font-medium">Home</p>
                    </CardContent>
                  </Card>
                </Link>
              </div>

              {/* Analytics Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Discipleship Stage Distribution */}
                <Card>
                  <CardHeader>
                    <CardTitle>Discipleship Stages</CardTitle>
                    <CardDescription>Distribution of members by spiritual growth stage</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'New Friends', value: newbies, color: '#9333EA' },
                              { name: 'Schooling', value: growing, color: '#EAB308' },
                              { name: 'Disciple Makers', value: discipleMakers, color: '#EA580C' },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {[
                              { name: 'New Friends', value: newbies, color: '#9333EA' },
                              { name: 'Schooling', value: growing, color: '#EAB308' },
                              { name: 'Disciple Makers', value: discipleMakers, color: '#EA580C' },
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Members by Satellite */}
                <Card>
                  <CardHeader>
                    <CardTitle>Members by Satellite</CardTitle>
                    <CardDescription>Distribution across satellite locations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={satellites.map(sat => ({
                            name: sat.name.replace('Quest ', ''),
                            members: members.filter(m => m.satellite_id === sat.id).length,
                          })).filter(s => s.members > 0).slice(0, 8)}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="members" fill="#8B1538" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Quest Circle Meeting Days */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quest Circle Schedules</CardTitle>
                    <CardDescription>Meeting days distribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => ({
                            day: day.slice(0, 3),
                            groups: cellGroups.filter(g => g.meeting_day === day).length,
                          }))}
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="groups" fill="#0D9488" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Ministries by Department */}
                <Card>
                  <CardHeader>
                    <CardTitle>Ministries by Department</CardTitle>
                    <CardDescription>Distribution across ministry departments</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(() => {
                            const deptCounts: Record<string, number> = {}
                            ministries.forEach(m => {
                              const dept = m.department || 'Other'
                              deptCounts[dept] = (deptCounts[dept] || 0) + 1
                            })
                            return Object.entries(deptCounts)
                              .map(([name, count]) => ({ name, count }))
                              .sort((a, b) => b.count - a.count)
                              .slice(0, 8)
                          })()}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#D97706" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Members */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Members</CardTitle>
                  <CardDescription>Latest added members</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[...Array(3)].map((_, i) => <MemberCardSkeleton key={i} />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {recentMembers.map((member) => (
                        <MemberCard key={member.id} member={member} />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Satellites Tab */}
          <TabsContent value="satellites">
            <div className="flex justify-end mb-4">
              <ExportBtn id="satellites" onExport={exportSatellites} />
            </div>
            {selectedSatelliteId ? (
              // Satellite Detail View
              (() => {
                const sat = satellites.find(s => s.id === selectedSatelliteId)
                if (!sat) return null

                const satMembers = members.filter(m => m.satellite_id === sat.id)
                const satCellGroups = cellGroups.filter(g => g.satellite_id === sat.id)
                const satNewbies = satMembers.filter(m => m.discipleship_stage === 'Newbie').length
                const satGrowing = satMembers.filter(m => m.discipleship_stage === 'Growing').length
                const satLeaders = satMembers.filter(m => m.discipleship_stage === 'Leader').length
                const satDiscipleMakers = satMembers.filter(m => m.leadership_level === 'Disciple Maker').length
                const satFullTime = satMembers.filter(m => m.is_full_time).length

                // Leadership breakdown per satellite
                const satLeadershipCounts = {
                  'Member': satMembers.filter(m => m.leadership_level === 'Member').length,
                  'Disciple Maker': satMembers.filter(m => m.leadership_level === 'Disciple Maker').length,
                  'Eagle': satMembers.filter(m => m.leadership_level === 'Eagle').length,
                  'Pastor': satMembers.filter(m => m.leadership_level === 'Pastor').length,
                  'Head Pastor': satMembers.filter(m => m.leadership_level === 'Head Pastor').length,
                }

                // Discipleship journey per satellite
                const satJourneyCounts = {
                  'Consolidations': satMembers.filter(m => m.discipleship_journey === 'Consolidations').length,
                  'Pre Encounter': satMembers.filter(m => m.discipleship_journey === 'Pre Encounter').length,
                  'Encounter': satMembers.filter(m => m.discipleship_journey === 'Encounter').length,
                  'Post-Encounter': satMembers.filter(m => m.discipleship_journey === 'Post-Encounter').length,
                  'SOD1': satMembers.filter(m => m.discipleship_journey === 'SOD1').length,
                  'SOD2': satMembers.filter(m => m.discipleship_journey === 'SOD2').length,
                  'SOD3': satMembers.filter(m => m.discipleship_journey === 'SOD3').length,
                  'Bible School': satMembers.filter(m => m.discipleship_journey === 'Bible School').length,
                  'QBS Theology 101': satMembers.filter(m => m.discipleship_journey === 'QBS Theology 101').length,
                  'QBS Preaching 101': satMembers.filter(m => m.discipleship_journey === 'QBS Preaching 101').length,
                }

                // Follow-through per satellite
                const satFollowThroughCounts = {
                  'Salvation': satMembers.filter(m => m.follow_through === 'Salvation').length,
                  'Prayer': satMembers.filter(m => m.follow_through === 'Prayer').length,
                  'Bible and Devotion': satMembers.filter(m => m.follow_through === 'Bible and Devotion').length,
                  'Transformation': satMembers.filter(m => m.follow_through === 'Transformation').length,
                  'Cell and Church': satMembers.filter(m => m.follow_through === 'Cell and Church').length,
                }

                return (
                  <div className="space-y-6">
                    {/* Back + Header */}
                    <div>
                      <button
                        onClick={() => setSelectedSatelliteId(null)}
                        className="text-[#8B1538] hover:text-[#6B0F2B] inline-flex items-center gap-1 text-sm mb-3"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        All Satellites
                      </button>
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-gray-900">{sat.name}</h2>
                          {sat.address && (
                            <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {sat.address}
                            </p>
                          )}
                        </div>
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${sat.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {sat.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {/* Contact Info */}
                    {(sat.contact_email || sat.contact_phone || sat.description) && (
                      <Card>
                        <CardContent className="p-5">
                          <div className="flex flex-wrap gap-6">
                            {sat.description && (
                              <div className="flex-1 min-w-[200px]">
                                <p className="text-sm text-gray-500 mb-1">About</p>
                                <p className="text-gray-700">{sat.description}</p>
                              </div>
                            )}
                            {sat.contact_email && (
                              <div>
                                <p className="text-sm text-gray-500 mb-1">Email</p>
                                <p className="text-gray-700">{sat.contact_email}</p>
                              </div>
                            )}
                            {sat.contact_phone && (
                              <div>
                                <p className="text-sm text-gray-500 mb-1">Phone</p>
                                <p className="text-gray-700">{sat.contact_phone}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Analytics */}
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      <Card>
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-[#8B1538]">{satMembers.length}</p>
                          <p className="text-xs text-gray-500">Members</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-teal-600">{satCellGroups.length}</p>
                          <p className="text-xs text-gray-500">Quest Circles</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-emerald-50 border-emerald-200">
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-emerald-600">{satFullTime}</p>
                          <p className="text-xs text-emerald-500">Full Time</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-purple-50 border-purple-200">
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-purple-600">{satNewbies}</p>
                          <p className="text-xs text-purple-500">New Friends</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-yellow-50 border-yellow-200">
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-600">{satGrowing}</p>
                          <p className="text-xs text-yellow-600">Schooling</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-orange-50 border-orange-200">
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-orange-600">{satDiscipleMakers}</p>
                          <p className="text-xs text-orange-500">Disciple Makers</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Stage Distribution Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Discipleship Stages</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {satMembers.length === 0 ? (
                            <div className="h-[200px] flex items-center justify-center text-gray-400">No members</div>
                          ) : (
                            <div className="space-y-3">
                              {([
                                { stage: 'New Friends', count: satNewbies, color: 'bg-amber-500', text: 'text-amber-700' },
                                { stage: 'Schooling', count: satGrowing, color: 'bg-teal-500', text: 'text-teal-700' },
                                { stage: 'Disciple Makers', count: satDiscipleMakers, color: 'bg-orange-500', text: 'text-orange-700' },
                              ] as const).map(({ stage, count, color, text }) => {
                                const pct = satMembers.length > 0 ? Math.round((count / satMembers.length) * 100) : 0
                                return (
                                  <div key={stage}>
                                    <div className="flex justify-between text-sm mb-1">
                                      <span className={`font-medium ${text}`}>{stage}</span>
                                      <span className="text-gray-500">{count} ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                      <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Quest Circles</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {satCellGroups.length === 0 ? (
                            <div className="h-[200px] flex items-center justify-center text-gray-400">No Quest Circles</div>
                          ) : (
                            <div className="space-y-2">
                              {satCellGroups.map(group => (
                                <Link
                                  key={group.id}
                                  to="/admin/cell-groups/$groupId"
                                  params={{ groupId: group.id }}
                                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  <div>
                                    <p className="font-medium text-gray-900">{group.name}</p>
                                    <p className="text-xs text-gray-500">
                                      {group.meeting_day ? `${group.meeting_day}s` : 'No schedule'}
                                      {group.leader && ` - Led by ${group.leader.name}`}
                                    </p>
                                  </div>
                                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </Link>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Leadership Breakdown */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg">Leadership Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                          {([
                            { label: 'Member', count: satLeadershipCounts['Member'], bg: 'bg-gray-50', text: 'text-gray-700', bar: 'bg-gray-400' },
                            { label: 'Disciple Maker', count: satLeadershipCounts['Disciple Maker'], bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-400' },
                            { label: 'Eagle', count: satLeadershipCounts['Eagle'], bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-400' },
                            { label: 'Pastor', count: satLeadershipCounts['Pastor'], bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-400' },
                            { label: 'Head Pastor', count: satLeadershipCounts['Head Pastor'], bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-400' },
                            { label: 'Full Time', count: satFullTime, bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-400' },
                          ] as const).map((level) => (
                            <div key={level.label} className={`rounded-lg p-3 ${level.bg} border`}>
                              <p className={`text-2xl font-bold ${level.text}`}>{level.count}</p>
                              <p className="text-xs font-medium text-gray-600 mb-2">{level.label}</p>
                              <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                                <div className={`h-full ${level.bar} rounded-full`} style={{ width: `${satMembers.length > 0 ? (level.count / satMembers.length) * 100 : 0}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Discipleship Journey Breakdown */}
                    {satMembers.length > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Discipleship Journey</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* New Friends */}
                            <div>
                              <button type="button" onClick={() => toggleJourneyGroup(`sat-${sat.id}-newFriends`)} className="flex items-center gap-2 mb-1 w-full hover:opacity-80 transition-opacity">
                                <span className="w-3 h-3 rounded-full bg-purple-500" />
                                <span className="font-semibold text-sm">New Friends ({satNewbies})</span>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isJourneyGroupExpanded(`sat-${sat.id}-newFriends`) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                              {isJourneyGroupExpanded(`sat-${sat.id}-newFriends`) && (
                                <div className="space-y-2 mt-2 ml-5">
                                  {([
                                    { label: 'Consolidations', count: satJourneyCounts['Consolidations'] },
                                  ] as const).map((item) => (
                                    <div key={item.label} className="flex items-center justify-between">
                                      <span className="text-sm text-gray-600">{item.label}</span>
                                      <div className="flex items-center gap-2">
                                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-purple-400 rounded-full" style={{ width: `${satNewbies > 0 ? (item.count / satNewbies) * 100 : 0}%` }} />
                                        </div>
                                        <span className="text-sm font-medium w-6 text-right">{item.count}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Growing */}
                            {(() => {
                              const satGrowingTotal = satJourneyCounts['Pre Encounter'] + satJourneyCounts['Encounter'] + satJourneyCounts['Post-Encounter']
                              return (
                                <div>
                                  <button type="button" onClick={() => toggleJourneyGroup(`sat-${sat.id}-growing`)} className="flex items-center gap-2 mb-1 w-full hover:opacity-80 transition-opacity">
                                    <span className="w-3 h-3 rounded-full bg-teal-500" />
                                    <span className="font-semibold text-sm">Growing ({satGrowingTotal})</span>
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isJourneyGroupExpanded(`sat-${sat.id}-growing`) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                  </button>
                                  {isJourneyGroupExpanded(`sat-${sat.id}-growing`) && (
                                    <div className="space-y-2 mt-2 ml-5">
                                      {([
                                        { label: 'Quest Life Preparation', count: satJourneyCounts['Pre Encounter'] },
                                        { label: 'Quest Retreat', count: satJourneyCounts['Encounter'] },
                                        { label: 'Post-Retreat', count: satJourneyCounts['Post-Encounter'] },
                                      ] as const).map((item) => (
                                        <div key={item.label} className="flex items-center justify-between">
                                          <span className="text-sm text-gray-600">{item.label}</span>
                                          <div className="flex items-center gap-2">
                                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                              <div className="h-full bg-teal-400 rounded-full" style={{ width: `${satGrowingTotal > 0 ? (item.count / satGrowingTotal) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-sm font-medium w-6 text-right">{item.count}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Schooling */}
                            {(() => {
                              const satSchoolingTotal = satJourneyCounts['SOD1'] + satJourneyCounts['SOD2'] + satJourneyCounts['SOD3'] + satJourneyCounts['Bible School'] + satJourneyCounts['QBS Theology 101'] + satJourneyCounts['QBS Preaching 101']
                              return (
                                <div>
                                  <button type="button" onClick={() => toggleJourneyGroup(`sat-${sat.id}-schooling`)} className="flex items-center gap-2 mb-1 w-full hover:opacity-80 transition-opacity">
                                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                                    <span className="font-semibold text-sm">Schooling ({satSchoolingTotal})</span>
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isJourneyGroupExpanded(`sat-${sat.id}-schooling`) ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                  </button>
                                  {isJourneyGroupExpanded(`sat-${sat.id}-schooling`) && (
                                    <div className="space-y-2 mt-2 ml-5">
                                      {([
                                        { label: 'SOD 1', count: satJourneyCounts['SOD1'] },
                                        { label: 'SOD 2', count: satJourneyCounts['SOD2'] },
                                        { label: 'SOD 3', count: satJourneyCounts['SOD3'] },
                                        { label: 'Bible School', count: satJourneyCounts['Bible School'] },
                                        { label: 'QBS Theology 101', count: satJourneyCounts['QBS Theology 101'] },
                                        { label: 'QBS Preaching 101', count: satJourneyCounts['QBS Preaching 101'] },
                                      ] as const).map((item) => (
                                        <div key={item.label} className="flex items-center justify-between">
                                          <span className="text-sm text-gray-600">{item.label}</span>
                                          <div className="flex items-center gap-2">
                                            <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                              <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${satSchoolingTotal > 0 ? (item.count / satSchoolingTotal) * 100 : 0}%` }} />
                                            </div>
                                            <span className="text-sm font-medium w-6 text-right">{item.count}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })()}

                            {/* Disciple Makers */}
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-3 h-3 rounded-full bg-orange-500" />
                                <span className="font-semibold text-sm">Disciple Makers ({satDiscipleMakers})</span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Follow-Through Breakdown */}
                    {satMembers.length > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg">Follow-Through Stages</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {([
                              { label: 'Salvation', count: satFollowThroughCounts['Salvation'], color: 'text-red-600' },
                              { label: 'Prayer', count: satFollowThroughCounts['Prayer'], color: 'text-blue-600' },
                              { label: 'Bible & Devotion', count: satFollowThroughCounts['Bible and Devotion'], color: 'text-amber-600' },
                              { label: 'Transformation', count: satFollowThroughCounts['Transformation'], color: 'text-purple-600' },
                              { label: 'Cell & Church', count: satFollowThroughCounts['Cell and Church'], color: 'text-teal-600' },
                            ] as const).map((item) => (
                              <div key={item.label} className="text-center p-3 bg-gray-50 rounded-lg border">
                                <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                                <p className="text-xs font-medium text-gray-600 mt-1">{item.label}</p>
                                <div className="w-full h-1.5 bg-white rounded-full overflow-hidden mt-2">
                                  <div className="h-full bg-gray-400 rounded-full" style={{ width: `${satMembers.length > 0 ? (item.count / satMembers.length) * 100 : 0}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Members List */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Members ({satMembers.length})</CardTitle>
                        <CardDescription>All members in {sat.name}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {satMembers.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">No members in this satellite</div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {satMembers.map(member => (
                              <MemberCard key={member.id} member={member} />
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )
              })()
            ) : (
              // Satellites List View
              <div className="space-y-6">
                {/* Header with Add button */}
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">All Satellites</h2>
                  <Button size="sm" onClick={() => { setSatForm({ name: '' }); setShowSatDialog(true) }}>Add Satellite</Button>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-[#8B1538]">{satellites.filter(s => s.is_active).length}</p>
                      <p className="text-xs text-gray-500">Satellites</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-teal-600">{members.length}</p>
                      <p className="text-xs text-gray-500">Total Members</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-blue-600">{cellGroups.length}</p>
                      <p className="text-xs text-gray-500">Quest Circles</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-purple-600">{members.filter(m => m.discipleship_stage === 'Newbie').length}</p>
                      <p className="text-xs text-gray-500">New Friends</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-600">{members.filter(m => m.discipleship_stage === 'Growing').length}</p>
                      <p className="text-xs text-gray-500">Schooling</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-orange-600">{members.filter(m => m.discipleship_stage === 'Leader').length}</p>
                      <p className="text-xs text-gray-500">Leader</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Satellite Comparison Table */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Satellite Comparison</CardTitle>
                    <CardDescription>Side-by-side overview of all satellites</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="font-semibold">Satellite</TableHead>
                            <TableHead className="text-center">Members</TableHead>
                            <TableHead className="text-center">Quest Circles</TableHead>
                            <TableHead className="text-center">New Friends</TableHead>
                            <TableHead className="text-center">Schooling</TableHead>
                            <TableHead className="text-center">Leader</TableHead>
                            <TableHead className="text-center">Disciple Makers</TableHead>
                            <TableHead className="text-center">Full Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {satellites.filter(s => s.is_active).map(sat => {
                            const sm = members.filter(m => m.satellite_id === sat.id)
                            return (
                              <TableRow key={sat.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedSatelliteId(sat.id)}>
                                <TableCell className="font-medium">{sat.name.replace('Quest ', '')}</TableCell>
                                <TableCell className="text-center font-semibold text-[#8B1538]">{sm.length}</TableCell>
                                <TableCell className="text-center">{cellGroups.filter(g => g.satellite_id === sat.id).length}</TableCell>
                                <TableCell className="text-center text-purple-600">{sm.filter(m => m.discipleship_stage === 'Newbie').length}</TableCell>
                                <TableCell className="text-center text-yellow-600">{sm.filter(m => m.discipleship_stage === 'Growing').length}</TableCell>
                                <TableCell className="text-center text-orange-600">{sm.filter(m => m.discipleship_stage === 'Leader').length}</TableCell>
                                <TableCell className="text-center text-blue-600">{sm.filter(m => m.leadership_level === 'Disciple Maker').length}</TableCell>
                                <TableCell className="text-center text-emerald-600">{sm.filter(m => m.is_full_time).length}</TableCell>
                              </TableRow>
                            )
                          })}
                          {/* Totals row */}
                          <TableRow className="bg-gray-50 font-semibold border-t-2">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-center text-[#8B1538]">{members.length}</TableCell>
                            <TableCell className="text-center">{cellGroups.length}</TableCell>
                            <TableCell className="text-center text-purple-600">{members.filter(m => m.discipleship_stage === 'Newbie').length}</TableCell>
                            <TableCell className="text-center text-yellow-600">{members.filter(m => m.discipleship_stage === 'Growing').length}</TableCell>
                            <TableCell className="text-center text-orange-600">{members.filter(m => m.discipleship_stage === 'Leader').length}</TableCell>
                            <TableCell className="text-center text-blue-600">{members.filter(m => m.leadership_level === 'Disciple Maker').length}</TableCell>
                            <TableCell className="text-center text-emerald-600">{members.filter(m => m.is_full_time).length}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Members Distribution Bar Chart */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Members per Satellite</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(() => {
                          // Rank satellites by member count (descending). Compute counts and
                          // the max ONCE, then sort, then render — the old code sorted JSX
                          // elements with a no-op comparator, so bars stayed in name order.
                          const withCounts = satellites
                            .filter(s => s.is_active)
                            .map(sat => ({ sat, count: members.filter(m => m.satellite_id === sat.id).length }))
                          const maxCount = Math.max(...withCounts.map(w => w.count), 1)
                          return withCounts
                            .sort((a, b) => b.count - a.count)
                            .map(({ sat, count }) => (
                              <div key={sat.id} className="cursor-pointer hover:bg-gray-50 rounded p-1 -m-1" onClick={() => setSelectedSatelliteId(sat.id)}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium text-gray-700">{sat.name.replace('Quest ', '')}</span>
                                  <span className="font-semibold text-[#8B1538]">{count}</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-3">
                                  <div className="bg-[#8B1538] h-3 rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                                </div>
                              </div>
                            ))
                        })()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg">Stage Distribution per Satellite</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {satellites
                          .filter(s => s.is_active)
                          .map(sat => {
                            const sm = members.filter(m => m.satellite_id === sat.id)
                            const n = sm.filter(m => m.discipleship_stage === 'Newbie').length
                            const g = sm.filter(m => m.discipleship_stage === 'Growing').length
                            const l = sm.filter(m => m.discipleship_stage === 'Leader').length
                            const total = sm.length || 1
                            return (
                              <div key={sat.id} className="cursor-pointer hover:bg-gray-50 rounded p-1 -m-1" onClick={() => setSelectedSatelliteId(sat.id)}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium text-gray-700">{sat.name.replace('Quest ', '')}</span>
                                  <span className="text-xs text-gray-400">{sm.length} members</span>
                                </div>
                                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                                  {n > 0 && <div className="bg-purple-400" style={{ width: `${(n / total) * 100}%` }} title={`${n} New Friends`} />}
                                  {g > 0 && <div className="bg-yellow-400" style={{ width: `${(g / total) * 100}%` }} title={`${g} Schooling`} />}
                                  {l > 0 && <div className="bg-orange-400" style={{ width: `${(l / total) * 100}%` }} title={`${l} Leader`} />}
                                </div>
                              </div>
                            )
                          })}
                        <div className="flex gap-4 mt-2 text-xs text-gray-500 justify-center">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> New Friends</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Schooling</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> Leader</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Satellite Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {satellites.map(sat => {
                    const satMemberCount = members.filter(m => m.satellite_id === sat.id).length
                    const satGroupCount = cellGroups.filter(g => g.satellite_id === sat.id).length
                    const satNewbieCount = members.filter(m => m.satellite_id === sat.id && m.discipleship_stage === 'Newbie').length
                    const satGrowingCount = members.filter(m => m.satellite_id === sat.id && m.discipleship_stage === 'Growing').length
                    const satLeaderCount = members.filter(m => m.satellite_id === sat.id && m.discipleship_stage === 'Leader').length

                    return (
                      <Card
                        key={sat.id}
                        className={`cursor-pointer hover:shadow-md transition-shadow ${!sat.is_active ? 'opacity-60' : ''}`}
                        onClick={() => setSelectedSatelliteId(sat.id)}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{sat.name}</CardTitle>
                            <div className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full ${sat.is_active ? 'bg-green-500' : 'bg-gray-300'}`} role="img" aria-label={sat.is_active ? 'Active' : 'Inactive'} />
                              <button
                                onClick={(e) => { e.stopPropagation(); setSatToDelete(sat) }}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                                title="Delete satellite"
                                aria-label={`Delete ${sat.name}`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {sat.address && (
                            <CardDescription className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {sat.address}
                            </CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          {/* Stats row */}
                          <div className="flex items-center gap-4 mb-3">
                            <div className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              <span className="text-sm font-medium">{satMemberCount} members</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              <span className="text-sm font-medium">{satGroupCount} groups</span>
                            </div>
                          </div>

                          {/* Stage mini-bar */}
                          {satMemberCount > 0 && (
                            <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
                              {satNewbieCount > 0 && (
                                <div className="bg-amber-500" style={{ width: `${(satNewbieCount / satMemberCount) * 100}%` }} title={`${satNewbieCount} New Friends`} />
                              )}
                              {satGrowingCount > 0 && (
                                <div className="bg-teal-500" style={{ width: `${(satGrowingCount / satMemberCount) * 100}%` }} title={`${satGrowingCount} Schooling`} />
                              )}
                              {satLeaderCount > 0 && (
                                <div className="bg-slate-500" style={{ width: `${(satLeaderCount / satMemberCount) * 100}%` }} title={`${satLeaderCount} Leaders`} />
                              )}
                            </div>
                          )}
                          {satMemberCount > 0 && (
                            <div className="flex gap-3 mt-2 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />{satNewbieCount} New Friends</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />{satGrowingCount} Schooling</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500" />{satLeaderCount} Leader</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <MembersTabContent
              members={members}
              satellites={satellites}
              isLoading={isLoading}
              onDataChanged={() => setRefreshTrigger(p => p + 1)}
              memberIdsInCellGroups={memberIdsInCellGroups}
            />
          </TabsContent>

          {/* Quest Circles Tab */}
          <TabsContent value="cell-groups">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Quest Circles</CardTitle>
                    <CardDescription>{isLoading ? 'Loading Quest Circles…' : `${filteredCellGroups.length} groups found`}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <ExportBtn id="cell-groups" onExport={exportCellGroups} />
                    <Button size="sm" onClick={() => openCGDialog()}>Add Quest Circle</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <Input
                      placeholder="Search by name or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select
                    value={selectedSatellite}
                    onChange={(e) => setSelectedSatellite(e.target.value)}
                    className="px-3 py-2 border rounded-lg"
                  >
                    <option value="">All Satellites</option>
                    {satellites.map((sat) => (
                      <option key={sat.id} value={sat.id}>{sat.name}</option>
                    ))}
                  </select>
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => <CellGroupCardSkeleton key={i} />)}
                  </div>
                ) : filteredCellGroups.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No Quest Circles found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCellGroups.map((group) => (
                      <CellGroupCard
                        key={group.id}
                        cellGroup={group}
                        showActions
                        onEdit={() => openCGDialog(group)}
                        onDelete={() => setCGToDelete(group)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ministries Tab */}
          <TabsContent value="ministries">
            <div className="flex justify-end mb-4">
              <ExportBtn id="ministries" onExport={exportMinistries} />
            </div>
            {/* Ministry Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-[#8B1538]">{ministryRoleCounts.total}</p>
                  <p className="text-xs text-gray-500">Total Serving</p>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{ministryRoleCounts.volunteers}</p>
                  <p className="text-xs text-blue-500">Volunteers</p>
                </CardContent>
              </Card>
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{ministryRoleCounts.coordinators}</p>
                  <p className="text-xs text-amber-500">Coordinators</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-3 text-center">
                  <p className="text-2xl font-bold text-purple-600">{ministryRoleCounts.heads}</p>
                  <p className="text-xs text-purple-500">Heads</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Ministries</CardTitle>
                    <CardDescription>{isLoading ? 'Loading ministries…' : `${filteredMinistries.length} ministries found`}</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openMinDialog()}>Add Ministry</Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search */}
                <div className="mb-6">
                  <Input
                    placeholder="Search by name or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                {isLoading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => <MinistryCardSkeleton key={i} />)}
                  </div>
                ) : filteredMinistries.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No ministries found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredMinistries.map((ministry) => (
                      <MinistryCard
                        key={ministry.id}
                        ministry={ministry}
                        showActions
                        onEdit={() => openMinDialog(ministry)}
                        onDelete={() => setMinToDelete(ministry)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events">
            <div className="space-y-6">
              <div className="flex justify-end">
                <ExportBtn id="events" onExport={exportEvents} />
              </div>
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-[#8B1538]">{events.length}</p>
                    <p className="text-sm text-gray-500">Total Events</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-teal-600">
                      {events.filter(e => e.registration_open).length}
                    </p>
                    <p className="text-sm text-gray-500">Open Registration</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-amber-600">
                      {events.reduce((sum, e) => sum + e.registration_count, 0)}
                    </p>
                    <p className="text-sm text-gray-500">Total Registrations</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-slate-600">
                      {events.filter(e => {
                        const t = e.event_date ? new Date(e.event_date).getTime() : NaN
                        return !Number.isNaN(t) && t >= Date.now()
                      }).length}
                    </p>
                    <p className="text-sm text-gray-500">Upcoming</p>
                  </CardContent>
                </Card>
              </div>

              {/* Events List */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Events</CardTitle>
                      <CardDescription>Manage church events and registrations</CardDescription>
                    </div>
                    <Link to="/event">
                      <Button variant="outline" size="sm">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Full Events Dashboard
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[...Array(3)].map((_, i) => (
                        <Card key={i} className="animate-pulse">
                          <CardHeader>
                            <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                            <div className="h-4 bg-gray-200 rounded w-1/2" />
                          </CardHeader>
                          <CardContent>
                            <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                            <div className="h-4 bg-gray-200 rounded w-2/3" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : events.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="font-medium mb-2">No events yet</p>
                      <p className="text-sm mb-4">Create your first event from the Events Dashboard</p>
                      <Link to="/event">
                        <Button>Go to Events Dashboard</Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {events.map((event) => {
                        const eventTime = event.event_date ? new Date(event.event_date).getTime() : NaN
                        const isPast = !Number.isNaN(eventTime) && eventTime < Date.now()
                        return (
                          <Link key={event.id} to="/event/$eventId" params={{ eventId: event.id }}>
                            <Card className={`hover:shadow-md transition-shadow cursor-pointer h-full ${isPast ? 'opacity-70' : ''}`}>
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-2">
                                  <CardTitle className="text-base">{event.name}</CardTitle>
                                  <div className="flex gap-1 shrink-0">
                                    {event.registration_open ? (
                                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">Open</span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">Closed</span>
                                    )}
                                    {isPast && (
                                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Past</span>
                                    )}
                                  </div>
                                </div>
                                <CardDescription>
                                  {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  {event.event_time && ` at ${event.event_time}`}
                                </CardDescription>
                              </CardHeader>
                              <CardContent className="pt-0">
                                {event.location && (
                                  <p className="text-sm text-gray-500 mb-2 truncate">{event.location}</p>
                                )}
                                <div className="flex items-center justify-between text-sm">
                                  <span>
                                    <span className="font-semibold text-[#8B1538]">{event.registration_count}</span>
                                    <span className="text-gray-500">{event.expected_attendees ? ` / ${event.expected_attendees}` : ''} registered</span>
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Finances Tab */}
          <TabsContent value="finances">
            {!financesUnlocked ? (
              <div className="flex items-center justify-center py-24">
                <Card className="w-full max-w-sm">
                  <CardHeader className="text-center">
                    <CardTitle className="text-xl">Finances</CardTitle>
                    <CardDescription>Enter your PIN to view financial data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleFinancesPinSubmit} className="space-y-4">
                      <Input
                        type="password"
                        placeholder="Enter PIN"
                        value={financesPinInput}
                        onChange={(e) => setFinancesPinInput(e.target.value)}
                        className="text-center text-2xl tracking-widest"
                        maxLength={10}
                        autoFocus
                      />
                      {financesPinError && <p className="text-red-500 text-sm text-center">{financesPinError}</p>}
                      <Button type="submit" className="w-full bg-[#8B1538] hover:bg-[#6B0F2B]">
                        Continue
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className={`text-3xl font-bold ${(financialOverview?.currentBalance ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(financialOverview?.currentBalance ?? 0)}
                    </p>
                    <p className="text-sm text-gray-500">Current Balance</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">
                      {formatCurrency(financialOverview?.totalIncome ?? 0)}
                    </p>
                    <p className="text-sm text-gray-500">Total Income</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-3xl font-bold text-red-600">
                      {formatCurrency(financialOverview?.totalExpenses ?? 0)}
                    </p>
                    <p className="text-sm text-gray-500">Total Expenses</p>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Transactions + Full Dashboard Link */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Finances</CardTitle>
                      <CardDescription>Track tithes, offerings, and expenses</CardDescription>
                    </div>
                    <Link to="/finances">
                      <Button size="sm" className="bg-[#8B1538] hover:bg-[#6B0F2B] text-white">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Full Finances Dashboard
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 bg-gray-200 rounded-full" />
                            <div>
                              <div className="h-4 bg-gray-200 rounded w-24 mb-1" />
                              <div className="h-3 bg-gray-200 rounded w-32" />
                            </div>
                          </div>
                          <div className="h-4 bg-gray-200 rounded w-20" />
                        </div>
                      ))}
                    </div>
                  ) : !financialOverview?.recentTransactions.length ? (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="font-medium mb-2">No transactions yet</p>
                      <p className="text-sm mb-4">Record your first income or expense from the Finances Dashboard</p>
                      <Link to="/finances">
                        <Button>Go to Finances Dashboard</Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {financialOverview.recentTransactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${tx.transaction_type === 'income' ? 'bg-emerald-500' : 'bg-red-500'}`}
                            />
                            <div>
                              <p className="text-sm font-medium">{tx.category}</p>
                              <p className="text-xs text-gray-500">
                                {tx.transaction_date}
                                {tx.satellite?.name ? ` · ${tx.satellite.name}` : ''}
                                {tx.member?.name ? ` · ${tx.member.name}` : ''}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`font-medium text-sm ${tx.transaction_type === 'income' ? 'text-emerald-600' : 'text-red-600'}`}
                          >
                            {tx.transaction_type === 'income' ? '+' : '-'}
                            {formatCurrency(Number(tx.amount))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Satellite Breakdown */}
              {financialOverview?.bySatellite.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>By Satellite</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
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
                          {financialOverview.bySatellite.map((s) => (
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
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
            )}
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory">
            <Card>
              <CardHeader className="px-4 sm:px-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg sm:text-xl">Inventory</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {inventoryStats.uniqueItems} items ({inventoryStats.totalItems} total qty)
                      {inventoryStats.needsRepair > 0 && (
                        <span className="text-amber-600 ml-2">
                          {inventoryStats.needsRepair} need attention
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => openInventoryDialog()}>
                    + Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 sm:px-6">
                {/* Filters */}
                <div className="flex flex-col gap-3 mb-5">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search items..."
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      className="flex-1"
                    />
                    {/* View Toggle */}
                    <div className="flex border rounded-lg overflow-hidden shrink-0">
                      <button
                        onClick={() => setInventoryView('grid')}
                        className={`px-2.5 py-2 ${inventoryView === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                        title="Grid view"
                        aria-label="Grid view"
                        aria-pressed={inventoryView === 'grid'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setInventoryView('list')}
                        className={`px-2.5 py-2 ${inventoryView === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                        title="List view"
                        aria-label="List view"
                        aria-pressed={inventoryView === 'list'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <select
                      value={inventoryFilterLocation}
                      onChange={(e) => setInventoryFilterLocation(e.target.value)}
                      className="px-3 py-1.5 border rounded-lg text-sm"
                    >
                      <option value="">All Locations</option>
                      {INVENTORY_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                    <select
                      value={inventoryFilterCategory}
                      onChange={(e) => setInventoryFilterCategory(e.target.value)}
                      className="px-3 py-1.5 border rounded-lg text-sm"
                    >
                      <option value="">All Categories</option>
                      {inventoryCategories.map((cat) => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowCategoryDialog(true)}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Manage Categories
                    </button>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-5">
                  <div className="bg-blue-50 rounded-lg p-2.5 sm:p-3 text-center">
                    <p className="text-xl sm:text-2xl font-bold text-blue-700">{inventoryStats.uniqueItems}</p>
                    <p className="text-[10px] sm:text-xs text-blue-600">Unique Items</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-2.5 sm:p-3 text-center">
                    <p className="text-xl sm:text-2xl font-bold text-emerald-700">{inventoryStats.totalItems}</p>
                    <p className="text-[10px] sm:text-xs text-emerald-600">Total Quantity</p>
                  </div>
                  {INVENTORY_LOCATIONS.map((loc) => (
                    <div key={loc} className="bg-gray-50 rounded-lg p-2.5 sm:p-3 text-center">
                      <p className="text-xl sm:text-2xl font-bold text-gray-700">{inventoryStats.byLocation[loc] || 0}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">{loc}</p>
                    </div>
                  ))}
                </div>

                {/* Items */}
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="animate-pulse border rounded-lg p-4 flex gap-3">
                        <div className="w-16 h-16 bg-gray-200 rounded shrink-0" />
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                          <div className="h-3 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredInventory.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <p className="font-medium">No items found</p>
                    <p className="text-sm mt-1">Add your first inventory item to get started</p>
                  </div>
                ) : inventoryView === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {filteredInventory.map((item) => (
                      <div key={item.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                        <div className="h-24 sm:h-32 bg-gray-100 flex items-center justify-center overflow-hidden">
                          {item.photo_url ? (
                            <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          )}
                        </div>
                        <div className="p-2.5">
                          <div className="flex items-start justify-between gap-1">
                            <h3 className="font-semibold text-xs sm:text-sm truncate">{item.name}</h3>
                            <span className="text-[10px] font-medium text-gray-500 shrink-0 bg-gray-100 px-1 py-0.5 rounded">x{item.quantity}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              item.location === 'Moriah Hall' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {item.location}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              item.condition === 'Good' ? 'bg-emerald-100 text-emerald-700' :
                              item.condition === 'Fair' ? 'bg-yellow-100 text-yellow-700' :
                              item.condition === 'Needs Repair' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {item.condition}
                            </span>
                          </div>
                          <div className="flex gap-1.5 mt-2 pt-2 border-t">
                            <Button size="sm" variant="outline" className="flex-1 text-[10px] sm:text-xs h-7" onClick={() => openInventoryDialog(item)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 text-[10px] sm:text-xs h-7 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setInventoryToDelete(item)}>
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* List View */
                  <div className="space-y-2">
                    {filteredInventory.map((item) => (
                      <div key={item.id} className="border rounded-lg p-3 flex gap-3 items-center hover:shadow-sm transition-shadow">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gray-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                          {item.photo_url ? (
                            <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm truncate">{item.name}</h3>
                            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">x{item.quantity}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              item.location === 'Moriah Hall' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {item.location}
                            </span>
                            {item.category && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600">{item.category}</span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              item.condition === 'Good' ? 'bg-emerald-100 text-emerald-700' :
                              item.condition === 'Fair' ? 'bg-yellow-100 text-yellow-700' :
                              item.condition === 'Needs Repair' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {item.condition}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="text-xs h-8 px-2.5" onClick={() => openInventoryDialog(item)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-8 px-2.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setInventoryToDelete(item)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
              <div className="space-y-6">
                {/* Admin Account Setup */}
                <Card className="border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-blue-700">Admin Account</CardTitle>
                    <CardDescription>Create or update the admin login account (admin@questlaguna.org)</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-4">
                    <Button onClick={handleSetupAdmin} disabled={isSettingUpAdmin} className="bg-blue-600 hover:bg-blue-700">
                      {isSettingUpAdmin ? 'Setting up...' : 'Setup Admin Account'}
                    </Button>
                    {adminSetupResult && (
                      <span className="text-sm text-gray-600">{adminSetupResult}</span>
                    )}
                  </CardContent>
                </Card>

                {/* Import Spreadsheet Data */}
                <Card className="border-amber-200">
                  <CardHeader>
                    <CardTitle className="text-amber-700">Import Spreadsheet Data</CardTitle>
                    <CardDescription>Import real church member data from the spreadsheet (278 members)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setShowImportDialog(true)} className="bg-amber-600 hover:bg-amber-700">
                      Import Members
                    </Button>
                  </CardContent>
                </Card>

                {/* Re-link Relationships */}
                <Card className="border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-blue-700">Re-link Relationships</CardTitle>
                    <CardDescription>Re-run discipler and ministry assignment linking on existing members</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleRelinkRelationships} disabled={isRelinking} className="bg-blue-600 hover:bg-blue-700">
                      {isRelinking ? 'Linking...' : 'Re-link Relationships'}
                    </Button>
                    {relinkResult && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                        <p className="font-medium text-blue-800">Re-link completed!</p>
                        <ul className="mt-1 text-blue-700 space-y-0.5">
                          <li>{relinkResult.disciplerLinks} discipler relationships linked</li>
                          <li>{relinkResult.ministryLinks} ministry assignments created</li>
                        </ul>
                        {relinkResult.errors.length > 0 && (
                          <p className="mt-1 text-red-600">{relinkResult.errors.length} errors</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Generate Quest Circles */}
                <Card className="border-teal-200">
                  <CardHeader>
                    <CardTitle className="text-teal-700">Generate Quest Circles</CardTitle>
                    <CardDescription>Auto-create Quest Circles from discipler-disciple relationships. Each discipler becomes a Quest Circle leader, their disciples become members.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleGenerateCellGroups} disabled={isGeneratingCellGroups} className="bg-teal-600 hover:bg-teal-700">
                      {isGeneratingCellGroups ? 'Generating...' : 'Generate Quest Circles'}
                    </Button>
                    {cellGroupGenResult && (
                      <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm">
                        <p className="font-medium text-teal-800">Quest Circles generated!</p>
                        <ul className="mt-1 text-teal-700 space-y-0.5">
                          <li>{cellGroupGenResult.cellGroupsCreated} Quest Circles created</li>
                          <li>{cellGroupGenResult.membershipsCreated} memberships created</li>
                          <li>{cellGroupGenResult.disciplerLinksUpdated} discipler links updated</li>
                          {cellGroupGenResult.disciplersAutoCreated > 0 && (
                            <li>{cellGroupGenResult.disciplersAutoCreated} disciplers auto-created as new members</li>
                          )}
                          {cellGroupGenResult.skipped > 0 && (
                            <li>{cellGroupGenResult.skipped} skipped (already exist)</li>
                          )}
                        </ul>
                        {cellGroupGenResult.errors.length > 0 && (
                          <p className="mt-1 text-red-600">{cellGroupGenResult.errors.length} errors</p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Admin PIN */}
                <Card className="border-gray-200">
                  <CardHeader>
                    <CardTitle>Admin PIN</CardTitle>
                    <CardDescription>PIN required to access protected sections (Finances, etc.)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <code className="px-3 py-1.5 bg-gray-100 rounded-md text-sm font-mono tracking-widest">
                        {ADMIN_PIN}
                      </code>
                      <span className="text-xs text-gray-500">Set via <code className="bg-gray-100 px-1 rounded">VITE_ADMIN_PIN</code> in your .env file</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Purge Data */}
                <Card className="border-red-200">
                  <CardHeader>
                    <CardTitle className="text-red-700">Danger Zone</CardTitle>
                    <CardDescription>Permanently delete all directory data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="destructive" onClick={() => setShowPurgeDialog(true)}>
                      Purge All Data
                    </Button>
                  </CardContent>
                </Card>
              </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Purge Dialog */}
      <Dialog open={showPurgeDialog} onOpenChange={(open) => { setShowPurgeDialog(open); if (!open) { setPurgeConfirmText(''); setPurgeResult(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Purge All Directory Data</DialogTitle>
            <DialogDescription>This action cannot be undone!</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {purgeResult ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-medium text-red-800 mb-2">Data purged successfully!</p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>{purgeResult.members} members deleted</li>
                  <li>{purgeResult.cell_groups} Quest Circles deleted</li>
                  <li>{purgeResult.ministries} ministries deleted</li>
                  <li>{purgeResult.member_cell_groups} cell memberships deleted</li>
                  <li>{purgeResult.member_ministries} ministry memberships deleted</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">
                  This will permanently delete all members, Quest Circles, ministries, and their relationships.
                </p>
                <div>
                  <Label>Type "DELETE ALL DATA" to confirm</Label>
                  <Input
                    value={purgeConfirmText}
                    onChange={(e) => setPurgeConfirmText(e.target.value)}
                    placeholder="DELETE ALL DATA"
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPurgeDialog(false); setPurgeConfirmText(''); setPurgeResult(null); }}>
              {purgeResult ? 'Close' : 'Cancel'}
            </Button>
            {!purgeResult && (
              <Button
                variant="destructive"
                onClick={handlePurgeDirectory}
                disabled={isPurgingDirectory || purgeConfirmText !== 'DELETE ALL DATA'}
              >
                {isPurgingDirectory ? 'Purging...' : 'Purge All Data'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Spreadsheet Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(open) => { setShowImportDialog(open); if (!open) setImportResult(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-700">Import Spreadsheet Data</DialogTitle>
            <DialogDescription>Import real church member data from the extracted spreadsheet</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {importResult ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="font-medium text-green-800 mb-2">Import completed!</p>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>{importResult.imported} members imported</li>
                    <li>{importResult.skipped} members skipped</li>
                    <li>{importResult.disciplerLinks} discipler relationships linked</li>
                    <li>{importResult.ministryLinks} ministry assignments created</li>
                  </ul>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="font-medium text-red-800 mb-2">Errors ({importResult.errors.length}):</p>
                    <ul className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                      {importResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-gray-600">
                  This will import member data from the extracted Google Spreadsheet into the directory.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-amber-800 mb-1">Data includes:</p>
                  <ul className="text-amber-700 space-y-0.5">
                    <li>COMMUNITY tab (~12 members)</li>
                    <li>SATELIGHTS tab (~101 members)</li>
                    <li>QUEST LAGUNA tab (~165 members)</li>
                  </ul>
                </div>
                <p className="text-sm text-gray-500">
                  Members will be matched to satellites automatically. Duplicate names will be skipped.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportResult(null); }}>
              {importResult ? 'Close' : 'Cancel'}
            </Button>
            {!importResult && (
              <Button onClick={handleImportSpreadsheet} disabled={isImporting} className="bg-amber-600 hover:bg-amber-700">
                {isImporting ? 'Importing...' : 'Start Import'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quest Circle Create/Edit Dialog */}
      <Dialog open={showCGDialog} onOpenChange={setShowCGDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCG ? 'Edit Quest Circle' : 'Add Quest Circle'}</DialogTitle>
            <DialogDescription>
              {editingCG ? 'Update the Quest Circle details below.' : 'Fill in the details to create a new Quest Circle.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="cg-name">Name *</Label>
              <Input
                id="cg-name"
                value={cgForm.name}
                onChange={(e) => setCGForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Cell group name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cg-desc">Description</Label>
              <Textarea
                id="cg-desc"
                value={cgForm.description}
                onChange={(e) => setCGForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="cg-satellite">Satellite</Label>
              <select
                id="cg-satellite"
                value={cgForm.satellite_id}
                onChange={(e) => setCGForm(f => ({ ...f, satellite_id: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">None</option>
                {satellites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cg-leader">Leader</Label>
                <select
                  id="cg-leader"
                  value={cgForm.leader_id}
                  onChange={(e) => setCGForm(f => ({ ...f, leader_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">None</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="cg-coleader">Co-Leader</Label>
                <select
                  id="cg-coleader"
                  value={cgForm.co_leader_id}
                  onChange={(e) => setCGForm(f => ({ ...f, co_leader_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">None</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cg-day">Meeting Day</Label>
                <select
                  id="cg-day"
                  value={cgForm.meeting_day}
                  onChange={(e) => setCGForm(f => ({ ...f, meeting_day: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Not set</option>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="cg-time">Meeting Time</Label>
                <Input
                  id="cg-time"
                  type="time"
                  value={cgForm.meeting_time}
                  onChange={(e) => setCGForm(f => ({ ...f, meeting_time: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cg-location">Meeting Location</Label>
              <Input
                id="cg-location"
                value={cgForm.meeting_location}
                onChange={(e) => setCGForm(f => ({ ...f, meeting_location: e.target.value }))}
                placeholder="e.g., Leader's home, Church hall..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cg-max">Max Members</Label>
                <Input
                  id="cg-max"
                  type="number"
                  min={2}
                  max={50}
                  value={cgForm.max_members}
                  onChange={(e) => setCGForm(f => ({ ...f, max_members: parseInt(e.target.value) || 12 }))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cgForm.is_active}
                    onChange={(e) => setCGForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCGDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveCG} disabled={isSavingCG || !cgForm.name.trim()}>
              {isSavingCG ? 'Saving...' : editingCG ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quest Circle Delete Confirmation Dialog */}
      <Dialog open={!!cgToDelete} onOpenChange={(open) => { if (!open) setCGToDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete Quest Circle</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{cgToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCGToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCG} disabled={isSavingCG}>
              {isSavingCG ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ministry Create/Edit Dialog */}
      <Dialog open={showMinDialog} onOpenChange={setShowMinDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMin ? 'Edit Ministry' : 'Add Ministry'}</DialogTitle>
            <DialogDescription>
              {editingMin ? 'Update the ministry details below.' : 'Fill in the details to create a new ministry.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="min-name">Name *</Label>
              <Input
                id="min-name"
                value={minForm.name}
                onChange={(e) => setMinForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ministry name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="min-desc">Description</Label>
              <Textarea
                id="min-desc"
                value={minForm.description}
                onChange={(e) => setMinForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="min-dept">Department</Label>
              <Input
                id="min-dept"
                value={minForm.department}
                onChange={(e) => setMinForm(f => ({ ...f, department: e.target.value }))}
                placeholder="e.g., Worship, Media, Creative..."
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="min-head">Head</Label>
              <select
                id="min-head"
                value={minForm.head_id}
                onChange={(e) => setMinForm(f => ({ ...f, head_id: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">None</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {/* Group Photo */}
            <div>
              <Label htmlFor="min-photo">Group Photo</Label>
              <div className="mt-1">
                <input
                  id="min-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 file:cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setMinPhotoFile(file)
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (ev) => setMinPhotoPreview(ev.target?.result as string)
                      reader.readAsDataURL(file)
                    } else {
                      setMinPhotoPreview(null)
                    }
                  }}
                />
                <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP, or GIF. Max 5MB.</p>
              </div>
              {minPhotoPreview && (
                <div className="mt-2 relative inline-block">
                  <img src={minPhotoPreview} alt="Preview" className="max-h-32 rounded border" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-white rounded-full p-0.5 shadow text-gray-500 hover:text-red-600"
                    onClick={() => {
                      setMinPhotoFile(null)
                      setMinPhotoPreview(null)
                      const input = document.getElementById('min-photo') as HTMLInputElement
                      if (input) input.value = ''
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {!minPhotoFile && existingMinPhotoUrl && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={existingMinPhotoUrl} alt="Current" className="max-h-24 rounded border" />
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={() => setExistingMinPhotoUrl(null)}
                  >
                    Remove photo
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={minForm.is_active}
                  onChange={(e) => setMinForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">Active</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMinDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveMin} disabled={isSavingMin || !minForm.name.trim()}>
              {isSavingMin ? 'Saving...' : editingMin ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ministry Delete Confirmation Dialog */}
      <Dialog open={!!minToDelete} onOpenChange={(open) => { if (!open) setMinToDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete Ministry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{minToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMinToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteMin} disabled={isSavingMin}>
              {isSavingMin ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Satellite Create Dialog */}
      <Dialog open={showSatDialog} onOpenChange={setShowSatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Satellite</DialogTitle>
            <DialogDescription>Enter the name for the new satellite location.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="sat-name">Satellite Name *</Label>
            <Input
              id="sat-name"
              value={satForm.name}
              onChange={(e) => setSatForm({ name: e.target.value })}
              placeholder="e.g., Quest Biñan"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSatDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveSat} disabled={isSavingSat || !satForm.name.trim()}>
              {isSavingSat ? 'Adding...' : 'Add Satellite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Satellite Delete Confirmation Dialog */}
      <Dialog open={!!satToDelete} onOpenChange={(open) => { if (!open) setSatToDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete Satellite</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{satToDelete?.name}"? This will fail if there are attendees registered under this satellite.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSatToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSat} disabled={isSavingSat}>
              {isSavingSat ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory Add/Edit Dialog */}
      <Dialog open={showInventoryDialog} onOpenChange={(open) => { if (!open) setShowInventoryDialog(false) }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingInventory ? 'Edit Item' : 'Add Item'}</DialogTitle>
            <DialogDescription>
              {editingInventory ? 'Update the inventory item details' : 'Add a new item to the inventory'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto px-1">
            <div>
              <Label htmlFor="inv-name" className="mb-1.5 block">Name *</Label>
              <Input
                id="inv-name"
                value={inventoryForm.name}
                onChange={(e) => setInventoryForm({ ...inventoryForm, name: e.target.value })}
                placeholder="e.g. Yamaha Mixer"
                maxLength={200}
                className="h-11"
              />
            </div>
            <div>
              <Label htmlFor="inv-desc" className="mb-1.5 block">Description</Label>
              <Textarea
                id="inv-desc"
                value={inventoryForm.description}
                onChange={(e) => setInventoryForm({ ...inventoryForm, description: e.target.value })}
                placeholder="Optional description..."
                maxLength={1000}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inv-location" className="mb-1.5 block">Location *</Label>
                <select
                  id="inv-location"
                  className="w-full h-11 px-3 py-2 border rounded-lg text-sm"
                  value={inventoryForm.location}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, location: e.target.value })}
                >
                  {INVENTORY_LOCATIONS.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="inv-qty" className="mb-1.5 block">Quantity</Label>
                <Input
                  id="inv-qty"
                  type="number"
                  min={1}
                  max={9999}
                  value={inventoryForm.quantity}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, quantity: parseInt(e.target.value) || 1 })}
                  className="h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inv-category" className="mb-1.5 block">Category</Label>
                <select
                  id="inv-category"
                  className="w-full h-11 px-3 py-2 border rounded-lg text-sm"
                  value={inventoryForm.category}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, category: e.target.value })}
                >
                  <option value="">None</option>
                  {inventoryCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="inv-condition" className="mb-1.5 block">Condition</Label>
                <select
                  id="inv-condition"
                  className="w-full h-11 px-3 py-2 border rounded-lg text-sm"
                  value={inventoryForm.condition}
                  onChange={(e) => setInventoryForm({ ...inventoryForm, condition: e.target.value })}
                >
                  {INVENTORY_CONDITIONS.map((cond) => (
                    <option key={cond} value={cond}>{cond}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label htmlFor="inv-photo" className="mb-1.5 block">Photo (optional)</Label>
              <input
                id="inv-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 file:cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    setInventoryPhotoFile(file)
                    setInventoryPhotoPreview(URL.createObjectURL(file))
                  }
                }}
              />
              {inventoryPhotoPreview && (
                <div className="mt-3 relative inline-block">
                  <img src={inventoryPhotoPreview} alt="Preview" className="max-h-36 rounded border" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-white rounded-full p-1 shadow text-gray-500 hover:text-red-600"
                    onClick={() => {
                      setInventoryPhotoFile(null)
                      setInventoryPhotoPreview(null)
                      setInventoryPhotoRemoved(true)
                      const input = document.getElementById('inv-photo') as HTMLInputElement
                      if (input) input.value = ''
                    }}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowInventoryDialog(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSaveInventory} disabled={isSavingInventory || !inventoryForm.name.trim()} className="w-full sm:w-auto">
              {isSavingInventory ? 'Saving...' : editingInventory ? 'Update' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inventory Delete Confirmation */}
      <Dialog open={!!inventoryToDelete} onOpenChange={(open) => { if (!open) setInventoryToDelete(null) }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{inventoryToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setInventoryToDelete(null)} className="w-full sm:w-auto">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteInventory} className="w-full sm:w-auto">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Inventory Categories Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>Add or remove inventory categories</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="flex gap-2">
              <Input
                placeholder="New category name..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
                className="h-10"
              />
              <Button onClick={handleAddCategory} disabled={isSavingCategory || !newCategoryName.trim()} size="sm" className="h-10 px-4 shrink-0">
                {isSavingCategory ? '...' : 'Add'}
              </Button>
            </div>
            {inventoryCategories.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No categories yet</p>
            ) : (
              <div className="space-y-1">
                {inventoryCategories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between px-3 py-2 rounded-lg border bg-gray-50">
                    <span className="text-sm">{cat.name}</span>
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-gray-400 hover:text-red-600 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)} className="w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
