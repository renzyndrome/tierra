import { test, expect } from '@playwright/test'

// The admin header must identify the signed-in user (name, falling back to
// email) and give them a way into their own profile — previously it rendered
// only the role label + Sign Out, so a non-admin saw e.g. just "Finance".
//
// Env: E2E_HEADER_EMAIL / E2E_HEADER_PASSWORD (any role), and optionally
// E2E_HEADER_NAME — the linked member's name expected in the header.

const EMAIL = process.env.E2E_HEADER_EMAIL || ''
const PASSWORD = process.env.E2E_HEADER_PASSWORD || ''
const NAME = process.env.E2E_HEADER_NAME || ''

test.describe('Admin header identity', () => {
  test.beforeEach(async () => {
    test.skip(!EMAIL || !PASSWORD, 'Set E2E_HEADER_EMAIL / E2E_HEADER_PASSWORD')
  })

  test('shows the signed-in user and links to their profile', async ({ page }) => {
    await page.goto('/auth/login')
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: /sign in|log in|continue/i }).click()
    await page.waitForURL(/\/admin/, { timeout: 15_000 })

    const header = page.locator('header')

    // Identity: the member name when linked, otherwise the email.
    await expect(header.getByText(NAME || EMAIL)).toBeVisible({ timeout: 15_000 })

    // And a route into their own profile.
    const profileLink = header.getByRole('link', { name: /my profile/i })
    await expect(profileLink).toBeVisible()
    await profileLink.click()
    await page.waitForURL(/\/profile/, { timeout: 15_000 })
  })
})
