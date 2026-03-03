import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { registerAttendee } from '../server/functions/attendees'
import { getEventPublic } from '../server/functions/events'
import { getSatellites } from '../server/functions/satellites'
import { registrationSchema } from '../lib/validations'
import {
  EVENT_MEMBER_STATUSES,
  EVENT_NAME,
  EVENT_TITLE,
  EVENT_DATES,
  EVENT_VENUE,
  LOGO_PATH,
  REGISTRATION_SUCCESS_MESSAGE,
} from '../lib/constants'
import type { EventMemberStatus, SatelliteRecord } from '../lib/types'
import type { RegistrationStatus } from '../server/functions/events'

export const Route = createFileRoute('/register')({
  validateSearch: (search: Record<string, unknown>) => ({
    event: (search.event as string) || undefined,
  }),
  loader: async ({ location }) => {
    const eventId = (location.search as { event?: string })?.event
    if (!eventId) return { event: null }
    try {
      const ev = await getEventPublic({ data: { id: eventId } })
      return { event: ev }
    } catch {
      return { event: null }
    }
  },
  head: ({ loaderData }) => {
    const ev = loaderData?.event
    if (ev) {
      const title = `Register for ${ev.name}`
      const description = ev.description || `Join us for ${ev.name} on ${new Date(ev.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${ev.location ? ` at ${ev.location}` : ''}`
      return {
        meta: [
          { title },
          { name: 'description', content: description },
          { property: 'og:title', content: title },
          { property: 'og:description', content: description },
          { property: 'og:type', content: 'website' },
          ...(ev.banner_url ? [{ property: 'og:image', content: ev.banner_url }] : []),
          { property: 'og:site_name', content: 'Quest Laguna' },
          { name: 'twitter:card', content: ev.banner_url ? 'summary_large_image' : 'summary' },
          { name: 'twitter:title', content: title },
          { name: 'twitter:description', content: description },
          ...(ev.banner_url ? [{ name: 'twitter:image', content: ev.banner_url }] : []),
        ],
      }
    }
    return {
      meta: [
        { title: `${EVENT_NAME} - Registration` },
        { name: 'description', content: EVENT_TITLE },
        { property: 'og:title', content: EVENT_NAME },
        { property: 'og:description', content: EVENT_TITLE },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Quest Laguna' },
      ],
    }
  },
  component: RegisterPage,
})

interface EventInfo {
  id: string
  name: string
  description: string | null
  event_date: string
  event_time: string | null
  location: string | null
  banner_url: string | null
  registration_status: RegistrationStatus
}

