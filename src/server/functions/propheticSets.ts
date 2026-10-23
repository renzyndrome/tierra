// Prophetic word sets: word lists saved ahead of a service (Admin → Attendance
// → Prophetic words). Staff pick one when creating a session, or later on the
// session page; picking copies the words onto the session, so editing a set
// never changes a past service. Same permissions as sessions:
// registration.read to list, registration.write to change.

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { createServerAdminClient } from '../../lib/supabase'
import { requirePermission } from './_authGuard'
import { propheticWordListSchema } from '../../lib/propheticSchemas'
import { asWordList, type PropheticWordList } from '../../lib/propheticWord'
import type { PropheticWordSetSummary } from '../../lib/types'
import { loadSetWords, storedWordList } from './_propheticSetStore'

const SET_COLUMNS =
  'id, title, service_type_id, service_date, words, is_archived, updated_at, service_type:service_types!prophetic_word_sets_service_type_id_fkey(name)'

interface SetRow {
  id: string
  title: string
  service_type_id: string | null
  service_date: string | null
  words: unknown
  is_archived: boolean
  updated_at: string
  service_type?: { name: string } | null
}

function summarize(row: SetRow): PropheticWordSetSummary {
  const list = asWordList(row.words)
  return {
    id: row.id,
    title: row.title,
    service_type_id: row.service_type_id,
    service_type_name: row.service_type?.name ?? null,
    service_date: row.service_date,
    reference: list?.reference ?? '',
    word_count: list?.words.length ?? 0,
    is_archived: row.is_archived,
    updated_at: row.updated_at,
  }
}

export const getPropheticSets = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string; includeArchived?: boolean }) =>
    z.object({ accessToken: z.string(), includeArchived: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<PropheticWordSetSummary[]> => {
    await requirePermission(data.accessToken, 'registration.read')
    const admin = createServerAdminClient()
    let query = admin
      .from('prophetic_word_sets')
      .select(SET_COLUMNS)
      .order('service_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200)
    if (!data.includeArchived) query = query.eq('is_archived', false)
    const { data: rows, error } = await query
    if (error) {
      console.error('Error listing prophetic word sets:', error)
      throw new Error('Word sets not loaded. Retry.')
    }
    return ((rows ?? []) as unknown as SetRow[]).map(summarize)
  })

export const getPropheticSet = createServerFn({ method: 'GET' })
  .inputValidator((input: { accessToken: string; setId: string }) =>
    z.object({ accessToken: z.string(), setId: z.string().uuid() }).parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<{ summary: PropheticWordSetSummary; list: PropheticWordList } | null> => {
      await requirePermission(data.accessToken, 'registration.read')
      const admin = createServerAdminClient()
      const { data: row, error } = await admin
        .from('prophetic_word_sets')
        .select(SET_COLUMNS)
        .eq('id', data.setId)
        .maybeSingle()
      if (error) {
        console.error('Error loading prophetic word set:', error)
        throw new Error('Word set not loaded. Retry.')
      }
      const list = asWordList((row as SetRow | null)?.words)
      return row && list ? { summary: summarize(row as unknown as SetRow), list } : null
    },
  )

const saveSetSchema = z.object({
  accessToken: z.string(),
  setId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1, 'Title required.').max(120),
  serviceTypeId: z.string().uuid().optional().nullable(),
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalid.')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  list: propheticWordListSchema,
})

// Create a set (no setId) or replace an existing set's title, service, date
// and words.
export const savePropheticSet = createServerFn({ method: 'POST' })
  .inputValidator((input: z.input<typeof saveSetSchema>) => saveSetSchema.parse(input))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const caller = await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const fields = {
      title: data.title,
      service_type_id: data.serviceTypeId ?? null,
      service_date: data.serviceDate ?? null,
      words: storedWordList(data.list),
    }
    const { data: row, error } = data.setId
      ? await admin
          .from('prophetic_word_sets')
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', data.setId)
          .select('id')
          .single()
      : await admin
          .from('prophetic_word_sets')
          .insert({ ...fields, created_by: caller.userId })
          .select('id')
          .single()
    if (error || !row) {
      console.error('Error saving prophetic word set:', error)
      throw new Error('Word set not saved. Retry.')
    }
    return { id: (row as { id: string }).id }
  })

// Archive a set (hidden from the session dropdown) or restore it.
export const setPropheticSetArchived = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; setId: string; archived: boolean }) =>
    z.object({ accessToken: z.string(), setId: z.string().uuid(), archived: z.boolean() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const { error } = await admin
      .from('prophetic_word_sets')
      .update({ is_archived: data.archived, updated_at: new Date().toISOString() })
      .eq('id', data.setId)
    if (error) {
      console.error('Error archiving prophetic word set:', error)
      throw new Error('Word set not updated. Retry.')
    }
    return { success: true }
  })

// Copy a set's words onto a session (replaces the session's current list).
export const applyPropheticSetToSession = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; sessionId: string; setId: string }) =>
    z.object({ accessToken: z.string(), sessionId: z.string().uuid(), setId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const words = await loadSetWords(admin, data.setId)
    const { data: updated, error } = await admin
      .from('service_sessions')
      .update({ prophetic_words: words, prophetic_set_id: data.setId })
      .eq('id', data.sessionId)
      .select('id')
      .maybeSingle()
    if (error) {
      console.error('Error applying prophetic word set:', error)
      throw new Error('Word set not applied. Retry.')
    }
    if (!updated) throw new Error('Session not found.')
    return { success: true }
  })

// Delete a set for good. Sessions keep the words already copied onto them.
export const deletePropheticSet = createServerFn({ method: 'POST' })
  .inputValidator((input: { accessToken: string; setId: string }) =>
    z.object({ accessToken: z.string(), setId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    await requirePermission(data.accessToken, 'registration.write')
    const admin = createServerAdminClient()
    const { error } = await admin.from('prophetic_word_sets').delete().eq('id', data.setId)
    if (error) {
      console.error('Error deleting prophetic word set:', error)
      throw new Error('Word set not deleted. Retry.')
    }
    return { success: true }
  })
