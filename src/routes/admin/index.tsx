// Quest Laguna Directory - Admin Dashboard (Protected)

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
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
import type { Member, CellGroupWithRelations, MinistryWithRelations, Satellite, EventWithStats } from '../../lib/types'
import { getEvents } from '../../server/functions/events'
import { ADMIN_PIN } from '../../lib/constants'

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
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSatellite, setSelectedSatellite] = useState('')
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { tab: searchTab } = Route.useSearch()
  const [activeTab, setActiveTab] = useState(searchTab || 'overview')

  // Satellite detail view
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string | null>(null)

  // Admin setup
  const [isSettingUpAdmin, setIsSettingUpAdmin] = useState(false)
  const [adminSetupResult, setAdminSetupResult] = useState<string | null>(null)

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

  // Satellite CRUD
  const [showSatDialog, setShowSatDialog] = useState(false)
  const [satToDelete, setSatToDelete] = useState<Satellite | null>(null)
  const [isSavingSat, setIsSavingSat] = useState(false)
  const [satForm, setSatForm] = useState({ name: '' })

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/admin')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  // Fetch all dashboard data
  // Debounced to avoid AbortError from React strict mode double-mounting.
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
            members:member_cell_groups(id)
          `).eq('is_active', true).order('name'),
          supabase.from('ministries').select(`
            *,
            head:members(id, name, photo_url, city, discipleship_stage)
          `).eq('is_active', true).order('name'),
        ])

        if (cancelled) return

        if (satsRes.data) setSatellites(satsRes.data as Satellite[])
        if (memsRes.data) setMembers(memsRes.data as Member[])
        if (groupsRes.data) {
          const groupsWithCount = groupsRes.data.map(g => ({
            ...g,
            member_count: (g as any).members?.length || 0,
          }))
          setCellGroups(groupsWithCount as CellGroupWithRelations[])
        }
        if (minsRes.data) setMinistries(minsRes.data as MinistryWithRelations[])

        // Fetch events (server function, separate from supabase queries)
        try {
          const eventsData = await getEvents({ data: { activeOnly: false } })
          if (!cancelled) setEvents(eventsData)
        } catch (evtErr) {
          if (!cancelled) console.error('[Dashboard] events fetch error:', evtErr)
        }
      } catch (err) {
        if (cancelled) return
        console.error('[Dashboard] fetchData error:', err)
      }

      if (!cancelled) {
        setIsLoading(false)
        hasFetchedRef.current = true
      }
    }

    // Debounce: delay fetch so strict mode's first mount cleanup runs before requests fire
    const timer = setTimeout(() => {
      if (!cancelled) doFetch(!hasFetchedRef.current)
    }, 100)

    // Silently refresh on window focus
    const onFocus = () => {
      if (!cancelled) doFetch(false)
    }
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener('focus', onFocus)
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
      alert(error instanceof Error ? error.message : 'Failed to generate cell groups')
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
          members:member_cell_groups(id)
        `).eq('is_active', true).order('name'),
        supabase.from('ministries').select(`
          *,
          head:members(id, name, photo_url, city, discipleship_stage)
        `).eq('is_active', true).order('name'),
      ])

      if (satsRes.data) setSatellites(satsRes.data as Satellite[])
      if (memsRes.data) setMembers(memsRes.data as Member[])
      if (groupsRes.data) {
        const groupsWithCount = groupsRes.data.map(g => ({
          ...g,
          member_count: (g as any).members?.length || 0,
        }))
        setCellGroups(groupsWithCount as CellGroupWithRelations[])
      }
      if (minsRes.data) setMinistries(minsRes.data as MinistryWithRelations[])

      try {
        const eventsData = await getEvents({ data: { activeOnly: false } })
        setEvents(eventsData)
      } catch (evtErr) {
        console.error('[Dashboard] events fetch error:', evtErr)
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
      alert(error instanceof Error ? error.message : 'Failed to save cell group')
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
      alert(error instanceof Error ? error.message : 'Failed to delete cell group')
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
    } else {
      setEditingMin(null)
      setMinForm({
        name: '',
        description: '',
        department: '',
        head_id: '',
        is_active: true,
      })
    }
    setShowMinDialog(true)
  }

  const handleSaveMin = async () => {
    if (!minForm.name.trim()) return
    setIsSavingMin(true)
    try {
      const payload = {
        name: minForm.name.trim(),
        description: minForm.description.trim() || null,
        department: minForm.department.trim() || null,
        head_id: minForm.head_id || null,
        is_active: minForm.is_active,
      }
      if (editingMin) {
        await updateMinistry({ data: { id: editingMin.id, updates: payload } })
      } else {
        await createMinistry({ data: payload })
      }
      setShowMinDialog(false)
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

  const filteredCellGroups = cellGroups.filter((group) => {
    const matchesSearch = !searchQuery ||
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSatellite = !selectedSatellite || group.satellite_id === selectedSatellite
    return matchesSearch && matchesSatellite
  })

  const filteredMinistries = ministries.filter((ministry) => {
    const matchesSearch = !searchQuery ||
      ministry.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ministry.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  // Stats
  const totalMembers = members.length
  const totalCellGroups = cellGroups.length
  const totalMinistries = ministries.length
  const newbies = members.filter((m) => m.discipleship_stage === 'Newbie').length
  const growing = members.filter((m) => m.discipleship_stage === 'Growing').length
  const leaders = members.filter((m) => m.discipleship_stage === 'Leader').length

  // Discipleship journey breakdown
  const journeyCounts = {
    'Consolidations': members.filter(m => m.discipleship_journey === 'Consolidations').length,
    'Pre Encounter': members.filter(m => m.discipleship_journey === 'Pre Encounter').length,
    'Encounter': members.filter(m => m.discipleship_journey === 'Encounter').length,
    'Post-Encounter': members.filter(m => m.discipleship_journey === 'Post-Encounter').length,
    'SOD1': members.filter(m => m.discipleship_journey === 'SOD1').length,
    'SOD2': members.filter(m => m.discipleship_journey === 'SOD2').length,
    'SOD3': members.filter(m => m.discipleship_journey === 'SOD3').length,
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-white/80 text-sm mt-1">
                Quest Laguna Directory Management
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/70">
                {profile?.role?.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => signOut()}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
            <div className="w-4 h-4 border-2 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
            Loading dashboard data...
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="satellites">Satellites</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="cell-groups">Cell Groups</TabsTrigger>
            <TabsTrigger value="ministries">Ministries</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="space-y-6">
              {/* Stats Overview */}
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-[#8B1538]">{totalMembers}</p>
                    <p className="text-xs text-gray-500">Members</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-teal-600">{totalCellGroups}</p>
                    <p className="text-xs text-gray-500">Cell Groups</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{totalMinistries}</p>
                    <p className="text-xs text-gray-500">Ministries</p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-purple-600">{newbies}</p>
                    <p className="text-xs text-purple-500">Newbie</p>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{growing}</p>
                    <p className="text-xs text-yellow-600">Growing</p>
                  </CardContent>
                </Card>
                <Card className="bg-orange-50 border-orange-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-orange-600">{leaders}</p>
                    <p className="text-xs text-orange-500">Leader</p>
                  </CardContent>
                </Card>
              </div>

              {/* Discipleship Journey Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Discipleship Journey</CardTitle>
                  <CardDescription>Detailed breakdown by journey stage</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Newbie Journey */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="font-semibold text-sm">Newbie ({newbies})</span>
                      </div>
                      <div className="space-y-2">
                        {([
                          { label: 'Consolidations', count: journeyCounts['Consolidations'] },
                          { label: 'Pre Encounter', count: journeyCounts['Pre Encounter'] },
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
                        {newbies - journeyCounts['Consolidations'] - journeyCounts['Pre Encounter'] > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400 italic">Not assigned</span>
                            <span className="text-sm text-gray-400 w-8 text-right">{newbies - journeyCounts['Consolidations'] - journeyCounts['Pre Encounter']}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Growing Journey */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span className="font-semibold text-sm">Growing ({growing})</span>
                      </div>
                      <div className="space-y-2">
                        {([
                          { label: 'Encounter', count: journeyCounts['Encounter'] },
                          { label: 'Post-Encounter', count: journeyCounts['Post-Encounter'] },
                          { label: 'SOD 1', count: journeyCounts['SOD1'] },
                          { label: 'SOD 2', count: journeyCounts['SOD2'] },
                        ] as const).map((item) => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${growing > 0 ? (item.count / growing) * 100 : 0}%` }} />
                              </div>
                              <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                            </div>
                          </div>
                        ))}
                        {growing - journeyCounts['Encounter'] - journeyCounts['Post-Encounter'] - journeyCounts['SOD1'] - journeyCounts['SOD2'] > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400 italic">Not assigned</span>
                            <span className="text-sm text-gray-400 w-8 text-right">{growing - journeyCounts['Encounter'] - journeyCounts['Post-Encounter'] - journeyCounts['SOD1'] - journeyCounts['SOD2']}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Leader Journey */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="w-3 h-3 rounded-full bg-orange-500" />
                        <span className="font-semibold text-sm">Leader ({leaders})</span>
                      </div>
                      <div className="space-y-2">
                        {([
                          { label: 'SOD 3', count: journeyCounts['SOD3'] },
                          { label: 'QBS Theology 101', count: journeyCounts['QBS Theology 101'] },
                          { label: 'QBS Preaching 101', count: journeyCounts['QBS Preaching 101'] },
                        ] as const).map((item) => (
                          <div key={item.label} className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${leaders > 0 ? (item.count / leaders) * 100 : 0}%` }} />
                              </div>
                              <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                            </div>
                          </div>
                        ))}
                        {leaders - journeyCounts['SOD3'] - journeyCounts['QBS Theology 101'] - journeyCounts['QBS Preaching 101'] > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-400 italic">Not assigned</span>
                            <span className="text-sm text-gray-400 w-8 text-right">{leaders - journeyCounts['SOD3'] - journeyCounts['QBS Theology 101'] - journeyCounts['QBS Preaching 101']}</span>
                          </div>
                        )}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                              { name: 'Newbies', value: newbies, color: '#9333EA' },
                              { name: 'Growing', value: growing, color: '#EAB308' },
                              { name: 'Leaders', value: leaders, color: '#EA580C' },
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
                              { name: 'Newbies', value: newbies, color: '#9333EA' },
                              { name: 'Growing', value: growing, color: '#EAB308' },
                              { name: 'Leaders', value: leaders, color: '#EA580C' },
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

                {/* Cell Group Meeting Days */}
                <Card>
                  <CardHeader>
                    <CardTitle>Cell Group Schedules</CardTitle>
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
                      {members.slice(0, 6).map((member) => (
                        <MemberCard key={member.id} member={member} compact />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Satellites Tab */}
          <TabsContent value="satellites">
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
                          <p className="text-xs text-gray-500">Cell Groups</p>
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
                          <p className="text-xs text-purple-500">Newbie</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-yellow-50 border-yellow-200">
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-yellow-600">{satGrowing}</p>
                          <p className="text-xs text-yellow-600">Growing</p>
                        </CardContent>
                      </Card>
                      <Card className="bg-orange-50 border-orange-200">
                        <CardContent className="p-3 text-center">
                          <p className="text-2xl font-bold text-orange-600">{satLeaders}</p>
                          <p className="text-xs text-orange-500">Leader</p>
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
                                { stage: 'Newbie', count: satNewbies, color: 'bg-amber-500', text: 'text-amber-700' },
                                { stage: 'Growing', count: satGrowing, color: 'bg-teal-500', text: 'text-teal-700' },
                                { stage: 'Leader', count: satLeaders, color: 'bg-slate-500', text: 'text-slate-700' },
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
                          <CardTitle className="text-lg">Cell Groups</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {satCellGroups.length === 0 ? (
                            <div className="h-[200px] flex items-center justify-center text-gray-400">No cell groups</div>
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
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Newbie Journey */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="w-3 h-3 rounded-full bg-purple-500" />
                                <span className="font-semibold text-sm">Newbie ({satNewbies})</span>
                              </div>
                              <div className="space-y-2">
                                {([
                                  { label: 'Consolidations', count: satJourneyCounts['Consolidations'] },
                                  { label: 'Pre Encounter', count: satJourneyCounts['Pre Encounter'] },
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
                            </div>
                            {/* Growing Journey */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                                <span className="font-semibold text-sm">Growing ({satGrowing})</span>
                              </div>
                              <div className="space-y-2">
                                {([
                                  { label: 'Encounter', count: satJourneyCounts['Encounter'] },
                                  { label: 'Post-Encounter', count: satJourneyCounts['Post-Encounter'] },
                                  { label: 'SOD 1', count: satJourneyCounts['SOD1'] },
                                  { label: 'SOD 2', count: satJourneyCounts['SOD2'] },
                                ] as const).map((item) => (
                                  <div key={item.label} className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600">{item.label}</span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${satGrowing > 0 ? (item.count / satGrowing) * 100 : 0}%` }} />
                                      </div>
                                      <span className="text-sm font-medium w-6 text-right">{item.count}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Leader Journey */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="w-3 h-3 rounded-full bg-orange-500" />
                                <span className="font-semibold text-sm">Leader ({satLeaders})</span>
                              </div>
                              <div className="space-y-2">
                                {([
                                  { label: 'SOD 3', count: satJourneyCounts['SOD3'] },
                                  { label: 'QBS Theology', count: satJourneyCounts['QBS Theology 101'] },
                                  { label: 'QBS Preaching', count: satJourneyCounts['QBS Preaching 101'] },
                                ] as const).map((item) => (
                                  <div key={item.label} className="flex items-center justify-between">
                                    <span className="text-sm text-gray-600">{item.label}</span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-400 rounded-full" style={{ width: `${satLeaders > 0 ? (item.count / satLeaders) * 100 : 0}%` }} />
                                      </div>
                                      <span className="text-sm font-medium w-6 text-right">{item.count}</span>
                                    </div>
                                  </div>
                                ))}
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
                      <p className="text-xs text-gray-500">Cell Groups</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-purple-600">{members.filter(m => m.discipleship_stage === 'Newbie').length}</p>
                      <p className="text-xs text-gray-500">Newbie</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-600">{members.filter(m => m.discipleship_stage === 'Growing').length}</p>
                      <p className="text-xs text-gray-500">Growing</p>
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
                            <TableHead className="text-center">Cell Groups</TableHead>
                            <TableHead className="text-center">Newbie</TableHead>
                            <TableHead className="text-center">Growing</TableHead>
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
                                <TableCell className="text-center text-blue-600">{sm.filter(m => m.leadership_level === 'Disciple Maker' || m.leadership_level === 'Eagle').length}</TableCell>
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
                            <TableCell className="text-center text-blue-600">{members.filter(m => m.leadership_level === 'Disciple Maker' || m.leadership_level === 'Eagle').length}</TableCell>
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
                        {satellites
                          .filter(s => s.is_active)
                          .map(sat => {
                            const count = members.filter(m => m.satellite_id === sat.id).length
                            const maxCount = Math.max(...satellites.filter(s => s.is_active).map(s => members.filter(m => m.satellite_id === s.id).length), 1)
                            return (
                              <div key={sat.id} className="cursor-pointer hover:bg-gray-50 rounded p-1 -m-1" onClick={() => setSelectedSatelliteId(sat.id)}>
                                <div className="flex justify-between text-sm mb-1">
                                  <span className="font-medium text-gray-700">{sat.name.replace('Quest ', '')}</span>
                                  <span className="font-semibold text-[#8B1538]">{count}</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-3">
                                  <div className="bg-[#8B1538] h-3 rounded-full transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                                </div>
                              </div>
                            )
                          })
                          .sort((a, b) => 0)}
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
                                  {n > 0 && <div className="bg-purple-400" style={{ width: `${(n / total) * 100}%` }} title={`${n} Newbie`} />}
                                  {g > 0 && <div className="bg-yellow-400" style={{ width: `${(g / total) * 100}%` }} title={`${g} Growing`} />}
                                  {l > 0 && <div className="bg-orange-400" style={{ width: `${(l / total) * 100}%` }} title={`${l} Leader`} />}
                                </div>
                              </div>
                            )
                          })}
                        <div className="flex gap-4 mt-2 text-xs text-gray-500 justify-center">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Newbie</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400" /> Growing</span>
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
                              <span className={`w-2.5 h-2.5 rounded-full ${sat.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                              <button
                                onClick={(e) => { e.stopPropagation(); setSatToDelete(sat) }}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                                title="Delete satellite"
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
                                <div className="bg-amber-500" style={{ width: `${(satNewbieCount / satMemberCount) * 100}%` }} title={`${satNewbieCount} Newbies`} />
                              )}
                              {satGrowingCount > 0 && (
                                <div className="bg-teal-500" style={{ width: `${(satGrowingCount / satMemberCount) * 100}%` }} title={`${satGrowingCount} Growing`} />
                              )}
                              {satLeaderCount > 0 && (
                                <div className="bg-slate-500" style={{ width: `${(satLeaderCount / satMemberCount) * 100}%` }} title={`${satLeaderCount} Leaders`} />
                              )}
                            </div>
                          )}
                          {satMemberCount > 0 && (
                            <div className="flex gap-3 mt-2 text-xs text-gray-500">
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />{satNewbieCount} Newbie</span>
                              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-500" />{satGrowingCount} Growing</span>
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
            />
          </TabsContent>

          {/* Cell Groups Tab */}
          <TabsContent value="cell-groups">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Cell Groups</CardTitle>
                    <CardDescription>{filteredCellGroups.length} groups found</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => openCGDialog()}>Add Cell Group</Button>
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
                    <p>No cell groups found</p>
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
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>Ministries</CardTitle>
                    <CardDescription>{filteredMinistries.length} ministries found</CardDescription>
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
                      {events.filter(e => new Date(e.event_date) >= new Date()).length}
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
                        const isPast = new Date(event.event_date) < new Date()
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
                                    <span className="text-gray-500"> / {event.expected_attendees} registered</span>
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

          {/* Settings Tab */}
          <TabsContent value="settings">
              <div className="space-y-6">
                {/* Admin Account Setup */}
                <Card className="border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-blue-700">Admin Account</CardTitle>
                    <CardDescription>Create or update the admin login account (admin@questlaguna.org)</CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center gap-4">
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

                {/* Generate Cell Groups */}
                <Card className="border-teal-200">
                  <CardHeader>
                    <CardTitle className="text-teal-700">Generate Cell Groups</CardTitle>
                    <CardDescription>Auto-create cell groups from discipler-disciple relationships. Each discipler becomes a cell group leader, their disciples become members.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={handleGenerateCellGroups} disabled={isGeneratingCellGroups} className="bg-teal-600 hover:bg-teal-700">
                      {isGeneratingCellGroups ? 'Generating...' : 'Generate Cell Groups'}
                    </Button>
                    {cellGroupGenResult && (
                      <div className="mt-3 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm">
                        <p className="font-medium text-teal-800">Cell groups generated!</p>
                        <ul className="mt-1 text-teal-700 space-y-0.5">
                          <li>{cellGroupGenResult.cellGroupsCreated} cell groups created</li>
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
                  <li>{purgeResult.cell_groups} cell groups deleted</li>
                  <li>{purgeResult.ministries} ministries deleted</li>
                  <li>{purgeResult.member_cell_groups} cell memberships deleted</li>
                  <li>{purgeResult.member_ministries} ministry memberships deleted</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">
                  This will permanently delete all members, cell groups, ministries, and their relationships.
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

      {/* Cell Group Create/Edit Dialog */}
      <Dialog open={showCGDialog} onOpenChange={setShowCGDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCG ? 'Edit Cell Group' : 'Add Cell Group'}</DialogTitle>
            <DialogDescription>
              {editingCG ? 'Update the cell group details below.' : 'Fill in the details to create a new cell group.'}
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

      {/* Cell Group Delete Confirmation Dialog */}
      <Dialog open={!!cgToDelete} onOpenChange={(open) => { if (!open) setCGToDelete(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete Cell Group</DialogTitle>
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
    </div>
  )
}
