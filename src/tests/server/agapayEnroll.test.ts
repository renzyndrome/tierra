// Tests for the Agapay stage-change audit and enrollment check
// (src/server/agapayEnroll.ts) with a scripted fake client that records
// discipleship-schema queries and RPC calls.

import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ createServerAdminClient: vi.fn() }))

import {
  clearDisciplerIfCircleLeader,
  DIRECTORY_STAGE_CHANGE_NOTE,
  enrollInAgapayIfEligible,
  hasAgapayEnrollment,
  recordAgapayStageChange,
  setDisciplerIfEmpty,
} from '../../server/agapayEnroll'

interface Call {
  schema: string
  table: string
  op: 'select' | 'insert' | 'rpc'
  payload: unknown
}

type Responder = (c: Call) => { data: unknown; error: unknown }

function fakeClient(respond: Responder) {
  const calls: Call[] = []
  const thenable = (call: Call) => ({
    then: (resolve: (v: unknown) => void) => resolve(respond(call)),
  })
  const schemaClient = (schema: string) => ({
    from(table: string) {
      const call: Call = { schema, table, op: 'select', payload: null }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'maybeSingle', 'single']) builder[m] = () => builder
      builder.insert = (payload: unknown) => {
        call.op = 'insert'
        call.payload = payload
        return builder
      }
      builder.then = (resolve: (v: unknown) => void) => resolve(respond(call))
      return builder
    },
    rpc(fn: string, args: unknown) {
      const call: Call = { schema, table: fn, op: 'rpc', payload: args }
      calls.push(call)
      return thenable(call)
    },
  })
  const client = { schema: schemaClient }
  return { client: client as never, calls }
}

const enrolled: Responder = (c) =>
  c.op === 'select' ? { data: { id: 'disciple-1' }, error: null } : { data: null, error: null }

describe('recordAgapayStageChange', () => {
  it('writes the audit row and snapshots the checklist for an enrolled member', async () => {
    const { client, calls } = fakeClient(enrolled)
    const result = await recordAgapayStageChange(client, 'member-1', 'Newbie', 'Growing', 'user-1')
    expect(result).toBe('recorded')
    expect(calls.every((c) => c.schema === 'discipleship')).toBe(true)
    const insert = calls.find((c) => c.op === 'insert')!
    expect(insert.table).toBe('stage_transitions')
    expect(insert.payload).toEqual({
      disciple_id: 'disciple-1',
      from_stage: 'Newbie',
      to_stage: 'Growing',
      note: DIRECTORY_STAGE_CHANGE_NOTE,
      created_by: 'user-1',
    })
    expect(DIRECTORY_STAGE_CHANGE_NOTE).toBe('Changed in the directory app')
    const rpc = calls.find((c) => c.op === 'rpc')!
    expect(rpc.table).toBe('snapshot_checklist')
    expect(rpc.payload).toEqual({ p_disciple: 'disciple-1', p_stage_db: 'Growing' })
  })

  it('writes nothing for a member not enrolled in Agapay', async () => {
    const { client, calls } = fakeClient(() => ({ data: null, error: null }))
    expect(await recordAgapayStageChange(client, 'member-1', 'Newbie', 'Growing', null)).toBe('not_enrolled')
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('still snapshots the checklist when the audit row fails, and reports failed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, calls } = fakeClient((c) =>
      c.op === 'insert' ? { data: null, error: { message: 'denied' } } : enrolled(c),
    )
    expect(await recordAgapayStageChange(client, 'member-1', 'Newbie', 'Growing', null)).toBe('failed')
    expect(calls.some((c) => c.op === 'rpc')).toBe(true)
    spy.mockRestore()
  })

  it('never throws on a failed read', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(() => ({ data: null, error: { message: 'down' } }))
    await expect(recordAgapayStageChange(client, 'member-1', 'Newbie', 'Growing', null)).resolves.toBe('failed')
    spy.mockRestore()
  })
})

describe('hasAgapayEnrollment', () => {
  it('is true with a disciple_profiles row and false without', async () => {
    expect(await hasAgapayEnrollment(fakeClient(enrolled).client, 'member-1')).toBe(true)
    expect(await hasAgapayEnrollment(fakeClient(() => ({ data: null, error: null })).client, 'member-1')).toBe(false)
  })

  it('throws on a failed read', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'down' } }))
    await expect(hasAgapayEnrollment(client, 'member-1')).rejects.toBeTruthy()
  })
})

// ============================================
// Public + discipleship schema fake, for enrollment and discipler helpers
// ============================================

interface Query {
  schema: string
  table: string
  op: 'select' | 'insert' | 'update' | 'rpc'
  payload: unknown
  calls: [string, unknown[]][]
}

