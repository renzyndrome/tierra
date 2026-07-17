import { describe, it, expect } from 'vitest'
import { hashFinancePin, verifyFinancePinHash } from '../../server/financePin'

describe('finance PIN hashing', () => {
  it('verifies a correct PIN', () => {
    const hash = hashFinancePin('1234')
    expect(verifyFinancePinHash('1234', hash)).toBe(true)
  })

  it('rejects an incorrect PIN', () => {
    const hash = hashFinancePin('1234')
    expect(verifyFinancePinHash('0000', hash)).toBe(false)
  })

  it('uses a unique salt each time', () => {
    expect(hashFinancePin('1234')).not.toBe(hashFinancePin('1234'))
  })

  it('produces a scrypt$salt$hash string', () => {
    const parts = hashFinancePin('secret').split('$')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('scrypt')
  })

  it('rejects malformed or empty stored hashes', () => {
    expect(verifyFinancePinHash('1234', null)).toBe(false)
    expect(verifyFinancePinHash('1234', undefined)).toBe(false)
    expect(verifyFinancePinHash('1234', '')).toBe(false)
    expect(verifyFinancePinHash('1234', 'garbage')).toBe(false)
    expect(verifyFinancePinHash('1234', 'md5$aa$bb')).toBe(false)
  })

  it('supports alphanumeric secret PINs and is case-sensitive', () => {
    const hash = hashFinancePin('S3cret!')
    expect(verifyFinancePinHash('S3cret!', hash)).toBe(true)
    expect(verifyFinancePinHash('s3cret!', hash)).toBe(false)
  })
})
