import { test, expect, type Page } from '@playwright/test'

// READ-ONLY smoke for the account-management feature. Verifies auth + that the
// new pages render and the finance PIN gate appears. Performs NO mutations
// (no invites, no permission toggles, no PIN set) — safe to run against prod.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login')
  // Ensure we're in password mode (the form defaults to it; guard just in case).
  if (!(await page.locator('#password').isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /password/i }).first().click().catch(() => {})
  }
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await page.waitForURL(/\/(admin|directory)/, { timeout: 20_000 })
}

test.beforeEach(() => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD')
})

test.describe('Account management — read-only smoke', () => {
  test('admin can log in and open Users', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: /user accounts/i })).toBeVisible()
    // The seeded admin account row is present.
    await expect(page.getByText(ADMIN_EMAIL, { exact: false }).first()).toBeVisible()
    // Invite control exists (we do NOT open/submit it).
    await expect(page.getByRole('button', { name: /invite user/i })).toBeVisible()
  })

  test('roles matrix renders with editable checkboxes', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/roles')
    await expect(page.getByRole('heading', { name: /roles.*permissions/i })).toBeVisible()
    // Wait for the matrix to finish its async load (it shows a spinner first).
    await expect(page.getByRole('checkbox').first()).toBeVisible({ timeout: 15_000 })
    expect(await page.getByRole('checkbox').count()).toBeGreaterThan(0)
    // Admin column is locked (disabled). No toggling.
    await expect(page.getByRole('checkbox', { name: /Administrator/i }).first()).toBeDisabled()
  })

  test('finances shows the per-user PIN gate', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/finances')
    await expect(
      page.getByText(/set your finance pin|enter your finance pin/i),
    ).toBeVisible({ timeout: 15_000 })
  })
})
