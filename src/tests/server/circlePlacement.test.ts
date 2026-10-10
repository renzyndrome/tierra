// Tests for the shared circle placement helper (src/server/circlePlacement.ts)
// with a scripted fake client: each query is recorded, and its response comes
// from a per-test responder keyed on table and operation.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ createServerAdminClient: vi.fn() }))

const enrollInAgapayIfEligible = vi.fn(async () => 'enrolled')
const setDisciplerIfEmpty = vi.fn(async () => undefined)
vi.mock('../../server/agapayEnroll', () => ({
  enrollInAgapayIfEligible: (...args: unknown[]) => enrollInAgapayIfEligible(...(args as [])),
  setDisciplerIfEmpty: (...args: unknown[]) => setDisciplerIfEmpty(...(args as [])),
}))

import {
  CIRCLE_ADD_FAILED,
  CIRCLE_ALREADY_IN,
  CIRCLE_NOT_IN,
  CIRCLE_ROLE_FAILED,
  changeMemberCircleRole,
  endPlainRowsInAnotherCircle,
  moveDisciplesToNewLeader,
  placeMemberInCircle,
} from '../../server/circlePlacement'
import { CIRCLE_LEADER_AS_MEMBER, MEMBER_ARCHIVED_REFUSAL } from '../../lib/circleRules'

interface Query {
  table: string
  op: 'select' | 'update' | 'insert'
  payload: unknown
  calls: [string, unknown[]][]
}

type Responder = (q: Query) => { data: unknown; error: unknown }

function fakeClient(respond: Responder) {
  const queries: Query[] = []
  const client = {
    from(table: string) {
      const q: Query = { table, op: 'select', payload: null, calls: [] }
      queries.push(q)
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'is', 'in', 'order', 'range', 'maybeSingle', 'single']) {
        builder[m] = (...args: unknown[]) => {
          q.calls.push([m, args])
          return builder
        }
      }
      builder.update = (payload: unknown) => {
        q.op = 'update'
        q.payload = payload
        return builder
      }
      builder.insert = (payload: unknown) => {
        q.op = 'insert'
        q.payload = payload
        return builder
      }
      builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
        try {
          resolve(respond(q))
        } catch (err) {
          reject(err)
        }
      }
      return builder
    },
  }
  return { client: client as never, queries }
}

const MEMBER = 'member-1'
const CIRCLE = 'circle-1'
const LEADER = 'leader-1'

/** Default world: no existing row, circle led by LEADER, member free. */
function world(overrides: Partial<Record<string, (q: Query) => { data: unknown; error: unknown }>> = {}): Responder {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    if (key === 'member_cell_groups:select') {
      // existing-row check selects 'id, is_active'; rule check selects memberships
      const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
      return { data: sel === 'id, is_active' ? null : [], error: null }
    }
    if (key === 'cell_groups:select') return { data: { leader_id: LEADER, co_leader_id: null }, error: null }
    if (key === 'members:select') return { data: { discipler_id: null, name: 'Someone' }, error: null }
    if (key === 'member_cell_groups:insert') return { data: { id: 'row-new', ...(q.payload as object) }, error: null }
    if (key === 'member_cell_groups:update') return { data: { id: 'row-old', ...(q.payload as object) }, error: null }
    return { data: null, error: null }
  }
}

const writes = (queries: Query[]) => queries.filter((q) => q.op !== 'select')

beforeEach(() => {
  enrollInAgapayIfEligible.mockClear()
  setDisciplerIfEmpty.mockClear()
})