type QueryResponder = (q: Query) => { data: unknown; error: unknown }

function fakeAdmin(respond: QueryResponder) {
  const queries: Query[] = []
  const builderFor = (schema: string, table: string) => {
    const q: Query = { schema, table, op: 'select', payload: null, calls: [] }
    queries.push(q)
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'limit', 'maybeSingle', 'single']) {
      builder[m] = (...args: unknown[]) => {
        q.calls.push([m, args])
        return builder
      }
    }
    builder.insert = (payload: unknown) => {
      q.op = 'insert'
      q.payload = payload
      return builder
    }
    builder.update = (payload: unknown) => {
      q.op = 'update'
      q.payload = payload
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) => resolve(respond(q))
    return builder
  }
  const client = {
    from: (table: string) => builderFor('public', table),
    schema: (schema: string) => ({
      from: (table: string) => builderFor(schema, table),
      rpc(fn: string, args: unknown) {
        const q: Query = { schema, table: fn, op: 'rpc', payload: args, calls: [] }
        queries.push(q)
        return { then: (resolve: (v: unknown) => void) => resolve(respond(q)) }
      },
    }),
  }
  return { client: client as never, queries }
}

const ELIGIBLE = { id: 'member-1', discipleship_stage: 'Growing', discipler_id: 'disc-1', joined_date: '2026-04-02', is_archived: false }

/** Default world: eligible member, enrolled (profile disciple-1), checklist present. */
function enrollWorld(overrides: Partial<Record<string, QueryResponder>> = {}): QueryResponder {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    if (key === 'members:select') return { data: ELIGIBLE, error: null }
    if (key === 'disciple_profiles:select') return { data: { id: 'disciple-1' }, error: null }
    if (key === 'disciple_checklist_items:select') return { data: [{ id: 'item-1' }], error: null }
    if (key === 'disciple_profiles:insert') return { data: { id: 'disciple-new' }, error: null }
    return { data: null, error: null }
  }
}

describe('enrollInAgapayIfEligible', () => {
  it('leaves an enrolled member with a checklist alone', async () => {
    const { client, queries } = fakeAdmin(enrollWorld())
    expect(await enrollInAgapayIfEligible(client, 'member-1', 'user-1', 'directory')).toBe('already_enrolled')
    expect(queries.filter((q) => q.op !== 'select')).toHaveLength(0)
  })

  it('repairs an enrolled member with no checklist items', async () => {
    const { client, queries } = fakeAdmin(
      enrollWorld({ 'disciple_checklist_items:select': () => ({ data: [], error: null }) }),
    )
    expect(await enrollInAgapayIfEligible(client, 'member-1', 'user-1', 'directory')).toBe('repaired')
    const writes = queries.filter((q) => q.op !== 'select')
    expect(writes).toHaveLength(1)
    expect(writes[0].table).toBe('snapshot_checklist')
    expect(writes[0].payload).toEqual({ p_disciple: 'disciple-1', p_stage_db: 'Growing' })
  })

  it('reports a failed repair as failed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeAdmin(
      enrollWorld({
        'disciple_checklist_items:select': () => ({ data: [], error: null }),
        'snapshot_checklist:rpc': () => ({ data: null, error: { message: 'denied' } }),
      }),
    )
    expect(await enrollInAgapayIfEligible(client, 'member-1', null, 'directory')).toBe('failed')
    spy.mockRestore()
  })

  it('reports a failed checklist read as failed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeAdmin(
      enrollWorld({ 'disciple_checklist_items:select': () => ({ data: null, error: { message: 'down' } }) }),
    )
    expect(await enrollInAgapayIfEligible(client, 'member-1', null, 'directory')).toBe('failed')
    spy.mockRestore()
  })

  it('enrolls a new member: profile, audit row, checklist', async () => {
    const { client, queries } = fakeAdmin(
      enrollWorld({ 'disciple_profiles:select': () => ({ data: null, error: null }) }),
    )
    expect(await enrollInAgapayIfEligible(client, 'member-1', 'user-1', 'directory')).toBe('enrolled')
    expect(queries.filter((q) => q.op !== 'select').map((q) => q.table)).toEqual([
      'disciple_profiles',
      'stage_transitions',
      'snapshot_checklist',
    ])
  })

  it('reports a new enrollment whose checklist snapshot failed as failed', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeAdmin(
      enrollWorld({
        'disciple_profiles:select': () => ({ data: null, error: null }),
        'snapshot_checklist:rpc': () => ({ data: null, error: { message: 'denied' } }),
      }),
    )
    expect(await enrollInAgapayIfEligible(client, 'member-1', null, 'directory')).toBe('failed')
    spy.mockRestore()
  })

  it('skips archived members and members without a discipler', async () => {
    for (const member of [{ ...ELIGIBLE, is_archived: true }, { ...ELIGIBLE, discipler_id: null }]) {
      const { client, queries } = fakeAdmin(enrollWorld({ 'members:select': () => ({ data: member, error: null }) }))
      expect(await enrollInAgapayIfEligible(client, 'member-1', null, 'directory')).toBe('not_eligible')
      expect(queries.every((q) => q.schema === 'public')).toBe(true)
    }
  })
})

