import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { ADMIN_PIN, LOGO_PATH, EVENT_NAME } from '../../lib/constants'
import { getDashboardStats, getAgeDistribution, getRegistrationTimeline } from '../../server/functions/analytics'
import { getAttendees, purgeAllAttendees, seedTestData } from '../../server/functions/attendees'
import { getSatellites, addSatellite, toggleSatellite, deleteSatellite } from '../../server/functions/satellites'
import { getFunFacts, addFunFact, toggleFunFact, deleteFunFact } from '../../server/functions/funFacts'
import { getAIInsights, generateOverallInsights } from '../../server/functions/ai'
import { seedAllData, purgeAllData, seedTestAccounts } from '../../server/functions/seedData'
import type { Attendee, DashboardStats, AgeDistribution, RegistrationTimeline, SatelliteRecord, FunFactRecord, OverallInsights } from '../../lib/types'

// AI Insights type (from database aggregation - no API cost)
interface AIInsights {
  totalAnalyzed: number
  averageScore: number
  sentimentBreakdown: { struggling: number; stable: number; thriving: number }
  needsSupportCount: number
  scoreByStage: { Newbie: number; Growing: number; Leader: number }
}

// shadcn/ui components
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'

// Recharts
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
  LineChart,
  Line,
  Legend,
} from 'recharts'

export const Route = createFileRoute('/event/old-index-backup')({
  component: AdminPage,
})

// NEXTLEVEL Stronger 2026 theme colors for charts
const CHART_COLORS = ['#8B1538', '#DC2626', '#F59E0B', '#B91C3C', '#6B0F2B']

function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  // Check session storage for existing auth
  useEffect(() => {
    const storedAuth = sessionStorage.getItem('admin_authenticated')
    if (storedAuth === 'true') {
      setIsAuthenticated(true)
    }
  }, [])

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true)
      sessionStorage.setItem('admin_authenticated', 'true')
      setPinError('')
    } else {
      setPinError('Invalid PIN. Please try again.')
    }
  }

  if (!isAuthenticated) {
    return <PinScreen pin={pin} setPin={setPin} error={pinError} onSubmit={handlePinSubmit} />
  }

  return <Dashboard />
}