describe('placeMemberInCircle', () => {
  it('inserts a plain member, then sets the discipler and enrolls', async () => {
    const { client, queries } = fakeClient(world())
    const result = await placeMemberInCircle(client, {
      memberId: MEMBER,
      cellGroupId: CIRCLE,
      role: 'member',
      actorUserId: 'user-1',
      source: 'circle sign-up',
    })
    expect(result.ok).toBe(true)
    expect(writes(queries)).toHaveLength(1)
    expect(writes(queries)[0].op).toBe('insert')
    expect(writes(queries)[0].payload).toMatchObject({ member_id: MEMBER, cell_group_id: CIRCLE, role: 'member', is_active: true })
    expect(setDisciplerIfEmpty).toHaveBeenCalledWith(client, MEMBER, CIRCLE)
    expect(enrollInAgapayIfEligible).toHaveBeenCalledWith(client, MEMBER, 'user-1', 'circle sign-up')
  })

  it('never changes an active row, leader rows included', async () => {
    const { client, queries } = fakeClient(
      world({
        'member_cell_groups:select': () => ({ data: { id: 'row-1', is_active: true }, error: null }),
      }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'already_in_circle', reason: CIRCLE_ALREADY_IN })
    expect(writes(queries)).toHaveLength(0)
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
  })

  it('treats is_active null as active', async () => {
    const { client, queries } = fakeClient(
      world({
        'member_cell_groups:select': () => ({ data: { id: 'row-1', is_active: null }, error: null }),
      }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result.ok).toBe(false)
    expect(writes(queries)).toHaveLength(0)
  })

  it('reactivates an inactive row and clears left_at', async () => {
    const { client, queries } = fakeClient(
      world({
        'member_cell_groups:select': (q) => {
          const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
          return { data: sel === 'id, is_active' ? { id: 'row-old', is_active: false } : [], error: null }
        },
      }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result.ok).toBe(true)
    const [w] = writes(queries)
    expect(w.op).toBe('update')
    expect(w.payload).toMatchObject({ is_active: true, left_at: null, role: 'member' })
    expect(w.calls).toContainEqual(['eq', ['id', 'row-old']])
  })

  it('refuses a plain member who walks with someone outside the circle, writing nothing', async () => {
    const { client, queries } = fakeClient(
      world({
        'members:select': (q) => {
          const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
          return { data: sel === 'name' ? { name: 'Other Discipler' } : { discipler_id: 'discipler-9' }, error: null }
        },
      }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({
      ok: false,
      kind: 'refused',
      reason: 'Walks with Other Discipler. Change the discipler first.',
    })
    expect(writes(queries)).toHaveLength(0)
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('skips the rule check for a leader role', async () => {
    const { client, queries } = fakeClient(
      world({
        'members:select': () => ({ data: { discipler_id: 'discipler-9' }, error: null }),
      }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'leader', actorUserId: null })
    expect(result.ok).toBe(true)
    expect(writes(queries)[0].payload).toMatchObject({ role: 'leader' })
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('reports a failed read as failed, writing nothing', async () => {
    const { client, queries } = fakeClient(
      world({ 'cell_groups:select': () => ({ data: null, error: { message: 'down' } }) }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED })
    expect(writes(queries)).toHaveLength(0)
  })

  it('reports a failed write as failed, with no discipler or enrollment', async () => {
    const { client } = fakeClient(
      world({ 'member_cell_groups:insert': () => ({ data: null, error: { message: 'fk' } }) }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED })
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })
})

describe('moveDisciplesToNewLeader', () => {
  const swap = { from: 'old-leader', to: 'new-leader' }
  const rows = [
    { member_id: 'a', role: 'member', is_active: true, member: { discipler_id: 'old-leader' } },
    { member_id: 'b', role: 'member', is_active: true, member: { discipler_id: 'someone-else' } },
    { member_id: 'new-leader', role: 'member', is_active: true, member: { discipler_id: 'old-leader' } },
  ]

  it('moves only plain members who walked with the old leader, guarded on the old discipler', async () => {
    const { client, queries } = fakeClient((q) => {
      if (q.table === 'member_cell_groups') return { data: rows, error: null }
      if (q.table === 'members' && q.op === 'update') return { data: [{ id: 'a' }], error: null }
      return { data: null, error: null }
    })
    const result = await moveDisciplesToNewLeader(client, CIRCLE, swap, 'user-1')
    expect(result).toEqual({ moved: 1, failed: false, enrollFailed: 0 })
    const [w] = writes(queries)
    expect(w.payload).toEqual({ discipler_id: 'new-leader' })
    expect(w.calls).toContainEqual(['in', ['id', ['a']]])
    expect(w.calls).toContainEqual(['eq', ['discipler_id', 'old-leader']])
    expect(enrollInAgapayIfEligible).toHaveBeenCalledTimes(1)
    expect(enrollInAgapayIfEligible).toHaveBeenCalledWith(client, 'a', 'user-1', 'circle leader change')
  })

  it('writes nothing when no member walked with the old leader', async () => {
    const { client, queries } = fakeClient(() => ({ data: [rows[1]], error: null }))
    const result = await moveDisciplesToNewLeader(client, CIRCLE, swap, null)
    expect(result).toEqual({ moved: 0, failed: false, enrollFailed: 0 })
    expect(writes(queries)).toHaveLength(0)
  })

  it('counts moved members whose Agapay enrollment failed; the move stands', async () => {
    enrollInAgapayIfEligible
      .mockResolvedValueOnce('failed')
      .mockResolvedValueOnce('enrolled')
      .mockResolvedValueOnce('failed')
    const { client } = fakeClient((q) => {
      if (q.table === 'member_cell_groups') return { data: rows, error: null }
      if (q.table === 'members' && q.op === 'update') return { data: [{ id: 'a' }, { id: 'c' }, { id: 'd' }], error: null }
      return { data: null, error: null }
    })
    const result = await moveDisciplesToNewLeader(client, CIRCLE, swap, 'user-1')
    expect(result).toEqual({ moved: 3, failed: false, enrollFailed: 2 })
    expect(enrollInAgapayIfEligible).toHaveBeenCalledTimes(3)
  })

  it('reports a failed write without throwing', async () => {
    const { client } = fakeClient((q) =>
      q.op === 'update' ? { data: null, error: { message: 'denied' } } : { data: rows, error: null },
    )
    const result = await moveDisciplesToNewLeader(client, CIRCLE, swap, null)
    expect(result).toEqual({ moved: 0, failed: true, enrollFailed: 0 })
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })
})

describe('placeMemberInCircle: circle leaders and joined date', () => {
  const inactiveRow = (q: Query) => {
    const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
    return { data: sel === 'id, is_active' ? { id: 'row-old', is_active: false } : [], error: null }
  }

  it("refuses the circle's leader as a plain member, writing nothing", async () => {
    const { client, queries } = fakeClient(world())
    const result = await placeMemberInCircle(client, { memberId: LEADER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: CIRCLE_LEADER_AS_MEMBER })
    expect(writes(queries)).toHaveLength(0)
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it("refuses the circle's co-leader as a plain member", async () => {
    const { client, queries } = fakeClient(
      world({ 'cell_groups:select': () => ({ data: { leader_id: LEADER, co_leader_id: MEMBER }, error: null }) }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: CIRCLE_LEADER_AS_MEMBER })
    expect(writes(queries)).toHaveLength(0)
  })

  it('still adds the circle leader with a leader role', async () => {
    const { client } = fakeClient(world())
    const result = await placeMemberInCircle(client, { memberId: LEADER, cellGroupId: CIRCLE, role: 'leader', actorUserId: null })
    expect(result.ok).toBe(true)
  })

  it('sets a new joined_at on a reactivated row by default', async () => {
    const { client, queries } = fakeClient(world({ 'member_cell_groups:select': inactiveRow }))
    await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(writes(queries)[0].payload).toHaveProperty('joined_at')
  })

  it('keeps joined_at on a reactivated row with preserveJoinedAt', async () => {
    const { client, queries } = fakeClient(world({ 'member_cell_groups:select': inactiveRow }))
    const result = await placeMemberInCircle(client, {
      memberId: MEMBER,
      cellGroupId: CIRCLE,
      role: 'member',
      actorUserId: null,
      preserveJoinedAt: true,
    })
    expect(result.ok).toBe(true)
    const [w] = writes(queries)
    expect(w.payload).toMatchObject({ is_active: true, left_at: null, role: 'member' })
    expect(w.payload).not.toHaveProperty('joined_at')
  })
})

describe('changeMemberCircleRole', () => {
  /** The member's row in the circle, as the role change reads it; rule reads see no other circle. */
  function rowWorld(row: { id: string; role: string; is_active: boolean | null } | null, overrides = {}) {
    return world({
      'member_cell_groups:select': (q) => {
        const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
        return { data: sel === 'id, role, is_active' ? row : [], error: null }
      },
      ...overrides,
    })
  }

  it('refuses when the member has no row in the circle', async () => {
    const { client, queries } = fakeClient(rowWorld(null))
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'co_leader', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: CIRCLE_NOT_IN })
    expect(CIRCLE_NOT_IN).toBe('Member not in this Quest Circle.')
    expect(writes(queries)).toHaveLength(0)
  })

  it('refuses when the row is inactive', async () => {
    const { client, queries } = fakeClient(rowWorld({ id: 'row-1', role: 'leader', is_active: false }))
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: CIRCLE_NOT_IN })
    expect(writes(queries)).toHaveLength(0)
  })

  it('changes a plain member to co-leader without the add rules or enrollment', async () => {
    const { client, queries } = fakeClient(
      rowWorld({ id: 'row-1', role: 'member', is_active: true }, {
        'members:select': () => ({ data: { discipler_id: 'discipler-9', name: 'Other Discipler' }, error: null }),
      }),
    )
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'co_leader', actorUserId: null })
    expect(result).toEqual({ ok: true })
    const [w] = writes(queries)
    expect(w.payload).toEqual({ role: 'co_leader' })
    expect(w.calls).toContainEqual(['eq', ['id', 'row-1']])
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('turns a leader row into a plain member under the add rules, then sets the discipler and enrolls', async () => {
    const { client, queries } = fakeClient(rowWorld({ id: 'row-1', role: 'leader', is_active: null }))
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: 'user-1' })
    expect(result).toEqual({ ok: true, agapayEnroll: 'enrolled' })
    expect(writes(queries)[0].payload).toEqual({ role: 'member' })
    expect(setDisciplerIfEmpty).toHaveBeenCalledWith(client, MEMBER, CIRCLE)
    expect(enrollInAgapayIfEligible).toHaveBeenCalledWith(client, MEMBER, 'user-1', 'circle')
  })

  it('returns a failed Agapay enrollment after a leader turned plain member; the role change stands', async () => {
    enrollInAgapayIfEligible.mockResolvedValueOnce('failed')
    const { client, queries } = fakeClient(rowWorld({ id: 'row-1', role: 'co_leader', is_active: true }))
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: true, agapayEnroll: 'failed' })
    expect(writes(queries)[0].payload).toEqual({ role: 'member' })
  })

  it("refuses the circle's leader becoming a plain member, writing nothing", async () => {
    const { client, queries } = fakeClient(rowWorld({ id: 'row-1', role: 'leader', is_active: true }))
    const result = await changeMemberCircleRole(client, { memberId: LEADER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: CIRCLE_LEADER_AS_MEMBER })
    expect(writes(queries)).toHaveLength(0)
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('refuses a co-leader row becoming a plain member while in another circle', async () => {
    const { client, queries } = fakeClient(
      world({
        'member_cell_groups:select': (q) => {
          const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
          if (sel === 'id, role, is_active') return { data: { id: 'row-1', role: 'co_leader', is_active: true }, error: null }
          return {
            data: [{ cell_group_id: 'circle-2', role: 'member', is_active: true, cell_group: { name: 'Circle B', is_active: true } }],
            error: null,
          }
        },
      }),
    )
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: 'Already in Circle B. Remove from that circle first.' })
    expect(writes(queries)).toHaveLength(0)
  })

  it('refuses a leader row becoming a plain member who walks with someone outside the circle', async () => {
    const { client, queries } = fakeClient(
      rowWorld({ id: 'row-1', role: 'leader', is_active: true }, {
        'members:select': (q: Query) => {
          const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
          return { data: sel === 'name' ? { name: 'Other Discipler' } : { discipler_id: 'discipler-9' }, error: null }
        },
      }),
    )
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: 'Walks with Other Discipler. Change the discipler first.' })
    expect(writes(queries)).toHaveLength(0)
  })

  it('reports read and write errors as failed', async () => {
    const readFail = fakeClient(
      world({ 'member_cell_groups:select': () => ({ data: null, error: { message: 'down' } }) }),
    )
    expect(
      await changeMemberCircleRole(readFail.client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null }),
    ).toEqual({ ok: false, kind: 'failed', reason: CIRCLE_ROLE_FAILED })

    const writeFail = fakeClient(
      rowWorld({ id: 'row-1', role: 'member', is_active: true }, {
        'member_cell_groups:update': () => ({ data: null, error: { message: 'denied' } }),
      }),
    )
    expect(
      await changeMemberCircleRole(writeFail.client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'leader', actorUserId: null }),
    ).toEqual({ ok: false, kind: 'failed', reason: CIRCLE_ROLE_FAILED })
  })
})

