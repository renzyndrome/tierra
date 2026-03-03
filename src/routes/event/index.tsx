// Quest Laguna - Events Dashboard

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '../../components/AuthProvider'
import { getEvents, createEvent, deleteEvent, toggleEventRegistration, getRegistrationStatus } from '../../server/functions/events'
import type { EventWithStats, EventInsert } from '../../lib/types'
import { uploadEventBanner } from '../../lib/storage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Textarea } from '../../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'

export const Route = createFileRoute('/event/')({
  component: EventsDashboard,
})

function EventsDashboard() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: authLoading, profile } = useAuth()

  const [events, setEvents] = useState<EventWithStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<EventWithStats | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Form state
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [newEvent, setNewEvent] = useState<EventInsert>({
    name: '',
    description: '',
    event_date: new Date().toISOString().split('T')[0],
    event_time: '09:00',
    location: '',
    expected_attendees: 100,
    early_bird_cutoff: '09:00',
    registration_open: true,
    registration_start: undefined,
    registration_end: undefined,
  })

  const isAdmin = profile?.role === 'super_admin' || profile?.role === 'satellite_leader'

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      sessionStorage.setItem('quest_redirect_after_login', '/event')
      navigate({ to: '/auth/login' })
    }
  }, [authLoading, isAuthenticated, navigate])

  // Fetch events
  const fetchEvents = async () => {
    setIsLoading(true)
    try {
      const data = await getEvents({ data: { activeOnly: false } })
      setEvents(data)
    } catch (error) {
      console.error('Error fetching events:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchEvents()
    }
  }, [isAuthenticated])

  // Create event
  const handleCreateEvent = async () => {
    setIsCreating(true)
    try {
      // Upload banner if selected
      let bannerUrl: string | undefined
      if (bannerFile) {
        const tempId = crypto.randomUUID()
        const { url, error: uploadError } = await uploadEventBanner(tempId, bannerFile)
        if (uploadError) {
          alert(`Banner upload failed: ${uploadError.message}`)
          setIsCreating(false)
          return
        }
        bannerUrl = url
      }

      await createEvent({
        data: {
          ...newEvent,
          ...(bannerUrl ? { banner_url: bannerUrl } : {}),
        },
      })
      setShowCreateDialog(false)
      setNewEvent({
        name: '',
        description: '',
        event_date: new Date().toISOString().split('T')[0],
        event_time: '09:00',
        location: '',
        expected_attendees: 100,
        early_bird_cutoff: '09:00',
        registration_open: true,
        registration_start: undefined,
        registration_end: undefined,
      })
      setBannerFile(null)
      setBannerPreview(null)
      fetchEvents()
    } catch (error) {
      console.error('Error creating event:', error)
      alert('Failed to create event')
    } finally {
      setIsCreating(false)
    }
  }

  // Delete event
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return
    setIsDeleting(true)
    try {
      await deleteEvent({ data: { id: eventToDelete.id } })
      setShowDeleteDialog(false)
      setEventToDelete(null)
      fetchEvents()
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Failed to delete event')
    } finally {
      setIsDeleting(false)
    }
  }

  // Toggle registration
  const handleToggleRegistration = async (event: EventWithStats) => {
    try {
      await toggleEventRegistration({ data: { id: event.id, registration_open: !event.registration_open } })
      fetchEvents()
    } catch (error) {
      console.error('Error toggling registration:', error)
    }
  }

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-[#8B1538] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-white/80 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Events Management</h1>
              <p className="text-white/80 text-sm mt-1">Create and manage church events</p>
            </div>
            {isAdmin && (
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="bg-white text-[#8B1538] hover:bg-white/90"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Event
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
              <p className="text-sm text-gray-500">Upcoming Events</p>
            </CardContent>
          </Card>
        </div>

        {/* Events List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-full" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Events Yet</h3>
              <p className="text-gray-500 mb-4">Get started by creating your first event</p>
              {isAdmin && (
                <Button onClick={() => setShowCreateDialog(true)}>Create Event</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((event) => {
              const isPast = new Date(event.event_date) < new Date()
              return (
                <Card key={event.id} className={`hover:shadow-lg transition-shadow overflow-hidden ${isPast ? 'opacity-75' : ''}`}>
                  {/* Banner thumbnail */}
                  {event.banner_url && (
                    <div className="w-full h-32 overflow-hidden">
                      <img src={event.banner_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{event.name}</CardTitle>
                        <CardDescription>{formatDate(event.event_date)}</CardDescription>
                      </div>
                      <div className="flex gap-1">
                        {(() => {
                          const status = getRegistrationStatus({
                            registration_open: event.registration_open,
                            registration_start: event.registration_start,
                            registration_end: event.registration_end,
                          })
                          const cfg: Record<string, { label: string; color: string }> = {
                            open: { label: 'Open', color: 'bg-green-100 text-green-800' },
                            not_started: { label: 'Soon', color: 'bg-blue-100 text-blue-800' },
                            ended: { label: 'Ended', color: 'bg-gray-100 text-gray-800' },
                            closed: { label: 'Closed', color: 'bg-red-100 text-red-800' },
                          }
                          const c = cfg[status]
                          return (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${c.color}`}>
                              {c.label}
                            </span>
                          )
                        })()}
                        {isPast && (
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                            Past
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {event.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{event.description}</p>
                    )}

                    {event.location && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}

                    {event.event_time && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{event.event_time}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <span className="font-semibold text-[#8B1538]">{event.registration_count}</span>
                          <span className="text-gray-500"> / {event.expected_attendees}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              handleToggleRegistration(event)
                            }}
                            className="p-2 text-gray-500 hover:text-[#8B1538] hover:bg-gray-100 rounded"
                            title={event.registration_open ? 'Close registration' : 'Open registration'}
                          >
                            {event.registration_open ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              setEventToDelete(event)
                              setShowDeleteDialog(true)
                            }}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                            title="Delete event"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                        <Link
                          to="/event/$eventId"
                          params={{ eventId: event.id }}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-[#8B1538] rounded hover:bg-[#6B0F2B] transition-colors"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Event Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
            <DialogDescription>Add a new event for registration</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Banner Upload */}
            <div>
              <Label>Event Banner</Label>
              <div className="mt-1">
                {bannerPreview ? (
                  <div className="relative">
                    <img src={bannerPreview} alt="Banner preview" className="w-full h-32 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => { setBannerFile(null); setBannerPreview(null) }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#8B1538] transition-colors">
                    <svg className="w-8 h-8 text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-500">Click to upload banner image</span>
                    <span className="text-xs text-gray-400">JPEG, PNG, WebP (max 5MB)</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setBannerFile(file)
                          setBannerPreview(URL.createObjectURL(file))
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="name">Event Name *</Label>
              <Input
                id="name"
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                placeholder="e.g., Quest Laguna Anniversary"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newEvent.description || ''}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                placeholder="Event description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="event_date">Date *</Label>
                <Input
                  id="event_date"
                  type="date"
                  value={newEvent.event_date}
                  onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="event_time">Time</Label>
                <Input
                  id="event_time"
                  type="time"
                  value={newEvent.event_time || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, event_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={newEvent.location || ''}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                placeholder="Event venue"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="expected_attendees">Expected Attendees</Label>
                <Input
                  id="expected_attendees"
                  type="number"
                  value={newEvent.expected_attendees}
                  onChange={(e) => setNewEvent({ ...newEvent, expected_attendees: parseInt(e.target.value) || 100 })}
                />
              </div>
              <div>
                <Label htmlFor="early_bird_cutoff">Early Bird Cutoff</Label>
                <Input
                  id="early_bird_cutoff"
                  type="time"
                  value={newEvent.early_bird_cutoff || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, early_bird_cutoff: e.target.value })}
                />
              </div>
            </div>
            {/* Registration Window */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="registration_start">Registration Opens</Label>
                <Input
                  id="registration_start"
                  type="datetime-local"
                  value={newEvent.registration_start || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, registration_start: e.target.value || undefined })}
                />
                <p className="text-xs text-gray-400 mt-1">Leave empty for immediately</p>
              </div>
              <div>
                <Label htmlFor="registration_end">Registration Closes</Label>
                <Input
                  id="registration_end"
                  type="datetime-local"
                  value={newEvent.registration_end || ''}
                  onChange={(e) => setNewEvent({ ...newEvent, registration_end: e.target.value || undefined })}
                />
                <p className="text-xs text-gray-400 mt-1">Leave empty for no deadline</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="registration_open">Registration Open</Label>
              <Switch
                id="registration_open"
                checked={newEvent.registration_open}
                onCheckedChange={(checked) => setNewEvent({ ...newEvent, registration_open: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateEvent} disabled={isCreating || !newEvent.name || !newEvent.event_date}>
              {isCreating ? 'Creating...' : 'Create Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Event</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{eventToDelete?.name}"? This will also delete all registrations for this event. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteEvent} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Event'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
