// Admin — Prophetic word sets: word lists saved ahead of a service. Staff
// import a file (PDF, Word, Excel, CSV, text) or paste, review the words, and
// give the set a title and the service and date it is for. The create-session
// dialog preselects the set for that service and date; picking a set copies its
// words onto the session.

import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../components/AuthProvider'
import { AdminRoute } from '../../../components/ProtectedRoute'
import { PropheticImportDialog } from '../../../components/PropheticImportDialog'
import { Card, CardContent } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { getServiceTypes } from '../../../server/functions/attendance'
import {
  deletePropheticSet,
  getPropheticSet,
  getPropheticSets,
  savePropheticSet,
  setPropheticSetArchived,
} from '../../../server/functions/propheticSets'
import { hasPermission } from '../../../lib/auth'
import type { PropheticWordList } from '../../../lib/propheticWord'
import type { PropheticWordSetSummary, ServiceType } from '../../../lib/types'

export const Route = createFileRoute('/admin/attendance/words')({
  component: () => (
    <AdminRoute requiredPermissions={['registration.read']}>
      <PropheticSetsPage />
    </AdminRoute>
  ),
})

function formatDate(date: string | null): string {
  if (!date) return 'No date'
  const d = new Date(`${date}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// The set being edited: null fields for a new set.
interface Editing {
  setId: string | null
  title: string
  serviceTypeId: string
  serviceDate: string
  list: PropheticWordList | null
}

function PropheticSetsPage() {
  const { profile, session } = useAuth()
  const accessToken = session?.access_token
  const canWrite = profile ? hasPermission(profile.role, 'registration.write') : false

  const [sets, setSets] = useState<PropheticWordSetSummary[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)

  const load = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [list, types] = await Promise.all([
        getPropheticSets({ data: { accessToken, includeArchived: showArchived } }),
        getServiceTypes({ data: { accessToken } }),
      ])
      setSets(list)
      setServiceTypes(types)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word sets not loaded. Retry.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, showArchived])

  useEffect(() => {
    load()
  }, [load])

  const run = async (setId: string, action: () => Promise<unknown>) => {
    setBusyId(setId)
    setError('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word set not updated. Retry.')
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = async (set: PropheticWordSetSummary) => {
    if (!accessToken) return
    setBusyId(set.id)
    setError('')
    try {
      const full = await getPropheticSet({ data: { accessToken, setId: set.id } })
      if (!full) throw new Error('Word set not found.')
      setEditing({
        setId: set.id,
        title: set.title,
        serviceTypeId: set.service_type_id ?? '',
        serviceDate: set.service_date ?? '',
        list: full.list,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Word set not loaded. Retry.')
    } finally {
      setBusyId(null)
    }
  }

  const visible = sets.filter((s) => s.is_archived === showArchived)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-gray-500 mb-1">
              <Link to="/admin/attendance" className="hover:text-[#8B1538]">Service Attendance</Link>
              <span className="mx-1">/</span>
              <span className="text-gray-900">Prophetic words</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Prophetic word sets</h1>
            <p className="mt-1 text-sm text-gray-500">
              Saved per service. A new session for the same service and date starts with its set.
            </p>
          </div>
          {canWrite && (
            <Button
              onClick={() => setEditing({ setId: null, title: '', serviceTypeId: '', serviceDate: '', list: null })}
              className="bg-[#8B1538] hover:bg-[#6B0F2B]"
            >
              New word set
            </Button>
          )}
        </div>

        <div className="mb-4 flex gap-2" role="tablist" aria-label="Word set list">
          {[false, true].map((archived) => (
            <button
              key={String(archived)}
              type="button"
              role="tab"
              aria-selected={showArchived === archived}
              onClick={() => setShowArchived(archived)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                showArchived === archived ? 'bg-[#8B1538] text-white' : 'bg-white text-gray-700 ring-1 ring-gray-200'
              }`}
            >
              {archived ? 'Archived' : 'Active'}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-gray-500">
              {showArchived ? 'No archived word sets.' : 'No word sets yet.'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((set) => (
              <Card key={set.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{set.title}</p>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {[
                        set.service_type_name ?? 'Any service',
                        formatDate(set.service_date),
                        `${set.word_count} words`,
                        set.reference || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!set.is_archived && (
                        <Button size="sm" variant="outline" disabled={busyId === set.id} onClick={() => startEdit(set)}>
                          Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === set.id}
                        onClick={() =>
                          accessToken &&
                          run(set.id, () =>
                            setPropheticSetArchived({ data: { accessToken, setId: set.id, archived: !set.is_archived } }),
                          )
                        }
                      >
                        {set.is_archived ? 'Restore' : 'Archive'}
                      </Button>
                      {set.is_archived && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === set.id}
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            if (!accessToken) return
                            if (!window.confirm(`Delete "${set.title}" for good. Sessions keep their words.`)) return
                            run(set.id, () => deletePropheticSet({ data: { accessToken, setId: set.id } }))
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {editing && accessToken && (
        <SetDialog
          accessToken={accessToken}
          editing={editing}
          serviceTypes={serviceTypes}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

interface SetDialogProps {
  accessToken: string
  editing: Editing
  serviceTypes: ServiceType[]
  onClose: () => void
  onSaved: () => Promise<void>
}

function SetDialog({ accessToken, editing, serviceTypes, onClose, onSaved }: SetDialogProps) {
  const [title, setTitle] = useState(editing.title)
  const [serviceTypeId, setServiceTypeId] = useState(editing.serviceTypeId)
  const [serviceDate, setServiceDate] = useState(editing.serviceDate)
  const field = 'mt-1 h-11 sm:h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-base md:text-sm focus:ring-2 focus:ring-[#8B1538] outline-none'

  return (
    <PropheticImportDialog
      title={editing.setId ? 'Edit word set' : 'New word set'}
      current={editing.list}
      onClose={onClose}
      extraValid={title.trim().length > 0}
      onRead={(parsed, fileName) => {
        // Suggest a title from the passage, else the file name.
        if (title.trim()) return
        setTitle((parsed.reference || fileName?.replace(/\.[^.]+$/, '') || '').slice(0, 120))
      }}
      onSave={async (list) => {
        await savePropheticSet({
          data: {
            accessToken,
            setId: editing.setId,
            title: title.trim(),
            serviceTypeId: serviceTypeId || null,
            serviceDate: serviceDate || null,
            list,
          },
        })
        await onSaved()
      }}
      extra={
        <div className="grid gap-3 rounded-md bg-gray-50 p-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label htmlFor="set-title">Title</Label>
            <Input
              id="set-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Young Pro: Nehemiah 2:17-18"
              maxLength={120}
              className="mt-1 h-11 sm:h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="set-service">Service</Label>
            <select
              id="set-service"
              value={serviceTypeId}
              onChange={(e) => setServiceTypeId(e.target.value)}
              className={field}
            >
              <option value="">Any service</option>
              {serviceTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="set-date">Date</Label>
            <Input
              id="set-date"
              type="date"
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className="mt-1 h-11 sm:h-9"
            />
          </div>
        </div>
      }
    />
  )
}
