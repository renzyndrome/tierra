// Finance PIN hashing — server-only (uses node:crypto).
//
// PINs are hashed with scrypt and a per-PIN random salt. The stored format is
// `scrypt$<saltHex>$<hashHex>`. Never import this from client/browser code.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 32
const SCRYPT_COST = 16384 // N — CPU/memory cost factor (2^14)
const PREFIX = 'scrypt'

/**
 * Hash a finance PIN. Returns a self-describing `scrypt$salt$hash` string.
 */
export function hashFinancePin(pin: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(pin, salt, KEY_LENGTH, { N: SCRYPT_COST })
  return `${PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Verify a PIN against a stored hash using a constant-time comparison.
 * Returns false for malformed/empty hashes rather than throwing.
 */
export function verifyFinancePinHash(pin: string, stored: string | null | undefined): boolean {
  if (!stored) return false

  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== PREFIX) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[1], 'hex')
    expected = Buffer.from(parts[2], 'hex')
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false

  const actual = scryptSync(pin, salt, expected.length, { N: SCRYPT_COST })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