describe('placeMemberInCircle: archived members and the enrollment result', () => {
  const archived = (q: Query) => {
    const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
    return { data: sel === 'is_archived' ? { is_archived: true } : { discipler_id: null, name: 'Someone' }, error: null }
  }

  it('refuses an archived member, writing nothing', async () => {
    const { client, queries } = fakeClient(world({ 'members:select': archived }))
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: MEMBER_ARCHIVED_REFUSAL })
    expect(writes(queries)).toHaveLength(0)
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('refuses an archived member for leader roles too', async () => {
    const { client, queries } = fakeClient(world({ 'members:select': archived }))
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'leader', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: MEMBER_ARCHIVED_REFUSAL })
    expect(writes(queries)).toHaveLength(0)
  })

  it('reports a failed archived check as failed, writing nothing', async () => {
    const { client, queries } = fakeClient(
      world({ 'members:select': () => ({ data: null, error: { message: 'down' } }) }),
    )
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'failed', reason: CIRCLE_ADD_FAILED })
    expect(writes(queries)).toHaveLength(0)
  })

  it('returns the Agapay enrollment result of a plain-member add', async () => {
    enrollInAgapayIfEligible.mockResolvedValueOnce('failed')
    const { client } = fakeClient(world())
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result.ok && result.agapayEnroll).toBe('failed')
  })

  it('returns no enrollment result for a leader role', async () => {
    const { client } = fakeClient(world())
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'co_leader', actorUserId: null })
    expect(result.ok).toBe(true)
    expect(result.ok && result.agapayEnroll).toBeUndefined()
  })
})

