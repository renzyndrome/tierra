// Supabase mock for testing
import { vi } from 'vitest'

// Mock data storage
let mockData: Record<string, any[]> = {
  members: [],
  satellites: [],
  cell_groups: [],
  ministries: [],
  member_cell_groups: [],
  member_ministries: [],
  user_profiles: [],
  event_registrations: [],
  fun_facts: [],
}

// Helper to reset mock data
export function resetMockData() {
  mockData = {
    members: [],
    satellites: [],
    cell_groups: [],
    ministries: [],
    member_cell_groups: [],
    member_ministries: [],
    user_profiles: [],
    event_registrations: [],
    fun_facts: [],
  }
}

// Helper to seed mock data
export function seedMockData(table: string, data: any[]) {
  mockData[table] = [...data]
}

// Helper to get mock data
export function getMockData(table: string) {
  return mockData[table] || []
}

// Create a mock query builder
function createQueryBuilder(table: string) {
  let data = [...mockData[table]]
  let filters: Array<{ column: string; op: string; value: any }> = []
  let selectedColumns: string[] | null = null
  let orderColumn: string | null = null
  let orderAscending = true
  let rangeStart = 0
  let rangeEnd = Infinity
  let isSingle = false
  let countMode: 'exact' | 'planned' | 'estimated' | null = null
  let headOnly = false

  const builder = {
    select: (columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => {
      if (columns === '*') {
        selectedColumns = null
      } else if (columns) {
        selectedColumns = columns.split(',').map(c => c.trim())
      }
      if (options?.count) {
        countMode = options.count
      }
      if (options?.head) {
        headOnly = true
      }
      return builder
    },
    eq: (column: string, value: any) => {
      filters.push({ column, op: 'eq', value })
      return builder
    },
    neq: (column: string, value: any) => {
      filters.push({ column, op: 'neq', value })
      return builder
    },
    or: (condition: string) => {
      // Simple OR parsing for ilike conditions
      const parts = condition.split(',')
      filters.push({ column: '_or', op: 'or', value: parts })
      return builder
    },
    not: (column: string, operator: string, value: any) => {
      filters.push({ column, op: `not_${operator}`, value })
      return builder
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      orderColumn = column
      orderAscending = options?.ascending ?? true
      return builder
    },
    range: (from: number, to: number) => {
      rangeStart = from
      rangeEnd = to
      return builder
    },
    limit: (count: number) => {
      rangeEnd = rangeStart + count - 1
      return builder
    },
    single: () => {
      isSingle = true
      return builder
    },
    insert: (newData: any | any[]) => {
      const items = Array.isArray(newData) ? newData : [newData]
      const insertedItems = items.map(item => ({
        id: item.id || `${table}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...item,
        created_at: item.created_at || new Date().toISOString(),
        updated_at: item.updated_at || new Date().toISOString(),
      }))
      mockData[table].push(...insertedItems)
      data = insertedItems
      return builder
    },
    update: (updates: any) => {
      // Apply filters to find items to update
      let itemsToUpdate = [...mockData[table]]
      for (const filter of filters) {
        if (filter.op === 'eq') {
          itemsToUpdate = itemsToUpdate.filter(item => item[filter.column] === filter.value)
        }
      }

      // Update the items
      for (const item of itemsToUpdate) {
        Object.assign(item, updates, { updated_at: new Date().toISOString() })
      }

      data = itemsToUpdate
      return builder
    },
    delete: () => {
      // Set flag to indicate delete operation - actual deletion happens in then()
      return {
        ...builder,
        eq: (column: string, value: any) => {
          filters.push({ column, op: 'eq', value })
          return {
            ...builder,
            then: async (resolve: (value: any) => void) => {
              // Apply filters to find items to delete
              let indicesToDelete: number[] = []
              for (let i = 0; i < mockData[table].length; i++) {
                let match = true
                for (const filter of filters) {
                  if (filter.op === 'eq' && mockData[table][i][filter.column] !== filter.value) {
                    match = false
                    break
                  }
                }
                if (match) {
                  indicesToDelete.push(i)
                }
              }

              // Remove items (in reverse order to maintain indices)
              for (const idx of indicesToDelete.reverse()) {
                mockData[table].splice(idx, 1)
              }

              resolve({ data: null, error: null })
            },
          }
        },
      }
    },
    then: async (resolve: (value: any) => void) => {
      // Apply filters
      let result = [...mockData[table]]

      for (const filter of filters) {
        if (filter.op === 'eq') {
          result = result.filter(item => item[filter.column] === filter.value)
        } else if (filter.op === 'neq') {
          result = result.filter(item => item[filter.column] !== filter.value)
        } else if (filter.op === 'or') {
          // Handle OR conditions
          const orResult: any[] = []
          for (const item of result) {
            for (const part of filter.value as string[]) {
              const [field, value] = part.split('.ilike.')
              if (value && item[field]?.toLowerCase().includes(value.replace(/%/g, '').toLowerCase())) {
                if (!orResult.includes(item)) {
                  orResult.push(item)
                }
                break
              }
            }
          }
          result = orResult
        }
      }

      // Apply ordering
      if (orderColumn) {
        result.sort((a, b) => {
          const aVal = a[orderColumn!]
          const bVal = b[orderColumn!]
          if (aVal < bVal) return orderAscending ? -1 : 1
          if (aVal > bVal) return orderAscending ? 1 : -1
          return 0
        })
      }

      // Get count before pagination
      const count = result.length

      // Apply range/pagination
      result = result.slice(rangeStart, rangeEnd + 1)

      if (headOnly) {
        resolve({ data: null, count, error: null })
        return
      }

      if (isSingle) {
        if (result.length === 0) {
          resolve({ data: null, error: { code: 'PGRST116', message: 'Not found' } })
        } else {
          resolve({ data: result[0], error: null })
        }
        return
      }

      resolve({ data: result, count: countMode ? count : undefined, error: null })
    },
  }

  return builder
}

// Mock Supabase client
export const mockSupabaseClient = {
  from: (table: string) => createQueryBuilder(table),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
  },
  storage: {
    from: () => ({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
      remove: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/test' } }),
    }),
  },
}

// Create mock functions for server supabase client
export const createMockServerSupabaseClient = vi.fn(() => mockSupabaseClient)
