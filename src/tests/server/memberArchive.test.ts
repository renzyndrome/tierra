// Tests for the member archive and delete checks (src/server/memberArchive.ts)
// with a scripted fake client: each query is recorded, and its response comes
// from a per-test responder keyed on table and operation.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ createServerAdminClient: vi.fn() }))

const hasAgapayEnrollment = vi.fn(async () => false)
vi.mock('../../server/agapayEnroll', () => ({
  hasAgapayEnrollment: (...args: unknown[]) => hasAgapayEnrollment(...(args as [])),
}))

import {
  endPlainCircleMemberships,
  memberArchiveBlockReason,
  memberDeleteBlockReason,
} from '../../server/memberArchive'
import { AGAPAY_HISTORY_EXISTS, DISCIPLES_ASSIGNED } from '../../lib/memberArchiveRules'

interface Query {
  table: string
  op: 'select' | 'update'
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
      for (const m of ['select', 'eq', 'not', 'is', 'in', 'or', 'order', 'limit', 'maybeSingle', 'single']) {
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

const MEMBER = '11111111-1111-4111-8111-111111111111'

/** Default world: no disciples, no led circle. */
function world(overrides: Partial<Record<string, Responder>> = {}): Responder {
  return (q) => {
    const key = `${q.table}:${q.op}`
    if (overrides[key]) return overrides[key]!(q)
    return { data: q.op === 'select' ? [] : null, error: null }
  }
}

beforeEach(() => {
  hasAgapayEnrollment.mockReset()
  hasAgapayEnrollment.mockResolvedValue(false)
})

describe('memberArchiveBlockReason', () => {
  it('allows a member with no disciples and no led circle', async () => {
    const { client, queries } = fakeClient(world())
    expect(await memberArchiveBlockReason(client, MEMBER)).toBeNull()
    const disciples = queries.find((q) => q.table === 'members')!
    expect(disciples.calls).toContainEqual(['eq', ['discipler_id', MEMBER]])
    expect(disciples.calls).toContainEqual(['not', ['is_archived', 'is', true]])
    const circles = queries.find((q) => q.table === 'cell_groups')!
    expect(circles.calls).toContainEqual(['or', [`leader_id.eq.${MEMBER},co_leader_id.eq.${MEMBER}`]])
    expect(circles.calls).toContainEqual(['not', ['is_active', 'is', false]])
  })

  it('refuses a member who still disciples a non-archived member', async () => {
    const { client } = fakeClient(world({ 'members:select': () => ({ data: [{ id: 'disciple-1' }], error: null }) }))
    expect(await memberArchiveBlockReason(client, MEMBER)).toBe(DISCIPLES_ASSIGNED)
  })

  it('refuses a member who leads an active circle, naming it', async () => {
    const { client } = fakeClient(world({ 'cell_groups:select': () => ({ data: [{ name: 'Circle A' }], error: null }) }))
    expect(await memberArchiveBlockReason(client, MEMBER)).toBe('Leads Circle A. Change the leader first.')
  })

  it('throws on a failed read', async () => {
    const { client } = fakeClient(world({ 'cell_groups:select': () => ({ data: null, error: { message: 'down' } }) }))
    await expect(memberArchiveBlockReason(client, MEMBER)).rejects.toBeTruthy()
  })
})

describe('memberDeleteBlockReason', () => {
  it('allows a member with no links and no Agapay record', async () => {
    const { client } = fakeClient(world())
    expect(await memberDeleteBlockReason(client, MEMBER)).toBeNull()
    expect(hasAgapayEnrollment).toHaveBeenCalledWith(client, MEMBER)
  })

  it('refuses a member with an Agapay record', async () => {
    hasAgapayEnrollment.mockResolvedValue(true)
    const { client } = fakeClient(world())
    expect(await memberDeleteBlockReason(client, MEMBER)).toBe(AGAPAY_HISTORY_EXISTS)
  })

  it('applies the archive refusals first', async () => {
    hasAgapayEnrollment.mockResolvedValue(true)
    const { client } = fakeClient(world({ 'members:select': () => ({ data: [{ id: 'disciple-1' }], error: null }) }))
    expect(await memberDeleteBlockReason(client, MEMBER)).toBe(DISCIPLES_ASSIGNED)
  })

  it('throws when the Agapay check fails', async () => {
    hasAgapayEnrollment.mockRejectedValue(new Error('down'))
    const { client } = fakeClient(world())
    await expect(memberDeleteBlockReason(client, MEMBER)).rejects.toThrow('down')
  })
})

describe('endPlainCircleMemberships', () => {
  it("soft-removes the member's active plain memberships only", async () => {
    const { client, queries } = fakeClient(world())
    await endPlainCircleMemberships(client, MEMBER)
    const [w] = queries.filter((q) => q.op === 'update')
    expect(w.table).toBe('member_cell_groups')
    expect(w.payload).toMatchObject({ is_active: false })
    expect((w.payload as { left_at: string }).left_at).toEqual(expect.any(String))
    expect(w.calls).toContainEqual(['eq', ['member_id', MEMBER]])
    expect(w.calls).toContainEqual(['eq', ['role', 'member']])
    expect(w.calls).toContainEqual(['not', ['is_active', 'is', false]])
  })

  it('logs a failed write without throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient(world({ 'member_cell_groups:update': () => ({ data: null, error: { message: 'denied' } }) }))
    await expect(endPlainCircleMemberships(client, MEMBER)).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
