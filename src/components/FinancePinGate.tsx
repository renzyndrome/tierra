// Server-verified, per-user finance PIN gate.
//
// Renders a "set PIN" (first time) or "enter PIN" card and calls `onUnlock`
// once the caller's PIN is set/verified server-side. Used by both the
// standalone /finances page and the admin dashboard's Finances tab.

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthProvider'
import { getFinancePinStatus, setFinancePin, verifyFinancePin } from '../server/functions/financePin'
import { FINANCE_PIN_MIN_LENGTH, FINANCE_PIN_MAX_LENGTH } from '../lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface FinancePinGateProps {
  onUnlock: () => void
}

type GateMode = 'loading' | 'set' | 'enter' | 'denied'

export function FinancePinGate({ onUnlock }: FinancePinGateProps) {
  const { session } = useAuth()
  const accessToken = session?.access_token

  const [mode, setMode] = useState<GateMode>('loading')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadStatus = useCallback(async () => {
    if (!accessToken) return
    setMode('loading')
    try {
      const { hasPin } = await getFinancePinStatus({ data: { accessToken } })
      setMode(hasPin ? 'enter' : 'set')
    } catch (err) {
      // Permission errors surface here (caller lacks finances.read).
      setError(err instanceof Error ? err.message : 'Unable to load finance access')
      setMode('denied')
    }
  }, [accessToken])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    setSubmitting(true)
    setError('')
    try {
      const { valid, hasPin } = await verifyFinancePin({ data: { accessToken, pin } })
      if (!hasPin) {
        setMode('set')
        setPin('')
        return
      }
      if (valid) {
        onUnlock()
      } else {
        setError('Incorrect PIN. Please try again.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accessToken) return
    if (pin.length < FINANCE_PIN_MIN_LENGTH) {
      setError(`PIN must be at least ${FINANCE_PIN_MIN_LENGTH} characters.`)
      return
    }
    if (pin !== confirmPin) {
      setError('The two PINs do not match.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await setFinancePin({ data: { accessToken, pin } })
      onUnlock()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set PIN')
    } finally {
      setSubmitting(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-red-900/30">{children}</Card>
    </div>
  )

  if (mode === 'loading') {
    return shell(
      <CardContent className="p-10 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B1538]" />
      </CardContent>,
    )
  }

  if (mode === 'denied') {
    return shell(
      <>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Access Restricted</CardTitle>
          <CardDescription>{error || 'You do not have access to financial data.'}</CardDescription>
        </CardHeader>
      </>,
    )
  }

  if (mode === 'set') {
    return shell(
      <>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set your finance PIN</CardTitle>
          <CardDescription>
            Create a private PIN to protect financial data. You'll enter it each time you open finances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSet} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="new-pin">New PIN</Label>
              <Input
                id="new-pin"
                type="password"
                placeholder="Choose a PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="text-center text-2xl tracking-widest"
                maxLength={FINANCE_PIN_MAX_LENGTH}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-pin">Confirm PIN</Label>
              <Input
                id="confirm-pin"
                type="password"
                placeholder="Re-enter PIN"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                className="text-center text-2xl tracking-widest"
                maxLength={FINANCE_PIN_MAX_LENGTH}
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <Button type="submit" disabled={submitting} className="w-full bg-[#8B1538] hover:bg-[#6B0F2B]">
              {submitting ? 'Saving…' : 'Set PIN & Continue'}
            </Button>
          </form>
        </CardContent>
      </>,
    )
  }

  // mode === 'enter'
  return shell(
    <>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Financial Management</CardTitle>
        <CardDescription>Enter your finance PIN to continue</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleEnter} className="space-y-4">
          <Input
            type="password"
            placeholder="Enter PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="text-center text-2xl tracking-widest"
            maxLength={FINANCE_PIN_MAX_LENGTH}
            autoFocus
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full bg-[#8B1538] hover:bg-[#6B0F2B]">
            {submitting ? 'Checking…' : 'Continue'}
          </Button>
          <p className="text-xs text-center text-gray-400">
            Forgot your PIN? Ask an administrator to reset it for you.
          </p>
        </form>
      </CardContent>
    </>,
  )
}
