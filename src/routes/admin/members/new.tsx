// Quest Laguna Directory - Add New Member Page

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { createMember } from '../../../server/functions/members'
import { getSatellites } from '../../../server/functions/satellites'
import { MemberForm } from '../../../components/MemberForm'
import type { MemberInsert, SatelliteRow } from '../../../lib/types'
import { ADMIN_PIN } from '../../../lib/constants'

// shadcn/ui components
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card'

export const Route = createFileRoute('/admin/members/new')({
  component: NewMemberPage,
})

function NewMemberPage() {
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

  return <NewMemberForm />
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
          <CardTitle className="text-2xl">Add New Member</CardTitle>
          <CardDescription>Enter your PIN to add a new member</CardDescription>
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
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// New Member Form
function NewMemberForm() {
  const navigate = useNavigate()
  const [satellites, setSatellites] = useState<SatelliteRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSatellites = async () => {
      try {
        const sats = await getSatellites({ data: false }) // Only active satellites
        setSatellites(sats)
      } catch (err) {
        console.error('Error fetching satellites:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSatellites()
  }, [])

  const handleSubmit = async (data: MemberInsert) => {
    setIsSubmitting(true)
    setError(null)

    try {
      await createMember({ data })
      navigate({ to: '/admin', search: { tab: 'members' } })
    } catch (err) {
      console.error('Error creating member:', err)
      setError(err instanceof Error ? err.message : 'Failed to create member')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate({ to: '/admin', search: { tab: 'members' } })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8B1538] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#8B1538] to-[#B91C3C] shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/admin"
              search={{ tab: 'members' }}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">Add New Member</h1>
              <p className="text-red-200 text-xs">Quest Laguna Directory</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Member Information</CardTitle>
            <CardDescription>Fill in the details for the new member</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <MemberForm
              satellites={satellites}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
