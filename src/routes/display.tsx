import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import {
  getAttendeeCount,
  getRecentRegistrants,
} from '../server/functions/attendees'
import { getStatsBySatellite, getEarlyBirdCount } from '../server/functions/analytics'
import { getFunFacts } from '../server/functions/funFacts'
import {
  EVENT_TITLE,
  EVENT_DATES,
  EVENT_VENUE,
  LOGO_PATH,
  DISPLAY_REFRESH_INTERVAL,
  FUN_FACTS as DEFAULT_FUN_FACTS,
  FUN_FACTS_INTERVAL,
} from '../lib/constants'
import type { Satellite } from '../lib/types'

// Interval for cycling through recent registrants (3 seconds)
const RECENT_REGISTRANTS_INTERVAL = 3000

export const Route = createFileRoute('/display')({
  component: DisplayPage,
})

interface RecentRegistrant {
  name: string
  registeredAt: string
}

interface DisplayStats {
  total: number
  bySatellite: Record<Satellite, number>
  earlyBirdCount: number
  recentRegistrants: RecentRegistrant[]
}

function DisplayPage() {
  const [stats, setStats] = useState<DisplayStats>({
    total: 0,
    bySatellite: {
      'Quest Laguna Main': 0,
      'Quest Biñan': 0,
      'Quest Sta. Rosa': 0,
    },
    earlyBirdCount: 0,
    recentRegistrants: [],
  })
  const [funFacts, setFunFacts] = useState<string[]>(DEFAULT_FUN_FACTS)
  const [currentFact, setCurrentFact] = useState(0)
  const [currentRegistrant, setCurrentRegistrant] = useState(0)
  const [registrationUrl, setRegistrationUrl] = useState('/register')

  // Fetch initial stats
  const fetchStats = async () => {
    try {
      const [total, bySatellite, earlyBirdCount, recentRegistrants] = await Promise.all([
        getAttendeeCount(),
        getStatsBySatellite(),
        getEarlyBirdCount(),
        getRecentRegistrants({ data: 10 }),
      ])

      setStats({
        total,
        bySatellite,
        earlyBirdCount,
        recentRegistrants,
      })
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  // Fetch fun facts from database
  const fetchFunFacts = async () => {
    try {
      const facts = await getFunFacts({ data: false })
      if (facts.length > 0) {
        setFunFacts(facts.map((f) => f.content))
      }
    } catch (error) {
      console.error('Failed to fetch fun facts:', error)
      // Keep default fun facts on error
    }
  }

  // Set registration URL on client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setRegistrationUrl(`${window.location.origin}/register`)
    }
  }, [])

  // Initial fetch and polling
  useEffect(() => {
    fetchStats()
    fetchFunFacts()

    const interval = setInterval(fetchStats, DISPLAY_REFRESH_INTERVAL)
    const funFactsInterval = setInterval(fetchFunFacts, 60000) // Refresh fun facts every minute
    return () => {
      clearInterval(interval)
      clearInterval(funFactsInterval)
    }
  }, [])

  // Realtime subscription for immediate updates
  useEffect(() => {
    const channel = supabase
      .channel('attendees-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendees' },
        () => {
          // Refresh stats on any change
          fetchStats()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Rotate fun facts
  useEffect(() => {
    if (funFacts.length === 0) return
    const interval = setInterval(() => {
      setCurrentFact((prev) => (prev + 1) % funFacts.length)
    }, FUN_FACTS_INTERVAL)

    return () => clearInterval(interval)
  }, [funFacts.length])

  // Rotate recent registrants
  useEffect(() => {
    if (stats.recentRegistrants.length === 0) return
    const interval = setInterval(() => {
      setCurrentRegistrant((prev) => (prev + 1) % stats.recentRegistrants.length)
    }, RECENT_REGISTRANTS_INTERVAL)

    return () => clearInterval(interval)
  }, [stats.recentRegistrants.length])

  // Calculate max for progress bars
  const maxSatellite = Math.max(...Object.values(stats.bySatellite), 1)

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A0A0E] via-[#2D1218] to-[#1A0A0E] text-white overflow-hidden">
      {/* Header */}
      <header className="py-6 text-center">
        <div className="flex items-center justify-center gap-4 mb-4">
          <img
            src={LOGO_PATH}
            alt="NEXTLEVEL Stronger 2026"
            className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover shadow-lg shadow-red-900/50"
          />
          <div className="text-left">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight">
              <span className="text-white">next</span>
              <span className="text-red-500">level</span>
            </h1>
            <p className="text-xl md:text-2xl text-red-300 font-semibold tracking-wider">
              STR<span className="text-white">&gt;&gt;</span>NGER 2026
            </p>
          </div>
        </div>
        <p className="text-red-400 text-lg">{EVENT_TITLE}</p>
        <p className="text-red-500/70 text-sm">{EVENT_DATES} | {EVENT_VENUE}</p>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left Side - QR Code */}
          <div className="flex flex-col items-center justify-center">
            <div className="bg-white p-6 rounded-3xl shadow-2xl shadow-red-900/30">
              <QRCodeSVG
                value={registrationUrl}
                size={280}
                level="H"
                includeMargin={false}
                className="rounded-lg"
                fgColor="#8B1538"
              />
            </div>
            <p className="mt-6 text-2xl font-semibold text-red-300">
              Scan to Register!
            </p>
            <p className="text-red-500/50 text-sm mt-2">{registrationUrl}</p>
          </div>

          {/* Right Side - Stats */}
          <div className="space-y-6">
            {/* Total Count */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-red-900/30">
              <h2 className="text-xl text-red-400 mb-2">Total Registered</h2>
              <p className="text-7xl font-black text-white">
                {stats.total}
              </p>
            </div>

            {/* By Satellite */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-red-900/30">
              <h2 className="text-xl text-red-400 mb-4">By Satellite</h2>
              <div className="space-y-4">
                {Object.entries(stats.bySatellite).map(([name, count]) => (
                  <div key={name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-red-200">{name}</span>
                      <span className="font-bold text-white">{count}</span>
                    </div>
                    <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#8B1538] to-[#DC2626] rounded-full transition-all duration-500"
                        style={{
                          width: `${(count / maxSatellite) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Early Birds */}
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-red-900/30">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl text-red-400">Early Birds</h2>
                  <p className="text-xs text-red-500/50">(Before 9:00 AM)</p>
                </div>
                <p className="text-4xl font-bold text-yellow-400">
                  {stats.earlyBirdCount}
                </p>
              </div>
            </div>

            {/* Recent Registrations - Cycling Names */}
            {stats.recentRegistrants.length > 0 && (
              <div className="bg-gradient-to-r from-[#8B1538]/30 to-[#DC2626]/30 backdrop-blur-sm rounded-2xl p-6 border border-red-500/30">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">🎉</span>
                  <div>
                    <p className="text-red-400 text-sm">Welcome to NEXTLEVEL!</p>
                    <p className="text-2xl font-bold text-white transition-all duration-500">
                      {stats.recentRegistrants[currentRegistrant]?.name}
                    </p>
                  </div>
                </div>
                {/* Progress dots */}
                <div className="flex justify-center gap-1.5 mt-2">
                  {stats.recentRegistrants.slice(0, 10).map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        index === currentRegistrant
                          ? 'bg-yellow-400 scale-125'
                          : 'bg-white/30'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Fun Fact Ticker */}
        {funFacts.length > 0 && (
          <div className="mt-8 bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-red-900/30">
            <p className="text-center text-red-200 text-lg transition-all duration-500">
              <span className="text-yellow-400 font-semibold">Did you know?</span>{' '}
              {funFacts[currentFact % funFacts.length]}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
