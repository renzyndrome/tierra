import { test, expect, type Page } from '@playwright/test'

// End-to-end coverage for the admin Service Attendance flows:
//   1. Create a session and see it in the list
//   2. Open the live projectable QR display
//   3. Session detail tabs (check-ins / manual / review queue)
//   4. Analytics page renders
//
// Preconditions (see e2e/README.md): migration applied, app running, and an
// account with the registration.read/write permissions (admin works) in
// E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. Tests skip when creds are absent.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login')
  // Target the inputs by id: in dev the TanStack devtools panel injects elements
  // with aria-labels like ".../auth/reset-password", which collide with a
  // /password/i label lookup.
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click()
  await page.waitForURL(/\/admin/, { timeout: 15_000 })
}

test.beforeEach(async () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run e2e tests')
})

test.describe('Admin — Service Attendance', () => {
  test('admin can create a session and manage it', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance')
    await expect(page.getByRole('heading', { name: /service attendance/i })).toBeVisible()

    const label = `E2E ${Date.now()}`

    await page.getByRole('button', { name: /start a session|start your first session/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Service defaults to the first option; date defaults to today. Add a label
    // so this session is traceable, then create.
    await page.getByLabel(/^label/i).fill(label)
    await page.getByRole('button', { name: /create & open/i }).click()

    // Lands on the session detail page with the check-in counter and tabs.
    await page.waitForURL(/\/admin\/attendance\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(page.getByRole('tab', { name: /check-ins/i })).toBeVisible()

    // The review queue and manual tabs are available to a writer on an open session.
    await expect(page.getByRole('tab', { name: /review queue/i })).toBeVisible()
    await page.getByRole('tab', { name: /manual check-in/i }).click()
    await expect(page.getByPlaceholder(/search members/i)).toBeVisible()

    // Back on the list, the new session shows up with its label.
    await page.goto('/admin/attendance')
    await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 })
  })

  test('admin can open the live QR display', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance')

    const showQr = page.getByRole('button', { name: /show qr/i }).first()
    await expect(showQr).toBeVisible({ timeout: 15_000 })
    await showQr.click()

    // The projectable overlay shows the scan prompt and a QR (svg).
    await expect(page.getByText(/scan to check in/i)).toBeVisible()
    await expect(page.locator('svg').first()).toBeVisible()

    await page.getByRole('button', { name: /close qr display/i }).click()
    await expect(page.getByText(/scan to check in/i)).toBeHidden()
  })

  test('analytics page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance/analytics')
    await expect(page.getByRole('heading', { name: /attendance analytics/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('attendance tab is available in the admin dashboard', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin')
    await page.getByRole('tab', { name: /attendance/i }).click()
    // The embedded manager renders its heading and the start-session action.
    await expect(page.getByRole('heading', { name: /service attendance/i })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: /start a session|start your first session/i }).first()).toBeVisible()
  })
})
