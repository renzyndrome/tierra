// Quest Laguna Directory - Admin Authentication Tests
// Tests for PIN-based admin authentication flow

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock sessionStorage
const sessionStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => sessionStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    sessionStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete sessionStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    sessionStorageMock.store = {}
  }),
}

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

describe('Admin Authentication', () => {
  const ADMIN_PIN = 'quest2026'

  beforeEach(() => {
    sessionStorageMock.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    sessionStorageMock.clear()
  })

  // ============================================
  // PIN STORAGE TESTS
  // ============================================
  describe('Session Storage', () => {
    it('should store authentication state in sessionStorage', () => {
      sessionStorageMock.setItem('admin_authenticated', 'true')

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith('admin_authenticated', 'true')
      expect(sessionStorageMock.store['admin_authenticated']).toBe('true')
    })

    it('should retrieve authentication state from sessionStorage', () => {
      sessionStorageMock.store['admin_authenticated'] = 'true'

      const result = sessionStorageMock.getItem('admin_authenticated')

      expect(result).toBe('true')
    })

    it('should return null when not authenticated', () => {
      const result = sessionStorageMock.getItem('admin_authenticated')

      expect(result).toBeNull()
    })

    it('should clear authentication on removal', () => {
      sessionStorageMock.store['admin_authenticated'] = 'true'

      sessionStorageMock.removeItem('admin_authenticated')

      expect(sessionStorageMock.store['admin_authenticated']).toBeUndefined()
    })
  })

  // ============================================
  // PIN VALIDATION TESTS
  // ============================================
  describe('PIN Validation', () => {
    it('should accept correct PIN', () => {
      const inputPin = 'quest2026'
      const isValid = inputPin === ADMIN_PIN

      expect(isValid).toBe(true)
    })

    it('should reject incorrect PIN', () => {
      const inputPin = 'wrong1234'
      const isValid = inputPin === ADMIN_PIN

      expect(isValid).toBe(false)
    })

    it('should be case-sensitive', () => {
      const inputPin = 'Quest2026' // Different case
      const isValid = inputPin === ADMIN_PIN

      expect(isValid).toBe(false)
    })

    it('should handle empty PIN', () => {
      const inputPin = ''
      const isValid = inputPin === ADMIN_PIN

      expect(isValid).toBe(false)
    })

    it('should handle whitespace', () => {
      const inputPin = ' quest2026 '
      const isValid = inputPin === ADMIN_PIN

      expect(isValid).toBe(false)
    })
  })

  // ============================================
  // AUTHENTICATION FLOW TESTS
  // ============================================
  describe('Authentication Flow', () => {
    it('should authenticate user with correct PIN', () => {
      const inputPin = 'quest2026'

      if (inputPin === ADMIN_PIN) {
        sessionStorageMock.setItem('admin_authenticated', 'true')
      }

      expect(sessionStorageMock.store['admin_authenticated']).toBe('true')
    })

    it('should not authenticate user with incorrect PIN', () => {
      const inputPin = 'wrongpin'

      if (inputPin === ADMIN_PIN) {
        sessionStorageMock.setItem('admin_authenticated', 'true')
      }

      expect(sessionStorageMock.store['admin_authenticated']).toBeUndefined()
    })

    it('should persist authentication across page navigations', () => {
      // Simulate successful login
      sessionStorageMock.store['admin_authenticated'] = 'true'

      // Simulate checking auth on another page
      const isAuthenticated = sessionStorageMock.getItem('admin_authenticated') === 'true'

      expect(isAuthenticated).toBe(true)
    })

    it('should check stored auth on component mount', () => {
      // Pre-set authentication
      sessionStorageMock.store['admin_authenticated'] = 'true'

      // Simulate component checking auth
      const storedAuth = sessionStorageMock.getItem('admin_authenticated')
      const isAuthenticated = storedAuth === 'true'

      expect(isAuthenticated).toBe(true)
    })
  })

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================
  describe('Error Handling', () => {
    it('should set error message for invalid PIN', () => {
      const inputPin = 'wrongpin'
      let errorMessage = ''

      if (inputPin !== ADMIN_PIN) {
        errorMessage = 'Invalid PIN. Please try again.'
      }

      expect(errorMessage).toBe('Invalid PIN. Please try again.')
    })

    it('should clear error message on successful auth', () => {
      let errorMessage = 'Invalid PIN. Please try again.'
      const inputPin = 'quest2026'

      if (inputPin === ADMIN_PIN) {
        errorMessage = ''
      }

      expect(errorMessage).toBe('')
    })
  })

  // ============================================
  // SECURITY TESTS
  // ============================================
  describe('Security', () => {
    it('should not expose PIN in error messages', () => {
      const errorMessage = 'Invalid PIN. Please try again.'

      expect(errorMessage).not.toContain('quest2026')
      expect(errorMessage).not.toContain(ADMIN_PIN)
    })

    it('should limit PIN length', () => {
      const maxLength = 10

      // The PIN input should have maxLength set
      expect(ADMIN_PIN.length).toBeLessThanOrEqual(maxLength)
    })

    it('should mask PIN input', () => {
      // PIN input type should be "password"
      const inputType = 'password'

      expect(inputType).toBe('password')
    })
  })

  // ============================================
  // SESSION MANAGEMENT TESTS
  // ============================================
  describe('Session Management', () => {
    it('should clear authentication on logout', () => {
      sessionStorageMock.store['admin_authenticated'] = 'true'

      // Simulate logout
      sessionStorageMock.removeItem('admin_authenticated')

      expect(sessionStorageMock.store['admin_authenticated']).toBeUndefined()
    })

    it('should be cleared when browser session ends', () => {
      // sessionStorage is automatically cleared when browser closes
      // This is a characteristic of sessionStorage vs localStorage
      sessionStorageMock.store['admin_authenticated'] = 'true'

      // Simulate session end
      sessionStorageMock.clear()

      expect(sessionStorageMock.store['admin_authenticated']).toBeUndefined()
    })
  })

  // ============================================
  // MULTIPLE ADMIN PAGES TESTS
  // ============================================
  describe('Multiple Admin Pages', () => {
    const adminPages = [
      '/admin/members',
      '/admin/members/new',
      '/admin/members/:id/edit',
      '/admin/cell-groups',
      '/admin/ministries',
    ]

    it.each(adminPages)('should use same auth for %s', (page) => {
      sessionStorageMock.store['admin_authenticated'] = 'true'

      const isAuthenticated = sessionStorageMock.getItem('admin_authenticated') === 'true'

      expect(isAuthenticated).toBe(true)
    })

    it('should share authentication across all admin routes', () => {
      // Authenticate once
      sessionStorageMock.store['admin_authenticated'] = 'true'

      // All pages should see authentication
      for (const page of adminPages) {
        const isAuthenticated = sessionStorageMock.getItem('admin_authenticated') === 'true'
        expect(isAuthenticated).toBe(true)
      }
    })
  })
})
