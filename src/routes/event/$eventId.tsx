// Quest Laguna Directory - Event Detail Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { getEvent, updateEvent, deleteEvent, getEventRegistrations, getRegistrationStatus } from '../../server/functions/events'
import type { RegistrationStatus } from '../../server/functions/events'
import { purgeAllAttendees, seedTestData } from '../../server/functions/attendees'
import { getSatellites } from '../../server/functions/satellites'
import { generateOverallInsights } from '../../server/functions/ai'
import { ADMIN_PIN } from '../../lib/constants'
import type { Event, Attendee, SatelliteRow, OverallInsights } from '../../lib/types'
import { uploadEventBanner } from '../../lib/storage'
import { QRCodeSVG } from 'qrcode.react'

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
import { Textarea } from '../../components/ui/textarea'

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
  Legend,
} from 'recharts'

export const Route = createFileRoute('/event/$eventId')({
  component: EventDetailPage,
})

// Chart colors
const CHART_COLORS = ['#8B1538', '#DC2626', '#F59E0B', '#B91C3C', '#6B0F2B']

function EventDetailPage() {
  const navigate = useNavigate()
  const { eventId } = Route.useParams()
  const { isAuthenticated, isLoading: authLoading } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [attendees, setAttendees] = useState<Attendee[]>([])
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [overallInsights, setOverallInsights] = useState<OverallInsights | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Dialog states
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPurgeDialog, setShowPurgeDialog] = useState(false)
  const [showSeedDialog, setShowSeedDialog] = useState(false)
  const [selectedAttendee, setSelectedAttendee] = useState<Attendee | null>(null)

  // Form states
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    event_date: '',
    event_time: '',
    location: '',
    expected_attendees: 100,
    early_bird_cutoff: '09:00',
    registration_start: '',
    registration_end: '',
  })
  const [purgePin, setPurgePin] = useState('')
  const [seedCount, setSeedCount] = useState('30')

  // Loading states
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPurging, setIsPurging] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)

  // Banner upload (edit dialog)
  const [editBannerFile, setEditBannerFile] = useState<File | null>(null)
  const [editBannerPreview, setEditBannerPreview] = useState<string | null>(null)

  // QR Code / Link sharing
  const qrRef = useRef<HTMLDivElement>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const handleDownloadQR = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      ctx!.fillStyle = '#ffffff'
      ctx!.fillRect(0, 0, canvas.width, canvas.height)
      ctx!.drawImage(img, 0, 0, canvas.width, canvas.height)

      const a = document.createElement('a')
      a.download = `${event?.name || 'event'}-qr-code.png`
      a.href = canvas.toDataURL('image/png')
      a.click()
    }

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  // Filter states
  const [filterSatellite, setFilterSatellite] = useState<string>('')
  const [filterStage, setFilterStage] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState('')

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', `/event/${eventId}`)
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate, eventId])

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [eventData, attendeesData, satellitesData] = await Promise.all([
        getEvent({ data: { id: eventId } }),
        getEventRegistrations({ data: { eventId } }),
        getSatellites({ data: true }),
      ])

      if (!eventData) {
        setError('Event not found')
        return
      }

      setEvent(eventData)
      setAttendees(attendeesData)
      setSatellites(satellitesData)

      // Initialize edit form
      setEditForm({
        name: eventData.name,
        description: eventData.description || '',
        event_date: eventData.event_date,
        event_time: eventData.event_time || '',
        location: eventData.location || '',
        expected_attendees: eventData.expected_attendees,
        early_bird_cutoff: eventData.early_bird_cutoff || '09:00',
        registration_start: eventData.registration_start ? eventData.registration_start.slice(0, 16) : '',
        registration_end: eventData.registration_end ? eventData.registration_end.slice(0, 16) : '',
      })
    } catch (err) {
      console.error('Failed to fetch event data:', err)
      setError('Failed to load event')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchData()
    }
  }, [isAuthenticated, eventId])

  const handleUpdateEvent = async () => {
    if (!event) return
    setIsUpdating(true)
    try {
      // Upload banner if a new file was selected
      let bannerUrl: string | null | undefined
      if (editBannerFile) {
        const { url, error: uploadError } = await uploadEventBanner(event.id, editBannerFile)
        if (uploadError) {
          alert(`Banner upload failed: ${uploadError.message}`)
          setIsUpdating(false)
          return
        }
        bannerUrl = url
      }

      await updateEvent({
        data: {
          id: event.id,
          updates: {
            name: editForm.name,
            description: editForm.description || null,
            event_date: editForm.event_date,
            event_time: editForm.event_time || null,
            location: editForm.location || null,
            expected_attendees: editForm.expected_attendees,
            early_bird_cutoff: editForm.early_bird_cutoff || null,
            registration_start: editForm.registration_start || null,
            registration_end: editForm.registration_end || null,
            ...(bannerUrl !== undefined ? { banner_url: bannerUrl } : {}),
          },
        },
      })
      setShowEditDialog(false)
      setEditBannerFile(null)
      setEditBannerPreview(null)
      fetchData()
    } catch (err) {
      console.error('Failed to update event:', err)
      alert('Failed to update event')
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteEvent = async () => {
    if (!event) return
    setIsDeleting(true)
    try {
      await deleteEvent({ data: { id: event.id } })
      navigate({ to: '/event' })
    } catch (err) {
      console.error('Failed to delete event:', err)
      alert('Failed to delete event')
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePurge = async () => {
    setIsPurging(true)
    try {
      await purgeAllAttendees({ data: purgePin })
      setShowPurgeDialog(false)
      setPurgePin('')
      fetchData()
    } catch (err) {
      console.error('Purge failed:', err)
      alert('Purge failed. Check PIN and try again.')
    } finally {
      setIsPurging(false)
    }
  }

  const handleSeed = async () => {
    setIsSeeding(true)
    try {
      const count = parseInt(seedCount, 10) || 30
      await seedTestData({ data: { pin: ADMIN_PIN, count, eventId } })
      setShowSeedDialog(false)
      setSeedCount('30')
      fetchData()
    } catch (err) {
      console.error('Seed failed:', err)
      alert('Failed to seed test data.')
    } finally {
      setIsSeeding(false)
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
    } catch (err) {
      console.error('Generate insights failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to generate insights.')
    } finally {
      setIsGeneratingInsights(false)
    }
  }

  const exportCSV = () => {
    if (!attendees.length) return

    const headers = ['Name', 'Email', 'Contact', 'Age', 'City', 'Satellite', 'Status', 'Invited By', 'Registered At']
    const rows = attendees.map((a) => [
      a.name,
      a.email || '',
      a.contact_number || '',
      a.age.toString(),
      a.city,
      a.satellite,
      a.member_status || '',
      a.invited_by || '',
      new Date(a.registered_at).toLocaleString(),
    ])

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event?.name || 'attendees'}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  // Error state
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <Link to="/event" className="text-white/80 hover:text-white mb-2 inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Events
            </Link>
            <h1 className="text-2xl font-bold mt-2">Event Not Found</h1>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600">{error || 'This event does not exist.'}</p>
          <Button onClick={() => navigate({ to: '/event' })} className="mt-4">
            Back to Events
          </Button>
        </div>
      </div>
    )
  }

  // Calculate stats
  const stats = {
    total: attendees.length,
    averageAge: attendees.length > 0
      ? Math.round(attendees.reduce((sum, a) => sum + a.age, 0) / attendees.length)
      : 0,
    earlyBirdCount: attendees.filter(a => {
      const cutoff = event.early_bird_cutoff || '09:00:00'
      const regTime = new Date(a.registered_at).toTimeString().slice(0, 8)
      return regTime < cutoff
    }).length,
    needsSupportCount: attendees.filter(a => a.needs_support).length,
    byStatus: {
      'First Timer': attendees.filter(a => a.member_status === 'First Timer').length,
      'Newbie': attendees.filter(a => a.member_status === 'Newbie').length,
      'Regular': attendees.filter(a => a.member_status === 'Regular').length,
      'Leader': attendees.filter(a => a.member_status === 'Leader').length,
    },
    bySatellite: attendees.reduce((acc, a) => {
      acc[a.satellite] = (acc[a.satellite] || 0) + 1
      return acc
    }, {} as Record<string, number>),
  }

  // Chart data
  const satelliteData = Object.entries(stats.bySatellite).map(([name, value]) => ({
    name: name.replace('Quest ', ''),
    value,
  }))

  const statusData = Object.entries(stats.byStatus).map(([name, value]) => ({
    name,
    value,
  }))

  // Filter attendees
  const filteredAttendees = attendees.filter((a) => {
    if (filterSearch && !a.name.toLowerCase().includes(filterSearch.toLowerCase())) return false
    if (filterSatellite && a.satellite !== filterSatellite) return false
    if (filterStage && a.member_status !== filterStage) return false
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Banner */}
      {event.banner_url && (
        <div className="w-full max-h-48 overflow-hidden">
          <img
            src={event.banner_url}
            alt={`${event.name} banner`}
            className="w-full h-48 object-cover"
          />
        </div>
      )}

      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Link to="/event" className="text-white/80 hover:text-white mb-2 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Events
          </Link>
          <div className="flex items-center justify-between mt-2">
            <div>
              <h1 className="text-2xl font-bold">{event.name}</h1>
              <div className="flex items-center gap-4 mt-1 text-white/80 text-sm">
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(event.event_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                {event.event_time && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {event.event_time}
                  </span>
                )}
                {event.location && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {event.location}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowEditDialog(true)}
                className="bg-white/10 text-white border-white/30 hover:bg-white/20"
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchData}
                className="bg-white/10 text-white border-white/30 hover:bg-white/20"
              >
                Refresh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={exportCSV}
                className="bg-white/10 text-white border-white/30 hover:bg-white/20"
              >
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendees">Attendees ({attendees.length})</TabsTrigger>
            <TabsTrigger value="ai">AI Insights</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="bg-gradient-to-br from-[#8B1538] to-[#B91C3C] text-white">
                <CardHeader className="pb-2">
                  <CardDescription className="text-red-200">Total Registered</CardDescription>
                  <CardTitle className="text-4xl font-black">{stats.total}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Expected</CardDescription>
                  <CardTitle className="text-3xl">{event.expected_attendees}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Average Age</CardDescription>
                  <CardTitle className="text-3xl">{stats.averageAge}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Early Birds</CardDescription>
                  <CardTitle className="text-3xl text-amber-600">{stats.earlyBirdCount}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>First Timers</CardDescription>
                  <CardTitle className="text-3xl text-amber-600">{stats.byStatus['First Timer']}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Leaders</CardDescription>
                  <CardTitle className="text-3xl text-slate-600">{stats.byStatus.Leader}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Progress Bar */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Registration Progress</CardTitle>
                <CardDescription>
                  {stats.total} of {event.expected_attendees} expected attendees ({Math.round((stats.total / event.expected_attendees) * 100)}%)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-gradient-to-r from-[#8B1538] to-[#DC2626] h-4 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (stats.total / event.expected_attendees) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Registration Link & QR Code */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Registration Link & QR Code</CardTitle>
                <CardDescription>Share this link or QR code with members to register for this event</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row items-center gap-6">
                  {/* QR Code */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <div ref={qrRef} className="bg-white p-4 rounded-lg border-2 border-gray-100">
                      <QRCodeSVG
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/register?event=${eventId}`}
                        size={180}
                        level="H"
                        includeMargin
                        fgColor="#8B1538"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadQR}
                      className="w-full"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download QR
                    </Button>
                  </div>
                  {/* Link + Actions */}
                  <div className="flex-1 space-y-4 w-full">
                    <div>
                      <Label className="text-sm text-gray-500 mb-1 block">Registration URL</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-gray-100 px-3 py-2 rounded text-sm break-all">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/register?event={eventId}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/register?event=${eventId}`)
                            setLinkCopied(true)
                            setTimeout(() => setLinkCopied(false), 2000)
                          }}
                        >
                          {linkCopied ? 'Copied!' : 'Copy'}
                        </Button>
                      </div>
                    </div>
                    {/* Registration Status */}
                    {(() => {
                      const status = getRegistrationStatus({
                        registration_open: event.registration_open,
                        registration_start: event.registration_start,
                        registration_end: event.registration_end,
                      })
                      const statusConfig: Record<string, { label: string; color: string }> = {
                        open: { label: 'Open', color: 'bg-green-100 text-green-800' },
                        not_started: { label: 'Not Yet Open', color: 'bg-blue-100 text-blue-800' },
                        ended: { label: 'Ended', color: 'bg-gray-100 text-gray-800' },
                        closed: { label: 'Closed', color: 'bg-red-100 text-red-800' },
                      }
                      const cfg = statusConfig[status]
                      return (
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">Registration Status:</span>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                      )
                    })()}
                    {/* Registration window info */}
                    {(event.registration_start || event.registration_end) && (
                      <div className="text-sm text-gray-500 space-y-1">
                        {event.registration_start && (
                          <p>Opens: {new Date(event.registration_start).toLocaleString()}</p>
                        )}
                        {event.registration_end && (
                          <p>Closes: {new Date(event.registration_end).toLocaleString()}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts - only show when there are registrations */}
            {attendees.length > 0 && (
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

                {/* Member Status Bar Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Member Status Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={statusData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={90} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8B1538" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}
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
                    <option value="">All Statuses</option>
                    <option value="First Timer">First Timer</option>
                    <option value="Newbie">Newbie</option>
                    <option value="Regular">Regular</option>
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
                        <TableHead className="font-semibold">Status</TableHead>
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
                                  attendee.member_status === 'First Timer'
                                    ? 'bg-purple-100 text-purple-800'
                                    : attendee.member_status === 'Newbie'
                                      ? 'bg-amber-100 text-amber-800'
                                      : attendee.member_status === 'Regular'
                                        ? 'bg-teal-100 text-teal-800'
                                        : 'bg-slate-200 text-slate-800'
                                }`}
                              >
                                {attendee.member_status}
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
                    <CardDescription className="text-rose-200">
                      Generate actionable insights with mentorship suggestions for {attendees.length} attendees
                    </CardDescription>
                  </div>
                  <Button
                    onClick={handleGenerateOverallInsights}
                    disabled={isGeneratingInsights || attendees.length === 0}
                    className="bg-white text-[#8B1538] hover:bg-rose-50"
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
                  <Card className="bg-gradient-to-br from-[#8B1538] to-[#6B0F2B] text-white">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-rose-200">Total Attendees</CardDescription>
                      <CardTitle className="text-3xl font-black">{overallInsights.stats.totalMembers}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Newbies</CardDescription>
                      <CardTitle className="text-3xl text-amber-600">{overallInsights.stats.newbies.length}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Leaders</CardDescription>
                      <CardTitle className="text-3xl text-slate-600">{overallInsights.stats.leaders.length}</CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Top Satellite</CardDescription>
                      <CardTitle className="text-lg text-teal-600">
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
                  {/* Mentorship Suggestions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-[#8B1538]">Mentorship Suggestions</CardTitle>
                      <CardDescription>AI-recommended mentor-newbie pairings</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {overallInsights.mentorshipSuggestions.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">No suggestions available</p>
                      ) : (
                        <div className="space-y-3">
                          {overallInsights.mentorshipSuggestions.map((match, i) => (
                            <div key={i} className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-amber-700 font-medium">{match.newbie}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-slate-700 font-medium">{match.suggestedMentor}</span>
                              </div>
                              <p className="text-sm text-gray-600">{match.reason}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Action Items */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg text-teal-700">Action Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {overallInsights.actionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-teal-500 mt-0.5">•</span>
                            <span className="text-gray-700">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  {/* Key Themes */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Key Themes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {overallInsights.keyThemes.map((theme, i) => (
                          <span key={i} className="px-3 py-1.5 bg-rose-100 text-rose-800 rounded-full text-sm">
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
                                  style={{ width: `${(sat.count / overallInsights.stats.totalMembers) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
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

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="space-y-6">
              {/* Event Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Event Settings</CardTitle>
                  <CardDescription>Configure event details and registration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Registration Status</p>
                      <p className="text-sm text-gray-500">
                        {(() => {
                          const status = getRegistrationStatus({
                            registration_open: event.registration_open,
                            registration_start: event.registration_start,
                            registration_end: event.registration_end,
                          })
                          const descriptions: Record<string, string> = {
                            open: 'Registration is open and accepting submissions',
                            not_started: `Registration opens ${event.registration_start ? new Date(event.registration_start).toLocaleString() : 'soon'}`,
                            ended: `Registration ended ${event.registration_end ? new Date(event.registration_end).toLocaleString() : ''}`,
                            closed: 'Registration has been manually closed',
                          }
                          return descriptions[status]
                        })()}
                      </p>
                    </div>
                    {(() => {
                      const status = getRegistrationStatus({
                        registration_open: event.registration_open,
                        registration_start: event.registration_start,
                        registration_end: event.registration_end,
                      })
                      const cfg: Record<string, { label: string; color: string }> = {
                        open: { label: 'Open', color: 'bg-green-100 text-green-800' },
                        not_started: { label: 'Not Yet Open', color: 'bg-blue-100 text-blue-800' },
                        ended: { label: 'Ended', color: 'bg-gray-100 text-gray-800' },
                        closed: { label: 'Closed', color: 'bg-red-100 text-red-800' },
                      }
                      const c = cfg[status]
                      return (
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${c.color}`}>
                          {c.label}
                        </span>
                      )
                    })()}
                  </div>
                  {(event.registration_start || event.registration_end) && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Registration Window</p>
                        <p className="text-sm text-gray-500">
                          {event.registration_start ? `Opens: ${new Date(event.registration_start).toLocaleString()}` : 'Opens: Immediately'}
                          {' — '}
                          {event.registration_end ? `Closes: ${new Date(event.registration_end).toLocaleString()}` : 'No deadline'}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Early Bird Cutoff</p>
                      <p className="text-sm text-gray-500">Attendees registered before this time are marked as early birds</p>
                    </div>
                    <span className="text-gray-700 font-medium">{event.early_bird_cutoff || '09:00'}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Test Data Section */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Seed Test Data</CardTitle>
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
                    <CardTitle className="text-red-600">Purge Attendees</CardTitle>
                    <CardDescription>Permanently delete all registration data for this event</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="destructive" onClick={() => setShowPurgeDialog(true)}>
                      Purge All Attendees
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Danger Zone */}
              <Card className="border-red-300">
                <CardHeader>
                  <CardTitle className="text-red-600">Danger Zone</CardTitle>
                  <CardDescription>Irreversible actions for this event</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                    Delete Event
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit Event Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open)
        if (!open) { setEditBannerFile(null); setEditBannerPreview(null) }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>Update event details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Banner Upload */}
            <div className="space-y-2">
              <Label>Event Banner</Label>
              {(editBannerPreview || event?.banner_url) && !editBannerFile ? (
                <div className="relative">
                  <img
                    src={editBannerPreview || event?.banner_url || ''}
                    alt="Banner"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <label className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded cursor-pointer hover:bg-black/80">
                    Change
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setEditBannerFile(file)
                          setEditBannerPreview(URL.createObjectURL(file))
                        }
                      }}
                    />
                  </label>
                </div>
              ) : editBannerFile ? (
                <div className="relative">
                  <img
                    src={editBannerPreview || ''}
                    alt="New banner"
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    type="button"
                    onClick={() => { setEditBannerFile(null); setEditBannerPreview(null) }}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#8B1538] transition-colors">
                  <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm text-gray-500">Click to upload banner</span>
                  <span className="text-xs text-gray-400">JPEG, PNG, WebP (max 5MB)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setEditBannerFile(file)
                        setEditBannerPreview(URL.createObjectURL(file))
                      }
                    }}
                  />
                </label>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Event Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Event name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Event description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.event_date}
                  onChange={(e) => setEditForm({ ...editForm, event_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time">Time</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editForm.event_time}
                  onChange={(e) => setEditForm({ ...editForm, event_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-location">Location</Label>
              <Input
                id="edit-location"
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                placeholder="Event location"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-expected">Expected Attendees</Label>
                <Input
                  id="edit-expected"
                  type="number"
                  value={editForm.expected_attendees}
                  onChange={(e) => setEditForm({ ...editForm, expected_attendees: parseInt(e.target.value) || 100 })}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cutoff">Early Bird Cutoff</Label>
                <Input
                  id="edit-cutoff"
                  type="time"
                  value={editForm.early_bird_cutoff}
                  onChange={(e) => setEditForm({ ...editForm, early_bird_cutoff: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-reg-start">Registration Opens</Label>
                <Input
                  id="edit-reg-start"
                  type="datetime-local"
                  value={editForm.registration_start}
                  onChange={(e) => setEditForm({ ...editForm, registration_start: e.target.value })}
                />
                <p className="text-xs text-gray-400">Leave empty for immediately</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reg-end">Registration Closes</Label>
                <Input
                  id="edit-reg-end"
                  type="datetime-local"
                  value={editForm.registration_end}
                  onChange={(e) => setEditForm({ ...editForm, registration_end: e.target.value })}
                />
                <p className="text-xs text-gray-400">Leave empty for no deadline</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateEvent}
              disabled={isUpdating || !editForm.name || !editForm.event_date}
              className="bg-[#8B1538] hover:bg-[#6B0F2B]"
            >
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Event Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{event.name}"? This will also delete all associated attendee data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteEvent} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge Dialog */}
      <Dialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Purge All Attendees</DialogTitle>
            <DialogDescription>
              This will permanently delete all attendee registrations for this event. This action cannot be undone.
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
              {isPurging ? 'Purging...' : 'Purge All Attendees'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seed Dialog */}
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
                <p className="text-sm font-medium text-gray-500">Member Status</p>
                <p className="font-medium">{selectedAttendee?.member_status}</p>
              </div>
              {selectedAttendee?.email && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="font-medium">{selectedAttendee.email}</p>
                </div>
              )}
              {selectedAttendee?.contact_number && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Contact</p>
                  <p className="font-medium">{selectedAttendee.contact_number}</p>
                </div>
              )}
              {selectedAttendee?.invited_by && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Invited By</p>
                  <p className="font-medium">{selectedAttendee.invited_by}</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
