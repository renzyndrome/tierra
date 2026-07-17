import { test, expect, type Page } from '@playwright/test'

// Verifies the global AuthGate that seals the internal app from the public:
//   1. An anonymous visitor to an internal page is redirected to login
//      (and no member PII is served) — the fix for the QR-scanner exposure.
//   2. An authenticated user still sees the (now client-fetched) member profile.
//
// Test 2 needs admin creds + a member id (E2E_MEMBER_ID); it skips otherwise.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''
const MEMBER_ID = process.env.E2E_MEMBER_ID || ''

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login')
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click()
  await page.waitForURL(/\/admin/, { timeout: 15_000 })
}

test.describe('Global auth gate', () => {
  test('anonymous visitor to an internal page is redirected to login', async ({ page }) => {
    // Any UUID works — an anonymous user is gated before the data is ever fetched.
    await page.goto('/directory/members/00000000-0000-0000-0000-000000000000')
    await page.waitForURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page.locator('#password')).toBeVisible()
  })

  test('public check-in page is NOT gated', async ({ page }) => {
    await page.goto('/checkin/some-token')
    // Stays on /checkin (not redirected to login) and renders the check-in card.
    await expect(page).toHaveURL(/\/checkin\//)
    await expect(page.getByRole('heading', { name: /invalid check-in link|check-in is closed/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('authenticated user can view a member profile (client-fetched)', async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD')
    test.skip(!MEMBER_ID, 'Set E2E_MEMBER_ID to a real member UUID')

    await loginAsAdmin(page)
    await page.goto(`/directory/members/${MEMBER_ID}`)
    // The profile renders its Contact Info section once the client fetch resolves.
    await expect(page.getByRole('heading', { name: 'Contact Info' })).toBeVisible({ timeout: 15_000 })
  })
})