// PIN Entry Screen
function PinScreen({
  pin,
  setPin,
  error,
  onSubmit,
}: {
  pin: string
  setPin: (pin: string) => void
  error: string
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-red-900/30">
        <CardHeader className="text-center">
          <img
            src={LOGO_PATH}
            alt={EVENT_NAME}
            className="w-20 h-20 mx-auto mb-4 rounded-full object-cover"
          />
          <CardTitle className="text-2xl">Admin Dashboard</CardTitle>
          <CardDescription>Enter your PIN to access the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="text-center text-2xl tracking-widest"
              maxLength={10}
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <Button type="submit" className="w-full bg-[#8B1538] hover:bg-[#6B0F2B]">
              Access Dashboard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// Main Dashboard
function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [ageData, setAgeData] = useState<AgeDistribution[]>([])
  const [timelineData, setTimelineData] = useState<RegistrationTimeline[]>([])
  const [satellites, setSatellites] = useState<SatelliteRecord[]>([])
  const [funFacts, setFunFacts] = useState<FunFactRecord[]>([])
  const [aiInsights, setAIInsights] = useState<AIInsights | null>(null)
  const [overallInsights, setOverallInsights] = useState<OverallInsights | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [showPurgeDialog, setShowPurgeDialog] = useState(false)
  const [showSeedDialog, setShowSeedDialog] = useState(false)
  const [showAddSatelliteDialog, setShowAddSatelliteDialog] = useState(false)
  const [showAddFunFactDialog, setShowAddFunFactDialog] = useState(false)
  const [showDirectorySeedDialog, setShowDirectorySeedDialog] = useState(false)
  const [showDirectoryPurgeDialog, setShowDirectoryPurgeDialog] = useState(false)
  const [purgePin, setPurgePin] = useState('')
  const [directoryPurgeConfirm, setDirectoryPurgeConfirm] = useState('')
  const [seedCount, setSeedCount] = useState('30')
  const [newSatelliteName, setNewSatelliteName] = useState('')
  const [newFunFactContent, setNewFunFactContent] = useState('')
  const [isPurging, setIsPurging] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSeedingDirectory, setIsSeedingDirectory] = useState(false)
  const [isPurgingDirectory, setIsPurgingDirectory] = useState(false)
  const [isCreatingAccounts, setIsCreatingAccounts] = useState(false)
  const [showAccountsDialog, setShowAccountsDialog] = useState(false)
  const [seedResult, setSeedResult] = useState<{ satellites: number; members: number; cellGroups: number; ministries: number; memberships: number } | null>(null)
  const [purgeResult, setPurgeResult] = useState<{ member_ministries: number; member_cell_groups: number; ministries: number; cell_groups: number; members: number } | null>(null)
  const [accountsResult, setAccountsResult] = useState<{ email: string; status: string }[] | null>(null)
  const [isAddingSatellite, setIsAddingSatellite] = useState(false)
  const [isAddingFunFact, setIsAddingFunFact] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  // Attendee filters
  const [filterSatellite, setFilterSatellite] = useState<string>('')
  const [filterStage, setFilterStage] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState('')

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [statsData, attendeesData, ageDistData, timelineDistData, satellitesData, funFactsData, aiInsightsData] = await Promise.all([
        getDashboardStats(),
        getAttendees({ data: {} }),
        getAgeDistribution(),
        getRegistrationTimeline(),
        getSatellites({ data: true }), // Include inactive
        getFunFacts({ data: true }), // Include inactive
        getAIInsights(),
      ])
      setStats(statsData)
      setAttendees(attendeesData)
      setAgeData(ageDistData)
      setTimelineData(timelineDistData)
      setSatellites(satellitesData)
      setFunFacts(funFactsData)
      setAIInsights(aiInsightsData)
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handlePurge = async () => {
    setIsPurging(true)
    try {
      await purgeAllAttendees({ data: purgePin })
      setShowPurgeDialog(false)
      setPurgePin('')
      fetchData()
    } catch (error) {
      console.error('Purge failed:', error)
      alert('Purge failed. Check PIN and try again.')
    } finally {
      setIsPurging(false)
    }
  }

  const handleSeed = async () => {
    setIsSeeding(true)
    try {
      const count = parseInt(seedCount, 10) || 30
      await seedTestData({ data: { pin: ADMIN_PIN, count } })
      setShowSeedDialog(false)
      setSeedCount('30')
      fetchData()
    } catch (error) {
      console.error('Seed failed:', error)
      alert('Failed to seed test data.')
    } finally {
      setIsSeeding(false)
    }
  }

  const handleSeedDirectory = async () => {
    setIsSeedingDirectory(true)
    setSeedResult(null)
    try {
      const result = await seedAllData({ data: { adminPin: ADMIN_PIN } })
      setSeedResult(result.results)
    } catch (error) {
      console.error('Directory seed failed:', error)
      alert('Failed to seed directory data.')
    } finally {
      setIsSeedingDirectory(false)
    }
  }

  const handlePurgeDirectory = async () => {
    if (directoryPurgeConfirm !== 'DELETE ALL DATA') {
      alert('Please type "DELETE ALL DATA" to confirm.')
      return
    }
    setIsPurgingDirectory(true)
    setPurgeResult(null)
    try {
      const result = await purgeAllData({ data: { adminPin: ADMIN_PIN, confirmText: directoryPurgeConfirm } })
      setPurgeResult(result.results)
      setDirectoryPurgeConfirm('')
    } catch (error) {
      console.error('Directory purge failed:', error)
      alert('Failed to purge directory data.')
    } finally {
      setIsPurgingDirectory(false)
    }
  }

  const handleCreateTestAccounts = async () => {
    setIsCreatingAccounts(true)
    setAccountsResult(null)
    try {
      const result = await seedTestAccounts({ data: { adminPin: ADMIN_PIN } })
      setAccountsResult(result.accounts)
    } catch (error) {
      console.error('Create accounts failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to create test accounts.')
    } finally {
      setIsCreatingAccounts(false)
    }
  }

  const handleAddSatellite = async () => {
    if (!newSatelliteName.trim()) return
    setIsAddingSatellite(true)
    try {
      await addSatellite({ data: { name: newSatelliteName.trim(), pin: ADMIN_PIN } })
      setShowAddSatelliteDialog(false)
      setNewSatelliteName('')
      fetchData()
    } catch (error: unknown) {
      console.error('Add satellite failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to add satellite.')
    } finally {
      setIsAddingSatellite(false)
    }
  }

  const handleToggleSatellite = async (sat: SatelliteRecord) => {
    try {
      await toggleSatellite({ data: { id: sat.id, is_active: !sat.is_active, pin: ADMIN_PIN } })
      fetchData()
    } catch (error) {
      console.error('Toggle satellite failed:', error)
      alert('Failed to toggle satellite status.')
    }
  }

  const handleDeleteSatellite = async (sat: SatelliteRecord) => {
    if (!confirm(`Are you sure you want to delete "${sat.name}"?`)) return
    try {
      await deleteSatellite({ data: { id: sat.id, pin: ADMIN_PIN } })
      fetchData()
    } catch (error: unknown) {
      console.error('Delete satellite failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete satellite.')
    }
  }

  const handleAddFunFact = async () => {
    if (!newFunFactContent.trim()) return
    setIsAddingFunFact(true)
    try {
      await addFunFact({ data: { content: newFunFactContent.trim(), pin: ADMIN_PIN } })
      setShowAddFunFactDialog(false)
      setNewFunFactContent('')
      fetchData()
    } catch (error: unknown) {
      console.error('Add fun fact failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to add fun fact.')
    } finally {
      setIsAddingFunFact(false)
    }
  }

  const handleToggleFunFact = async (fact: FunFactRecord) => {
    try {
      await toggleFunFact({ data: { id: fact.id, is_active: !fact.is_active, pin: ADMIN_PIN } })
      fetchData()
    } catch (error) {
      console.error('Toggle fun fact failed:', error)
      alert('Failed to toggle fun fact status.')
    }
  }

  const handleDeleteFunFact = async (fact: FunFactRecord) => {
    if (!confirm('Are you sure you want to delete this fun fact?')) return
    try {
      await deleteFunFact({ data: { id: fact.id, pin: ADMIN_PIN } })
      fetchData()
    } catch (error: unknown) {
      console.error('Delete fun fact failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete fun fact.')
    }
  }

  const handleGenerateOverallInsights = async () => {
    if (attendees.length === 0) {
      alert('No attendees to analyze. Register some attendees first.')
      return
    }
    setIsGeneratingInsights(true)
    try {
      const result = await generateOverallInsights({ data: { pin: ADMIN_PIN } })
      setOverallInsights(result)
    } catch (error: unknown) {
      console.error('Generate insights failed:', error)
      alert(error instanceof Error ? error.message : 'Failed to generate insights.')
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  const exportCSV = () => {
    if (!attendees.length) return

    const headers = ['Name', 'Age', 'City', 'Satellite', 'Stage', 'Spiritual Description', 'Registered At']
    const rows = attendees.map((a) => [
      a.name,
      a.age.toString(),
      a.city,
      a.satellite,
      a.discipleship_stage,
      `"${a.spiritual_description.replace(/"/g, '""')}"`,
      new Date(a.registered_at).toLocaleString(),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendees-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Prepare chart data
  const satelliteData = stats
    ? Object.entries(stats.bySatellite).map(([name, value]) => ({ name: name.replace('Quest ', ''), value }))
    : []

  const stageData = stats
    ? Object.entries(stats.byStage).map(([name, value]) => ({ name, value }))
    : []

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-white/80 hover:text-white mr-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <img src={LOGO_PATH} alt={EVENT_NAME} className="w-10 h-10 rounded-full object-cover shadow" />
            <div>
              <h1 className="text-xl font-bold text-white">Event Dashboard</h1>
              <p className="text-red-200 text-xs">{EVENT_NAME}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={fetchData} className="bg-white/10 text-white border-white/30 hover:bg-white/20">
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={exportCSV} className="bg-white/10 text-white border-white/30 hover:bg-white/20">
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendees">Attendees</TabsTrigger>
            <TabsTrigger value="ai">AI Insights</TabsTrigger>
            <TabsTrigger value="satellites">Satellites</TabsTrigger>
            <TabsTrigger value="funfacts">Fun Facts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="bg-gradient-to-br from-[#8B1538] to-[#B91C3C] text-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-red-200">Total Registered</CardDescription>
                  <CardTitle className="text-4xl font-black">{stats?.total || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Average Age</CardDescription>
                  <CardTitle className="text-3xl">{stats?.averageAge || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Early Birds</CardDescription>
                  <CardTitle className="text-3xl text-amber-600">{stats?.earlyBirdCount || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Needs Support</CardDescription>
                  <CardTitle className="text-3xl text-orange-600">{stats?.needsSupportCount || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Newbies</CardDescription>
                  <CardTitle className="text-3xl text-blue-600">{stats?.byStage.Newbie || 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Leaders</CardDescription>
                  <CardTitle className="text-3xl text-purple-600">{stats?.byStage.Leader || 0}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Satellite Pie Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Registrations by Satellite</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={satelliteData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={40}
                        paddingAngle={2}
                        label={({ name, value, percent }) => `${name}: ${value} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {satelliteData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Stage Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Discipleship Stage Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={stageData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={80} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8B1538" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Age Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Age Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={ageData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="bucket" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#DC2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Registration Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Registration Timeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="count" stroke="#B91C3C" strokeWidth={3} dot={{ fill: '#B91C3C' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Attendees Tab */}
          <TabsContent value="attendees">
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>All Attendees ({attendees.length})</CardTitle>
                    <CardDescription>Click a row to view full details</CardDescription>
                  </div>
                </div>
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mt-4">
                  <Input
                    placeholder="Search by name..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="w-48"
                  />
                  <select
                    value={filterSatellite}
                    onChange={(e) => setFilterSatellite(e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value="">All Satellites</option>
                    {satellites.filter((s) => s.is_active).map((sat) => (
                      <option key={sat.id} value={sat.name}>{sat.name}</option>
                    ))}
                  </select>
                  <select
                    value={filterStage}
                    onChange={(e) => setFilterStage(e.target.value)}
                    className="px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value="">All Stages</option>
                    <option value="Newbie">Newbie</option>
                    <option value="Growing">Growing</option>
                    <option value="Leader">Leader</option>
                  </select>
                  {(filterSearch || filterSatellite || filterStage) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFilterSearch('')
                        setFilterSatellite('')
                        setFilterStage('')
                      }}
                      className="text-gray-500"
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {(() => {
                  const filteredAttendees = attendees.filter((a) => {
                    if (filterSearch && !a.name.toLowerCase().includes(filterSearch.toLowerCase())) return false
                    if (filterSatellite && a.satellite !== filterSatellite) return false
                    if (filterStage && a.discipleship_stage !== filterStage) return false
                    return true
                  })
                  return (
                    <>
                      {(filterSearch || filterSatellite || filterStage) && (
                        <p className="text-sm text-gray-500 mb-3">
                          Showing {filteredAttendees.length} of {attendees.length} attendees
                        </p>
                      )}
                      <div className="overflow-x-auto rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="font-semibold">Name</TableHead>
                              <TableHead className="font-semibold">Age</TableHead>
                              <TableHead className="font-semibold">City</TableHead>
                              <TableHead className="font-semibold">Satellite</TableHead>
                              <TableHead className="font-semibold">Stage</TableHead>
                              <TableHead className="font-semibold">Registered</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredAttendees.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                                  {attendees.length === 0 ? 'No attendees registered yet' : 'No matching attendees found'}
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredAttendees.map((attendee) => (
                                <TableRow
                                  key={attendee.id}
                                  className="cursor-pointer hover:bg-red-50 transition-colors"
                                  onClick={() => setSelectedAttendee(attendee)}
                                >
                                  <TableCell className="font-medium">{attendee.name}</TableCell>
                                  <TableCell>{attendee.age}</TableCell>
                                  <TableCell>{attendee.city}</TableCell>
                                  <TableCell>
                                    <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                                      {attendee.satellite.replace('Quest ', '')}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        attendee.discipleship_stage === 'Newbie'
                                          ? 'bg-blue-100 text-blue-800'
                                          : attendee.discipleship_stage === 'Growing'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-purple-100 text-purple-800'
                                      }`}
                                    >
                                      {attendee.discipleship_stage}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-gray-600">
                                    {new Date(attendee.registered_at).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="ai" className="space-y-6">
            {/* Generate Button */}
            <Card className="bg-gradient-to-br from-purple-600 to-purple-800 text-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">AI-Powered Insights for Leaders</CardTitle>
                    <CardDescription className="text-purple-200">
                      Generate actionable insights with mentorship suggestions for {attendees.length} attendees
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleGenerateOverallInsights}
                    disabled={isGeneratingInsights || attendees.length === 0}
                    className="bg-white text-purple-700 hover:bg-purple-100"
                    size="lg"
                  >
                    {isGeneratingInsights ? 'Generating...' : 'Generate Insights'}
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* Overall Insights Display */}
            {overallInsights ? (
              <div className="space-y-6">
                {/* Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-gradient-to-br from-blue-500 to-blue-700 text-white">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-blue-200">Total Attendees</CardDescription>
                      <CardTitle className="text-3xl font-black">{overallInsights.stats.totalAttendees}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Newbies</CardDescription>
                      <CardTitle className="text-3xl text-blue-600">{overallInsights.stats.newbies.length}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Leaders</CardDescription>
                      <CardTitle className="text-3xl text-purple-600">{overallInsights.stats.leaders.length}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Top Satellite</CardDescription>
                      <CardTitle className="text-lg text-green-600">
                        {overallInsights.stats.satelliteRanking[0]?.satellite.replace('Quest ', '')} ({overallInsights.stats.satelliteRanking[0]?.count})
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                {/* Summary Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">AI Summary</CardTitle>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        overallInsights.overallSentiment === 'thriving' ? 'bg-green-100 text-green-800' :
                        overallInsights.overallSentiment === 'stable' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {overallInsights.overallSentiment.charAt(0).toUpperCase() + overallInsights.overallSentiment.slice(1)}
                      </span>
                    </div>
                    <CardDescription>
                      Generated {new Date(overallInsights.generatedAt).toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700">{overallInsights.summary}</p>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Satellite Ranking */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Satellite Ranking</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {overallInsights.stats.satelliteRanking.map((sat, i) => (
                          <div key={sat.satellite} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                              i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-300'
                            }`}>
                              {i + 1}
                            </span>
                            <div className="flex-1">
                              <div className="flex justify-between">
                                <span className="font-medium">{sat.satellite}</span>
                                <span className="text-gray-600">{sat.count} attendees</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                                <div
                                  className="bg-[#8B1538] h-2 rounded-full"
                                  style={{ width: `${(sat.count / overallInsights.stats.totalAttendees) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Mentorship Suggestions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-purple-700">Mentorship Suggestions</CardTitle>
                      <CardDescription>AI-recommended mentor-newbie pairings</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {overallInsights.mentorshipSuggestions.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No suggestions available</p>
                      ) : (
                        <div className="space-y-3">
                          {overallInsights.mentorshipSuggestions.map((match, i) => (
                            <div key={i} className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-blue-600 font-medium">{match.newbie}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-purple-600 font-medium">{match.suggestedMentor}</span>
                              </div>
                              <p className="text-sm text-gray-600">{match.reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Newbies List */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-blue-700">All Newbies ({overallInsights.stats.newbies.length})</CardTitle>
                      <CardDescription>People who need mentoring</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {overallInsights.stats.newbies.map((n, i) => (
                          <div key={i} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                            <span className="font-medium">{n.name}</span>
                            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded">{n.satellite.replace('Quest ', '')}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Leaders List */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-purple-700">All Leaders ({overallInsights.stats.leaders.length})</CardTitle>
                      <CardDescription>Available mentors</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {overallInsights.stats.leaders.map((l, i) => (
                          <div key={i} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                            <span className="font-medium">{l.name}</span>
                            <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded">{l.satellite.replace('Quest ', '')}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Action Items */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-green-700">Action Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {overallInsights.actionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-green-500 mt-0.5">•</span>
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Key Themes & Concerns */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Key Themes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {overallInsights.keyThemes.map((theme, i) => (
                          <span key={i} className="px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm">
                            {theme}
                          </span>
                        ))}
                      </div>
                      {overallInsights.concernAreas.length > 0 && (
                        <div className="pt-3 border-t">
                          <p className="text-sm font-medium text-orange-700 mb-2">Areas of Concern:</p>
                          <ul className="space-y-1">
                            {overallInsights.concernAreas.map((item, i) => (
                              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                                <span className="text-orange-500">!</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card className="border-dashed border-2">
                <CardContent className="py-12 text-center">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-lg mb-2">No insights generated yet</p>
                  <p className="text-gray-400 text-sm">Click "Generate Insights" to get actionable data for leaders and mentors</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Satellites Tab */}
          <TabsContent value="satellites">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage Satellites</CardTitle>
                  <CardDescription>Add, enable, or disable satellite locations</CardDescription>
                </div>
                <Button onClick={() => setShowAddSatelliteDialog(true)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                  Add Satellite
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {satellites.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">No satellites configured</p>
                  ) : (
                    satellites.map((sat) => (
                      <div
                        key={sat.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          sat.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-3 h-3 rounded-full ${sat.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <div>
                            <p className={`font-medium ${!sat.is_active && 'text-gray-400'}`}>{sat.name}</p>
                            <p className="text-xs text-gray-500">
                              {attendees.filter((a) => a.satellite === sat.name).length} registrations
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`active-${sat.id}`} className="text-sm text-gray-500">
                              {sat.is_active ? 'Active' : 'Inactive'}
                            </Label>
                            <Switch
                              id={`active-${sat.id}`}
                              checked={sat.is_active}
                              onCheckedChange={() => handleToggleSatellite(sat)}
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteSatellite(sat)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Fun Facts Tab */}
          <TabsContent value="funfacts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage Fun Facts</CardTitle>
                  <CardDescription>Add trivia that will cycle on the display screen</CardDescription>
                </div>
                <Button onClick={() => setShowAddFunFactDialog(true)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                  Add Fun Fact
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {funFacts.length === 0 ? (
                    <p className="text-center py-8 text-gray-500">No fun facts configured</p>
                  ) : (
                    funFacts.map((fact) => (
                      <div
                        key={fact.id}
                        className={`flex items-start justify-between p-4 rounded-lg border ${
                          fact.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-4 flex-1">
                          <div
                            className={`w-3 h-3 rounded-full mt-1.5 ${fact.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                          />
                          <div className="flex-1">
                            <p className={`${!fact.is_active && 'text-gray-400'}`}>{fact.content}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 ml-4">
                          <div className="flex items-center gap-2">
                            <Label htmlFor={`active-fact-${fact.id}`} className="text-sm text-gray-500">
                              {fact.is_active ? 'Active' : 'Inactive'}
                            </Label>
                            <Switch
                              id={`active-fact-${fact.id}`}
                              checked={fact.is_active}
                              onCheckedChange={() => handleToggleFunFact(fact)}
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteFunFact(fact)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="space-y-6">
              {/* Test Accounts Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Test Accounts</h3>
                <Card className="border-blue-200">
                  <CardHeader>
                    <CardTitle className="text-blue-700">Create Test Accounts</CardTitle>
                    <CardDescription>
                      Create login accounts for testing different user roles.
                      Requires SUPABASE_SERVICE_ROLE_KEY in your .env file.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 text-sm text-gray-600">
                      <p className="font-medium mb-2">This will create:</p>
                      <ul className="list-disc ml-5 space-y-1">
                        <li><code className="bg-gray-100 px-1">admin@quest.test</code> / <code className="bg-gray-100 px-1">admin123</code> (Super Admin)</li>
                        <li><code className="bg-gray-100 px-1">leader@quest.test</code> / <code className="bg-gray-100 px-1">leader123</code> (Satellite Leader)</li>
                        <li><code className="bg-gray-100 px-1">cell@quest.test</code> / <code className="bg-gray-100 px-1">cell123</code> (Cell Leader)</li>
                        <li><code className="bg-gray-100 px-1">member@quest.test</code> / <code className="bg-gray-100 px-1">member123</code> (Member)</li>
                      </ul>
                    </div>
                    <Button onClick={() => setShowAccountsDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                      Create Test Accounts
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Directory Data Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Directory Data Management</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Seed Directory Data</CardTitle>
                      <CardDescription>Generate members, cell groups, and ministries for testing</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => setShowDirectorySeedDialog(true)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                        Seed Directory
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-red-200">
                    <CardHeader>
                      <CardTitle className="text-red-600">Purge Directory</CardTitle>
                      <CardDescription>Delete all members, cell groups, and ministries</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="destructive" onClick={() => setShowDirectoryPurgeDialog(true)}>
                        Purge Directory Data
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Event Registration Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Event Registration Data</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Seed Event Data</CardTitle>
                      <CardDescription>Generate fake attendee records for testing</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => setShowSeedDialog(true)} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                        Generate Test Data
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-red-200">
                    <CardHeader>
                      <CardTitle className="text-red-600">Purge Event Data</CardTitle>
                      <CardDescription>Permanently delete all registration data</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button variant="destructive" onClick={() => setShowPurgeDialog(true)}>
                        Purge All Data
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Attendee Detail Dialog */}
      <Dialog open={!!selectedAttendee} onOpenChange={() => setSelectedAttendee(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedAttendee?.name}</DialogTitle>
            <DialogDescription>
              {selectedAttendee?.age} years old from {selectedAttendee?.city}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Satellite</p>
                <p className="font-medium">{selectedAttendee?.satellite}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Discipleship Stage</p>
                <p className="font-medium">{selectedAttendee?.discipleship_stage}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 mb-2">Spiritual Journey</p>
              <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg text-sm">
                {selectedAttendee?.spiritual_description}
              </p>
            </div>
            {selectedAttendee?.spiritual_score && (
              <div className="flex gap-4 pt-2 border-t">
                <div>
                  <p className="text-sm font-medium text-gray-500">AI Score</p>
                  <p className="text-2xl font-bold">{selectedAttendee.spiritual_score}/10</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Sentiment</p>
                  <p className="capitalize font-medium">{selectedAttendee.spiritual_sentiment}</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Seed Test Data Dialog */}
      <Dialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Test Data</DialogTitle>
            <DialogDescription>
              This will create fake attendee registrations for testing purposes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="seed-count">Number of records to generate</Label>
            <Input
              id="seed-count"
              type="number"
              min="1"
              max="100"
              value={seedCount}
              onChange={(e) => setSeedCount(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeedDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSeed} disabled={isSeeding} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
              {isSeeding ? 'Generating...' : `Generate ${seedCount} Records`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Satellite Dialog */}
      <Dialog open={showAddSatelliteDialog} onOpenChange={setShowAddSatelliteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Satellite</DialogTitle>
            <DialogDescription>
              Enter the name for the new satellite location.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="satellite-name">Satellite Name</Label>
            <Input
              id="satellite-name"
              placeholder="e.g., Quest San Pedro"
              value={newSatelliteName}
              onChange={(e) => setNewSatelliteName(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSatelliteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSatellite}
              disabled={isAddingSatellite || !newSatelliteName.trim()}
              className="bg-[#8B1538] hover:bg-[#6B0F2B]"
            >
              {isAddingSatellite ? 'Adding...' : 'Add Satellite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Fun Fact Dialog */}
      <Dialog open={showAddFunFactDialog} onOpenChange={setShowAddFunFactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Fun Fact</DialogTitle>
            <DialogDescription>
              Enter a trivia or fun fact to display on the screen.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="fun-fact-content">Fun Fact</Label>
            <Input
              id="fun-fact-content"
              placeholder="e.g., Quest Laguna started with just 15 people in 2016!"
              value={newFunFactContent}
              onChange={(e) => setNewFunFactContent(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddFunFactDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddFunFact}
              disabled={isAddingFunFact || !newFunFactContent.trim()}
              className="bg-[#8B1538] hover:bg-[#6B0F2B]"
            >
              {isAddingFunFact ? 'Adding...' : 'Add Fun Fact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Confirmation Dialog */}
      <Dialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Purge All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all attendee registrations. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="purge-pin">Enter admin PIN to confirm</Label>
            <Input
              id="purge-pin"
              type="password"
              placeholder="Enter admin PIN"
              value={purgePin}
              onChange={(e) => setPurgePin(e.target.value)}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurgeDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handlePurge} disabled={isPurging}>
              {isPurging ? 'Purging...' : 'Purge All Data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Directory Seed Dialog */}
      <Dialog open={showDirectorySeedDialog} onOpenChange={(open) => {
        setShowDirectorySeedDialog(open)
        if (!open) setSeedResult(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seed Directory Data</DialogTitle>
            <DialogDescription>
              This will create sample members, cell groups, and ministries for testing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {seedResult ? (
              <div className="space-y-2 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-medium text-green-800">Data seeded successfully!</p>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• {seedResult.satellites} satellites</li>
                  <li>• {seedResult.members} members</li>
                  <li>• {seedResult.cellGroups} cell groups</li>
                  <li>• {seedResult.ministries} ministries</li>
                  <li>• {seedResult.memberships} memberships</li>
                </ul>
              </div>
            ) : (
              <p className="text-gray-600">
                This will create:
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>15 satellite locations</li>
                  <li>60 sample members</li>
                  <li>25 cell groups</li>
                  <li>40 ministries</li>
                  <li>~95 member relationships</li>
                </ul>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDirectorySeedDialog(false)
              setSeedResult(null)
            }}>
              {seedResult ? 'Close' : 'Cancel'}
            </Button>
            {!seedResult && (
              <Button onClick={handleSeedDirectory} disabled={isSeedingDirectory} className="bg-[#8B1538] hover:bg-[#6B0F2B]">
                {isSeedingDirectory ? 'Seeding...' : 'Seed Directory'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Directory Purge Dialog */}
      <Dialog open={showDirectoryPurgeDialog} onOpenChange={(open) => {
        setShowDirectoryPurgeDialog(open)
        if (!open) {
          setDirectoryPurgeConfirm('')
          setPurgeResult(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Purge Directory Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all members, cell groups, and ministries. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {purgeResult ? (
              <div className="space-y-2 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="font-medium text-red-800">Data purged successfully!</p>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• {purgeResult.members} members deleted</li>
                  <li>• {purgeResult.cell_groups} cell groups deleted</li>
                  <li>• {purgeResult.ministries} ministries deleted</li>
                  <li>• {purgeResult.member_cell_groups} cell group memberships deleted</li>
                  <li>• {purgeResult.member_ministries} ministry memberships deleted</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-red-600 font-medium">
                  ⚠️ This will delete ALL directory data including members, cell groups, and ministries.
                </p>
                <div>
                  <Label htmlFor="directory-purge-confirm">Type "DELETE ALL DATA" to confirm</Label>
                  <Input
                    id="directory-purge-confirm"
                    placeholder="DELETE ALL DATA"
                    value={directoryPurgeConfirm}
                    onChange={(e) => setDirectoryPurgeConfirm(e.target.value)}
                    className="mt-2"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDirectoryPurgeDialog(false)
              setDirectoryPurgeConfirm('')
              setPurgeResult(null)
            }}>
              {purgeResult ? 'Close' : 'Cancel'}
            </Button>
            {!purgeResult && (
              <Button
                variant="destructive"
                onClick={handlePurgeDirectory}
                disabled={isPurgingDirectory || directoryPurgeConfirm !== 'DELETE ALL DATA'}
              >
                {isPurgingDirectory ? 'Purging...' : 'Purge Directory'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Accounts Dialog */}
      <Dialog open={showAccountsDialog} onOpenChange={(open) => {
        setShowAccountsDialog(open)
        if (!open) setAccountsResult(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-blue-700">Create Test Accounts</DialogTitle>
            <DialogDescription>
              This will create login accounts for testing different user roles.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {accountsResult ? (
              <div className="space-y-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-medium text-blue-800">Account creation results:</p>
                <ul className="text-sm space-y-1">
                  {accountsResult.map((acc, i) => (
                    <li key={i} className={acc.status === 'created' ? 'text-green-700' : acc.status === 'already exists' ? 'text-yellow-700' : 'text-red-700'}>
                      • {acc.email}: {acc.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">
                  The following test accounts will be created:
                </p>
                <ul className="text-sm space-y-2">
                  <li className="flex justify-between p-2 bg-gray-50 rounded">
                    <span><strong>admin@quest.test</strong> / admin123</span>
                    <span className="text-purple-600">Super Admin</span>
                  </li>
                  <li className="flex justify-between p-2 bg-gray-50 rounded">
                    <span><strong>leader@quest.test</strong> / leader123</span>
                    <span className="text-blue-600">Satellite Leader</span>
                  </li>
                  <li className="flex justify-between p-2 bg-gray-50 rounded">
                    <span><strong>cell@quest.test</strong> / cell123</span>
                    <span className="text-green-600">Cell Leader</span>
                  </li>
                  <li className="flex justify-between p-2 bg-gray-50 rounded">
                    <span><strong>member@quest.test</strong> / member123</span>
                    <span className="text-gray-600">Member</span>
                  </li>
                </ul>
                <p className="text-xs text-orange-600">
                  Note: Requires SUPABASE_SERVICE_ROLE_KEY in your .env file
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAccountsDialog(false)
              setAccountsResult(null)
            }}>
              {accountsResult ? 'Close' : 'Cancel'}
            </Button>
            {!accountsResult && (
              <Button
                onClick={handleCreateTestAccounts}
                disabled={isCreatingAccounts}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isCreatingAccounts ? 'Creating...' : 'Create Accounts'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
