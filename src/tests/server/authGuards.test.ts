// Every server function is a directly callable RPC endpoint with no middleware,
// so each one must authorize the caller itself. This test reads the source of
// every file in src/server/functions and fails when a server function neither
// calls an auth guard (requirePermission / requireAdmin / getCaller) nor
// delegates to a local helper that does. Deliberately public endpoints are
// listed in PUBLIC_SERVER_FUNCTIONS with the reason they are safe.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Vitest runs from the app root (where vitest.config.ts lives).
const FUNCTIONS_DIR = resolve(process.cwd(), 'src/server/functions')

const PUBLIC_SERVER_FUNCTIONS: Record<string, string> = {
  'attendance.ts:getCheckinSession': 'QR check-in page; keyed by the unguessable session qr_token',
  'attendance.ts:getPublicSessionDisplay': 'projectable QR screen; keyed by the qr_token, display fields only',
  'memberClaims.ts:getSignupGroup': 'Quest Circle sign-up QR page; keyed by the unguessable signup token',
  'memberClaims.ts:submitClaimSignup': 'Quest Circle sign-up QR form; keyed by the signup token',
  'satellites.ts:getSatellites': 'satellite names; the satellites table is public-read',
}

const GUARD_CALL = /\b(requirePermission|requireAdmin|getCaller)\s*\(/

// Local helper functions whose body calls a guard.
function guardingHelpers(src: string): string[] {
  const names: string[] = []
  const re = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm
  const starts = [...src.matchAll(re)]
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : src.length
    if (GUARD_CALL.test(src.slice(m.index, end))) names.push(m[1])
  })
  return names
}

function serverFunctions(src: string): { name: string; body: string }[] {
  const re = /^export const (\w+) = createServerFn\(/gm
  const starts = [...src.matchAll(re)]
  return starts.map((m, i) => ({
    name: m[1],
    body: src.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : src.length),
  }))
}

describe('server function auth guards', () => {
  const files = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))

  it('finds server function files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('every server function is guarded or explicitly public', () => {
    const unguarded: string[] = []
    for (const file of files) {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
      const helpers = guardingHelpers(src)
      for (const fn of serverFunctions(src)) {
        const key = `${file}:${fn.name}`
        const guarded =
          GUARD_CALL.test(fn.body) || helpers.some((h) => new RegExp(`\\b${h}\\s*\\(`).test(fn.body))
        if (!guarded && !(key in PUBLIC_SERVER_FUNCTIONS)) unguarded.push(key)
      }
    }
    expect(unguarded).toEqual([])
  })

  it('every public allowlist entry still exists (no stale exemptions)', () => {
    const existing = new Set<string>()
    for (const file of files) {
      const src = readFileSync(join(FUNCTIONS_DIR, file), 'utf8')
      for (const fn of serverFunctions(src)) existing.add(`${file}:${fn.name}`)
    }
    const stale = Object.keys(PUBLIC_SERVER_FUNCTIONS).filter((k) => !existing.has(k))
    expect(stale).toEqual([])
  })
})
