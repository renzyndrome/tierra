// Admin — Service Attendance analytics: trends, per-service / per-satellite
// breakdowns, first-timer detection, and top attendees.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
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
  Legend,
} from 'recharts'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { getAttendanceStats, getServiceTypes } from '../../../server/functions/attendance'
import type { AttendanceStats, ServiceType } from '../../../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'

export const Route = createFileRoute('/admin/attendance/analytics')({
  component: () => (
    <AdminRoute requiredPermissions={['registration.read']}>
      <AttendanceAnalytics />
    </AdminRoute>
  ),
})

function shortDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function StatTile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`text-3xl font-bold ${tone ?? 'text-[#8B1538]'}`}>{value}</p>
        <p className="text-sm text-gray-500 mt-1">{label}</p>
      </CardContent>
    </Card>
  )
}

function AttendanceAnalytics() {
  const { session } = useAuth()
  const accessToken = session?.access_token

  const [stats, setStats] = useState<AttendanceStats | null>(null)
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [serviceFilter, setServiceFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [s, types] = await Promise.all([
        getAttendanceStats({
          data: { accessToken, serviceTypeId: serviceFilter || undefined },
        }),
        getServiceTypes({ data: { accessToken } }),
      ])
      setStats(s)
      setServiceTypes(types)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [accessToken, serviceFilter])

  useEffect(() => {
    load()
  }, [load])

  const trendData =
    stats?.trend.map((t) => ({
      name: shortDate(t.session_date),
      Attendance: t.count,
      'First-timers': t.first_timers,
    })) ?? []

  const serviceData =
    stats?.byService.map((s) => ({ name: s.service_name, Attendance: s.count })) ?? []

  const satelliteData =
    stats?.bySatellite.map((s) => ({ name: s.satellite_name, Attendance: s.count })) ?? []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Link to="/admin/attendance" className="hover:text-[#8B1538]">Attendance</Link>
              <span>/</span>
              <span>Analytics</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Analytics</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[#8B1538] outline-none text-sm"
            >
              <option value="">All services</option>
              {serviceTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <Link to="/admin/attendance"><Button variant="outline">Back</Button></Link>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading analytics…</div>
        ) : !stats || stats.totalCheckins === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-gray-500">
              No attendance data yet. Once check-ins come in, analytics will appear here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Stat tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatTile label="Total check-ins" value={stats.totalCheckins} />
              <StatTile label="Unique members" value={stats.uniqueMembers} />
              <StatTile
                label="Matched"
                value={`${stats.totalCheckins > 0 ? Math.round((stats.matchedCheckins / stats.totalCheckins) * 100) : 0}%`}
                tone="text-green-600"
              />
              <StatTile
                label="Needs review"
                value={stats.pendingCount}
                tone={stats.pendingCount > 0 ? 'text-amber-600' : 'text-gray-400'}
              />
            </div>

            {/* Trend */}
            <Card>
              <CardHeader><CardTitle>Attendance trend</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="name" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Attendance" stroke="#8B1538" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="First-timers" stroke="#DC2626" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* By service */}
              <Card>
                <CardHeader><CardTitle>By service</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serviceData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={12} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="Attendance" fill="#8B1538" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* By satellite */}
              <Card>
                <CardHeader><CardTitle>By satellite</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={satelliteData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis dataKey="name" fontSize={11} />
                        <YAxis fontSize={12} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="Attendance" fill="#B91C3C" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top attendees */}
            {stats.topAttendees.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Most consistent attendees</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    {stats.topAttendees.map((a, i) => (
                      <div key={a.member_id} className="flex items-center justify-between py-1.5 border-b last:border-0 border-gray-100">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-[#8B1538]/10 text-[#8B1538] text-xs font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <Link
                            to="/directory/members/$memberId"
                            params={{ memberId: a.member_id }}
                            className="font-medium text-gray-800 hover:text-[#8B1538]"
                          >
                            {a.name}
                          </Link>
                        </div>
                        <span className="text-sm text-gray-500">{a.count} services</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