describe('setDisciplerIfEmpty', () => {
  const circle = (group: unknown): QueryResponder => (q) =>
    q.table === 'cell_groups' ? { data: group, error: null } : { data: null, error: null }

  it('sets the leader, only where the discipler is empty', async () => {
    const { client, queries } = fakeAdmin(circle({ leader_id: 'leader-1', co_leader_id: 'co-1' }))
    await setDisciplerIfEmpty(client, 'member-1', 'circle-1')
    const update = queries.find((q) => q.op === 'update')!
    expect(update.payload).toEqual({ discipler_id: 'leader-1' })
    expect(update.calls).toContainEqual(['eq', ['id', 'member-1']])
    expect(update.calls).toContainEqual(['is', ['discipler_id', null]])
  })

  it('falls back to the co-leader in a circle with no leader', async () => {
    const { client, queries } = fakeAdmin(circle({ leader_id: null, co_leader_id: 'co-1' }))
    await setDisciplerIfEmpty(client, 'member-1', 'circle-1')
    expect(queries.find((q) => q.op === 'update')!.payload).toEqual({ discipler_id: 'co-1' })
  })

  it('writes nothing for a circle with neither, or when the member is the co-leader', async () => {
    for (const group of [{ leader_id: null, co_leader_id: null }, { leader_id: null, co_leader_id: 'member-1' }]) {
      const { client, queries } = fakeAdmin(circle(group))
      await setDisciplerIfEmpty(client, 'member-1', 'circle-1')
      expect(queries.some((q) => q.op === 'update')).toBe(false)
    }
  })
})

describe('clearDisciplerIfCircleLeader', () => {
  const circle = (group: unknown): QueryResponder => (q) =>
    q.table === 'cell_groups' ? { data: group, error: null } : { data: null, error: null }

  it('clears a discipler who is the leader or the co-leader, in one conditional update', async () => {
    const { client, queries } = fakeAdmin(circle({ leader_id: 'leader-1', co_leader_id: 'co-1' }))
    await clearDisciplerIfCircleLeader(client, 'member-1', 'circle-1')
    const update = queries.find((q) => q.op === 'update')!
    expect(update.payload).toEqual({ discipler_id: null })
    expect(update.calls).toContainEqual(['eq', ['id', 'member-1']])
    expect(update.calls).toContainEqual(['in', ['discipler_id', ['leader-1', 'co-1']]])
  })

  it('covers the co-leader of a circle with no leader', async () => {
    const { client, queries } = fakeAdmin(circle({ leader_id: null, co_leader_id: 'co-1' }))
    await clearDisciplerIfCircleLeader(client, 'member-1', 'circle-1')
    expect(queries.find((q) => q.op === 'update')!.calls).toContainEqual(['in', ['discipler_id', ['co-1']]])
  })

  it('writes nothing for a circle with no leader or co-leader', async () => {
    const { client, queries } = fakeAdmin(circle({ leader_id: null, co_leader_id: null }))
    await clearDisciplerIfCircleLeader(client, 'member-1', 'circle-1')
    expect(queries.some((q) => q.op === 'update')).toBe(false)
  })
})

describe('teams (cell_groups.is_team): no discipler set or cleared', () => {
  const team: QueryResponder = (q) =>
    q.table === 'cell_groups'
      ? { data: { leader_id: 'leader-1', co_leader_id: 'co-1', is_team: true }, error: null }
      : { data: null, error: null }

  it('setDisciplerIfEmpty reads is_team and writes nothing for a team', async () => {
    const { client, queries } = fakeAdmin(team)
    await setDisciplerIfEmpty(client, 'member-1', 'team-1')
    expect(queries.find((q) => q.table === 'cell_groups')!.calls).toContainEqual(['select', ['leader_id, co_leader_id, is_team']])
    expect(queries.some((q) => q.op === 'update')).toBe(false)
  })

  it('clearDisciplerIfCircleLeader reads is_team and writes nothing for a team', async () => {
    const { client, queries } = fakeAdmin(team)
    await clearDisciplerIfCircleLeader(client, 'member-1', 'team-1')
    expect(queries.find((q) => q.table === 'cell_groups')!.calls).toContainEqual(['select', ['leader_id, co_leader_id, is_team']])
    expect(queries.some((q) => q.op === 'update')).toBe(false)
  })
})
