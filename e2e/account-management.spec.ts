import { test, expect, type Page } from '@playwright/test'

// End-to-end coverage for the account-management feature:
//   1. Roles & permissions matrix (edit + persist)
//   2. Users: invite flow
//   3. Finances: per-user PIN gate (set / enter)
//
// Preconditions (see e2e/README.md): migration applied, app running,
// admin credentials in E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''

// A throwaway address for the invite test. Override to control deliverability.
const INVITE_EMAIL = process.env.E2E_INVITE_EMAIL || `e2e+${Date.now()}@example.com`

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login')
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click()
  // Land on the admin dashboard.
  await page.waitForURL(/\/admin/, { timeout: 15_000 })
}

test.beforeEach(async () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run e2e tests')
})

test.describe('Account management', () => {
  test('admin can view and edit the role permission matrix', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/roles')

    await expect(page.getByRole('heading', { name: /roles.*permissions/i })).toBeVisible()

    // Toggle "View members" for the Finance role and confirm it persists on reload.
    const financeViewMembers = page.getByRole('checkbox', { name: /Finance — View members/i })
    const wasChecked = await financeViewMembers.isChecked()
    await financeViewMembers.click()
    await expect(financeViewMembers).toBeChecked({ checked: !wasChecked })

    await page.reload()
    await expect(page.getByRole('checkbox', { name: /Finance — View members/i })).toBeChecked({
      checked: !wasChecked,
    })

    // Admin column is always full access and locked.
    await expect(page.getByRole('checkbox', { name: /Administrator — /i }).first()).toBeDisabled()
  })

  test('admin can open the invite dialog and send an invitation', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/users')

    await expect(page.getByRole('heading', { name: /user accounts/i })).toBeVisible()

    await page.getByRole('button', { name: /invite user/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByLabel(/email/i).fill(INVITE_EMAIL)
    await page.getByLabel(/role/i).selectOption('finance')
    await page.getByRole('button', { name: /send invite/i }).click()

    // Either the invite emailed, or a shareable link is shown — both are success.
    await expect(
      page.getByText(/invitation email sent|account created for|invite link/i),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('finances shows the per-user PIN gate (set or enter)', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/finances')

    await expect(
      page.getByText(/set your finance pin|enter your finance pin/i),
    ).toBeVisible({ timeout: 15_000 })
  })
})
