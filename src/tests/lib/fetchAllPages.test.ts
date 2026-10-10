// Unit tests for the paged whole-table read.

import { describe, it, expect } from 'vitest'
import { fetchAllPages, type PageResult } from '../../lib/fetchAllPages'

/** A fake table that answers range(from, to) like PostgREST (inclusive). */
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }))
  const calls: [number, number][] = []
  const fetchPage = async (from: number, to: number): Promise<PageResult<{ id: number }>> => {
    calls.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  }
  return { fetchPage, calls }
}

describe('fetchAllPages', () => {
  it('reads past the first page', async () => {
    const { fetchPage, calls } = fakeTable(2500)
    const { rows, error } = await fetchAllPages(fetchPage, 1000)
    expect(error).toBeNull()
    expect(rows).toHaveLength(2500)
    expect(rows[2499]).toEqual({ id: 2499 })
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('makes one extra call when the total is an exact multiple of the page size', async () => {
    const { fetchPage, calls } = fakeTable(4)
    const { rows } = await fetchAllPages(fetchPage, 2)
    expect(rows).toHaveLength(4)
    expect(calls).toHaveLength(3)
  })

  it('handles an empty table', async () => {
    const { fetchPage } = fakeTable(0)
    const { rows, error } = await fetchAllPages(fetchPage, 10)
    expect(rows).toEqual([])
    expect(error).toBeNull()
  })

  it('defaults to 1000-row pages', async () => {
    const { fetchPage, calls } = fakeTable(5)
    await fetchAllPages(fetchPage)
    expect(calls[0]).toEqual([0, 999])
  })

  it('stops at the first error and returns the rows read so far', async () => {
    let call = 0
    const failure = { message: 'boom' }
    const { rows, error } = await fetchAllPages<{ id: number }>(async () => {
      call++
      return call === 1 ? { data: [{ id: 1 }, { id: 2 }], error: null } : { data: null, error: failure }
    }, 2)
    expect(rows).toEqual([{ id: 1 }, { id: 2 }])
    expect(error).toBe(failure)
  })

  it('treats null data as an empty page', async () => {
    const { rows } = await fetchAllPages(async () => ({ data: null, error: null }), 10)
    expect(rows).toEqual([])
  })

  it('rejects a page size below 1', async () => {
    await expect(fetchAllPages(async () => ({ data: [], error: null }), 0)).rejects.toThrow()
  })
})