describe('endPlainRowsInAnotherCircle', () => {
  const circleRows = [
    { id: 'row-a', member_id: 'a', role: 'member', is_active: true },
    { id: 'row-b', member_id: 'b', role: 'member', is_active: null },
  ]
  const otherRows = [
    { member_id: 'a', cell_group_id: 'circle-2', role: 'member', is_active: true, cell_group: { name: 'Circle B', is_active: true } },
    { member_id: 'b', cell_group_id: 'circle-3', role: 'member', is_active: true, cell_group: { name: 'Circle C', is_active: false } },
  ]

  function dedupeWorld(overrides: Partial<Record<string, (q: Query) => { data: unknown; error: unknown }>> = {}): Responder {
    return (q) => {
      const sel = q.calls.find(([m]) => m === 'select')?.[1][0]
      const key = q.op === 'update' ? 'update' : sel === 'id, member_id, role, is_active' ? 'circle' : 'others'
      if (overrides[key]) return overrides[key]!(q)
      if (key === 'circle') return { data: circleRows, error: null }
      if (key === 'others') return { data: otherRows, error: null }
      return { data: [{ id: 'row-a' }], error: null }
    }
  }

  it('soft-removes only members who are in another active circle', async () => {
    const { client, queries } = fakeClient(dedupeWorld())
    expect(await endPlainRowsInAnotherCircle(client, CIRCLE)).toEqual({ ended: 1, failed: false })
    const [w] = writes(queries)
    expect(w.table).toBe('member_cell_groups')
    expect(w.payload).toMatchObject({ is_active: false })
    expect((w.payload as { left_at: string }).left_at).toEqual(expect.any(String))
    expect(w.calls).toContainEqual(['in', ['id', ['row-a']]])
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('writes nothing when no member is in another active circle', async () => {
    const { client, queries } = fakeClient(dedupeWorld({ others: () => ({ data: [otherRows[1]], error: null }) }))
    expect(await endPlainRowsInAnotherCircle(client, CIRCLE)).toEqual({ ended: 0, failed: false })
    expect(writes(queries)).toHaveLength(0)
  })

  it('reads nothing more for a circle with no plain members', async () => {
    const { client, queries } = fakeClient(dedupeWorld({ circle: () => ({ data: [], error: null }) }))
    expect(await endPlainRowsInAnotherCircle(client, CIRCLE)).toEqual({ ended: 0, failed: false })
    expect(queries).toHaveLength(1)
  })

  it('reports read and write errors as failed, never throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const key of ['circle', 'others', 'update']) {
      const { client } = fakeClient(dedupeWorld({ [key]: () => ({ data: null, error: { message: 'down' } }) }))
      expect(await endPlainRowsInAnotherCircle(client, CIRCLE)).toEqual({ ended: 0, failed: true })
    }
    spy.mockRestore()
  })
})