function RegisterPage() {
  const { event: eventId } = Route.useSearch()
  const loaderData = Route.useLoaderData()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [satellites, setSatellites] = useState<SatelliteRecord[]>([])

  // Use loader data for event info (already fetched server-side for OG tags)
  const eventInfo = eventId ? (loaderData?.event as EventInfo | null) : null
  const eventLoading = false // Loader already resolved
  const eventNotFound = eventId ? !eventInfo : false

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [age, setAge] = useState('')
  const [city, setCity] = useState('')
  const [satellite, setSatellite] = useState('')
  const [memberStatus, setMemberStatus] = useState<EventMemberStatus | ''>('')
  const [invitedBy, setInvitedBy] = useState('')

  // Fetch satellites on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const sats = await getSatellites({ data: false })
        setSatellites(sats)
      } catch (error) {
        console.error('Failed to fetch satellites:', error)
      }
    }
    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    const formData = {
      name,
      email: email || undefined,
      contact_number: contactNumber || undefined,
      age: parseInt(age, 10) || 0,
      city,
      satellite,
      member_status: memberStatus as EventMemberStatus,
      invited_by: invitedBy || undefined,
      ...(eventInfo ? { event_id: eventInfo.id } : {}),
    }

    const result = registrationSchema.safeParse(formData)

    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string
        fieldErrors[field] = issue.message
      })
      setErrors(fieldErrors)
      return
    }

    setIsSubmitting(true)

    try {
      await registerAttendee({ data: result.data })
      setIsSuccess(true)
    } catch (error) {
      console.error('Registration failed:', error)
      setErrors({ form: 'Registration failed. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Derive display values — event-specific or hardcoded defaults
  const displayName = eventInfo?.name || EVENT_NAME
  const displayDate = eventInfo ? formatEventDate(eventInfo.event_date, eventInfo.event_time) : `${EVENT_DATES} | ${EVENT_VENUE}`
  const displayLocation = eventInfo?.location || EVENT_VENUE

  if (isSuccess) {
    return <SuccessScreen eventName={displayName} eventDate={displayDate} eventLocation={displayLocation} />
  }

  // Loading event info
  if (eventLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-red-200 text-sm">Loading event...</p>
        </div>
      </div>
    )
  }

  // Event not found
  if (eventId && eventNotFound) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Event Not Found</h1>
          <p className="text-red-200">This event doesn't exist or is no longer available.</p>
        </div>
      </div>
    )
  }

  // Registration not open
  if (eventInfo && eventInfo.registration_status !== 'open') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          {eventInfo.banner_url && (
            <img src={eventInfo.banner_url} alt={eventInfo.name} className="w-full max-w-sm mx-auto mb-6 rounded-xl shadow-lg" />
          )}
          <h1 className="text-2xl font-bold text-white mb-2">{eventInfo.name}</h1>
          <div className="mt-4 bg-white/10 backdrop-blur rounded-xl p-6">
            {eventInfo.registration_status === 'not_started' && (
              <>
                <p className="text-xl text-amber-300 font-semibold mb-2">Registration Not Yet Open</p>
                <p className="text-red-200 text-sm">Registration hasn't started yet. Please check back later.</p>
              </>
            )}
            {eventInfo.registration_status === 'ended' && (
              <>
                <p className="text-xl text-red-300 font-semibold mb-2">Registration Has Ended</p>
                <p className="text-red-200 text-sm">The registration period for this event has closed.</p>
              </>
            )}
            {eventInfo.registration_status === 'closed' && (
              <>
                <p className="text-xl text-red-300 font-semibold mb-2">Registration Closed</p>
                <p className="text-red-200 text-sm">Registration for this event is currently closed.</p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E]">
      {/* Header */}
      <header className="pt-6 pb-4 px-4 text-center">
        {eventInfo?.banner_url ? (
          <img
            src={eventInfo.banner_url}
            alt={displayName}
            className="w-full max-w-sm mx-auto mb-4 rounded-xl shadow-lg shadow-red-900/50"
          />
        ) : (
          <img
            src={LOGO_PATH}
            alt={displayName}
            className="w-24 h-24 md:w-32 md:h-32 mx-auto mb-4 rounded-full object-cover shadow-lg shadow-red-900/50"
          />
        )}
        <h1 className="text-xl md:text-2xl font-bold text-white mb-1">
          {displayName}
        </h1>
        {eventInfo ? (
          <>
            {eventInfo.description && (
              <p className="text-red-300 text-sm">{eventInfo.description}</p>
            )}
            <p className="text-red-400/70 text-xs mt-1">
              {displayDate}{displayLocation ? ` | ${displayLocation}` : ''}
            </p>
          </>
        ) : (
          <>
            <p className="text-red-300 text-sm">{EVENT_TITLE}</p>
            <p className="text-red-400/70 text-xs mt-1">{EVENT_DATES} | {EVENT_VENUE}</p>
          </>
        )}
      </header>

      {/* Form Card */}
      <main className="px-4 pb-8">
        <form
          onSubmit={handleSubmit}
          className="max-w-md mx-auto bg-white rounded-2xl shadow-2xl shadow-red-900/30 p-6 md:p-8"
        >
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
            Registration Form
          </h2>

          {errors.form && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {errors.form}
            </div>
          )}

          {/* Name */}
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${errors.name ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="Juan dela Cruz"
            />
            {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
          </div>

          {/* Email */}
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${errors.email ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="juan@email.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}
          </div>

          {/* Contact Number */}
          <div className="mb-4">
            <label htmlFor="contact_number" className="block text-sm font-medium text-gray-700 mb-1">
              Contact Number
            </label>
            <input
              type="tel"
              id="contact_number"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${errors.contact_number ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="09171234567"
            />
            {errors.contact_number && <p className="mt-1 text-sm text-red-500">{errors.contact_number}</p>}
          </div>

          {/* Age */}
          <div className="mb-4">
            <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">
              Age <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="age"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              min="1"
              max="99"
              className={`w-full px-4 py-3 rounded-lg border ${errors.age ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="25"
            />
            {errors.age && <p className="mt-1 text-sm text-red-500">{errors.age}</p>}
          </div>

          {/* City */}
          <div className="mb-4">
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              City/Municipality <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${errors.city ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="Santa Rosa"
            />
            {errors.city && <p className="mt-1 text-sm text-red-500">{errors.city}</p>}
          </div>

          {/* Satellite */}
          <div className="mb-4">
            <label htmlFor="satellite" className="block text-sm font-medium text-gray-700 mb-1">
              Satellite Location <span className="text-red-500">*</span>
            </label>
            <select
              id="satellite"
              value={satellite}
              onChange={(e) => setSatellite(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${errors.satellite ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition bg-white appearance-none cursor-pointer`}
            >
              <option value="">Select your satellite</option>
              {satellites.map((sat) => (
                <option key={sat.id} value={sat.name}>{sat.name}</option>
              ))}
            </select>
            {errors.satellite && <p className="mt-1 text-sm text-red-500">{errors.satellite}</p>}
          </div>

          {/* Member Status */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Member Status <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {EVENT_MEMBER_STATUSES.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-start p-3 rounded-lg border cursor-pointer transition ${
                    memberStatus === s.value ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="member_status"
                    value={s.value}
                    checked={memberStatus === s.value}
                    onChange={(e) => setMemberStatus(e.target.value as EventMemberStatus)}
                    className="sr-only"
                  />
                  <span className={`w-5 h-5 rounded-full border-2 mr-3 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                    memberStatus === s.value ? 'border-red-500' : 'border-gray-300'
                  }`}>
                    {memberStatus === s.value && <span className="w-2.5 h-2.5 bg-red-500 rounded-full" />}
                  </span>
                  <div>
                    <span className="text-gray-700 font-medium">{s.label}</span>
                    <p className="text-sm text-gray-500">{s.description}</p>
                  </div>
                </label>
              ))}
            </div>
            {errors.member_status && (
              <p className="mt-1 text-sm text-red-500">{errors.member_status}</p>
            )}
          </div>

          {/* Invited By */}
          <div className="mb-6">
            <label htmlFor="invited_by" className="block text-sm font-medium text-gray-700 mb-1">
              Who invited you? <span className="text-gray-400 text-xs font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="invited_by"
              value={invitedBy}
              onChange={(e) => setInvitedBy(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border ${errors.invited_by ? 'border-red-500' : 'border-gray-300'} focus:ring-2 focus:ring-red-500 focus:border-transparent transition`}
              placeholder="Name of the person who invited you"
            />
            {errors.invited_by && <p className="mt-1 text-sm text-red-500">{errors.invited_by}</p>}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-4 rounded-lg font-semibold text-white transition ${
              isSubmitting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#8B1538] to-[#B91C3C] hover:from-[#6B0F2B] hover:to-[#8B1538] active:from-[#5A0C24] active:to-[#6B0F2B]'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Registering...
              </span>
            ) : (
              'Register Now'
            )}
          </button>
        </form>
      </main>
    </div>
  )
}

function SuccessScreen({ eventName, eventDate, eventLocation }: {
  eventName: string
  eventDate: string
  eventLocation: string
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#8B1538] via-[#B91C3C] to-[#6B0F2B] flex items-center justify-center p-4">
      <div className="text-center">
        <img
          src={LOGO_PATH}
          alt={eventName}
          className="w-32 h-32 mx-auto mb-6 rounded-full object-cover shadow-lg shadow-black/30"
        />
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
          You're Registered!
        </h1>
        <p className="text-xl text-red-100 max-w-md mx-auto mb-8">
          {REGISTRATION_SUCCESS_MESSAGE}
        </p>
        <div className="inline-block bg-white/20 backdrop-blur-sm rounded-full px-6 py-3">
          <span className="text-white font-semibold">{eventName}</span>
        </div>
        <p className="text-red-200 text-sm mt-4">{eventDate}</p>
        <p className="text-red-300/70 text-xs">{eventLocation}</p>
      </div>
    </div>
  )
}

function formatEventDate(date: string, time: string | null): string {
  try {
    const d = new Date(date + 'T00:00:00')
    const formatted = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    if (time) {
      const [h, m] = time.split(':')
      const hour = parseInt(h, 10)
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const h12 = hour % 12 || 12
      return `${formatted} | ${h12}:${m} ${ampm}`
    }
    return formatted
  } catch {
    return date
  }
}
