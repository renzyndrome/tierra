// Read every row of a query, one page at a time. PostgREST caps a plain
// select at 1000 rows by default, so a whole-table read must page with
// range(from, to). Pure: the caller supplies the page query.

/** PostgREST's default max rows per response. */
export const DEFAULT_PAGE_SIZE = 1000

/** Stops a query that ignores its range from looping forever. */
const MAX_PAGES = 1000

export interface PageResult<T> {
  data: T[] | null
  error: unknown
}

/**
 * Call fetchPage(from, to) for consecutive inclusive ranges until a page
 * comes back short. Returns the rows read so far and the first error, if
 * any; reading stops at that error.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<{ rows: T[]; error: unknown }> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('pageSize must be a positive integer')
  }
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize
    const { data, error } = await fetchPage(from, from + pageSize - 1)
    if (error) return { rows, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return { rows, error: null }
}