describe('teams (cell_groups.is_team)', () => {
  const TEAM_LEADER = 'team-leader-1'
  const selectOf = (q: Query) => q.calls.find(([m]) => m === 'select')?.[1][0] as string | undefined
  const teamGroup = () => ({ data: { leader_id: TEAM_LEADER, co_leader_id: null, is_team: true }, error: null })
  const circleRow = { cell_group_id: 'circle-2', role: 'member', is_active: true, cell_group: { name: 'Circle B', is_active: true } }
  const teamRow = { cell_group_id: 'team-2', role: 'member', is_active: true, cell_group: { name: 'Worship Team', is_active: true, is_team: true } }
  /** No row in the target yet; the member's other plain rows are `others`. */
  const memberships = (others: unknown[]) => (q: Query) =>
    ({ data: selectOf(q) === 'id, is_active' ? null : others, error: null })

  it('reads is_team on the target circle and on the other memberships', async () => {
    const { client, queries } = fakeClient(world())
    await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    const selects = queries.map(selectOf)
    expect(selects).toContain('leader_id, co_leader_id, is_team')
    expect(selects).toContain('cell_group_id, role, is_active, cell_group:cell_groups(name, is_active, is_team)')
  })

  it('adds a member of another circle who walks with someone else, with no discipler or enrollment', async () => {
    const { client, queries } = fakeClient(
      world({
        'cell_groups:select': teamGroup,
        'member_cell_groups:select': memberships([circleRow]),
        'members:select': () => ({ data: { discipler_id: 'discipler-9', name: 'Other Discipler' }, error: null }),
      }),
    )
    const result = await placeMemberInCircle(client, {
      memberId: MEMBER,
      cellGroupId: CIRCLE,
      role: 'member',
      actorUserId: 'user-1',
      source: 'circle sign-up',
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.agapayEnroll).toBeUndefined()
    expect(writes(queries)).toHaveLength(1)
    expect(writes(queries)[0].payload).toMatchObject({ member_id: MEMBER, cell_group_id: CIRCLE, role: 'member' })
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it("refuses the team's leader as a plain member", async () => {
    const { client, queries } = fakeClient(world({ 'cell_groups:select': teamGroup }))
    const result = await placeMemberInCircle(client, { memberId: TEAM_LEADER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: CIRCLE_LEADER_AS_MEMBER })
    expect(writes(queries)).toHaveLength(0)
  })

  it('lets a team member join a circle, with discipler and enrollment', async () => {
    const { client } = fakeClient(world({ 'member_cell_groups:select': memberships([teamRow]) }))
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: 'user-1' })
    expect(result.ok).toBe(true)
    expect(setDisciplerIfEmpty).toHaveBeenCalledWith(client, MEMBER, CIRCLE)
    expect(enrollInAgapayIfEligible).toHaveBeenCalledWith(client, MEMBER, 'user-1', 'circle')
  })

  it('still refuses a circle add for a member of another circle when a team row is listed first', async () => {
    const { client, queries } = fakeClient(world({ 'member_cell_groups:select': memberships([teamRow, circleRow]) }))
    const result = await placeMemberInCircle(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: null })
    expect(result).toEqual({ ok: false, kind: 'refused', reason: 'Already in Circle B. Remove from that circle first.' })
    expect(writes(queries)).toHaveLength(0)
  })

  it('turns a team co-leader into a plain member with no discipler or enrollment', async () => {
    const { client, queries } = fakeClient(
      world({
        'cell_groups:select': teamGroup,
        'member_cell_groups:select': (q) =>
          selectOf(q) === 'id, role, is_active'
            ? { data: { id: 'row-1', role: 'co_leader', is_active: true }, error: null }
            : { data: [circleRow], error: null },
        'members:select': () => ({ data: { discipler_id: 'discipler-9', name: 'Other Discipler' }, error: null }),
      }),
    )
    const result = await changeMemberCircleRole(client, { memberId: MEMBER, cellGroupId: CIRCLE, role: 'member', actorUserId: 'user-1' })
    expect(result).toEqual({ ok: true })
    expect(writes(queries)[0].payload).toEqual({ role: 'member' })
    expect(setDisciplerIfEmpty).not.toHaveBeenCalled()
    expect(enrollInAgapayIfEligible).not.toHaveBeenCalled()
  })

  it('a reactivated circle keeps members whose other row is a team, and reads is_team', async () => {
    const { client, queries } = fakeClient((q) => {
      if (q.op === 'update') return { data: [{ id: 'row-a' }], error: null }
      if (selectOf(q) === 'id, member_id, role, is_active') {
        return { data: [{ id: 'row-a', member_id: 'a', role: 'member', is_active: true }], error: null }
      }
      return { data: [{ member_id: 'a', ...teamRow }], error: null }
    })
    expect(await endPlainRowsInAnotherCircle(client, CIRCLE)).toEqual({ ended: 0, failed: false })
    expect(writes(queries)).toHaveLength(0)
    expect(queries.map(selectOf)).toContain(
      'member_id, cell_group_id, role, is_active, cell_group:cell_groups(name, is_active, is_team)',
    )
  })
})
