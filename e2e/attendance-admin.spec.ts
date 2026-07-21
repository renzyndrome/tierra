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
// A session id that already has a pending (unmatched) guest check-in in its
// review queue — seed one, then pass its id here.
const QUEUE_SESSION_ID = process.env.E2E_QUEUE_SESSION_ID || ''

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

  test('admin can open the projectable QR display in a new window', async ({ page, context }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance')

    const showQr = page.getByRole('button', { name: /show qr/i }).first()
    await expect(showQr).toBeVisible({ timeout: 15_000 })

    // "Show QR" opens the PUBLIC projectable page (/display/<token>) in a new
    // window, so it can be screened while check-ins are managed on this window.
    const [qrPage] = await Promise.all([context.waitForEvent('page'), showQr.click()])
    await qrPage.waitForLoadState()

    await expect(qrPage).toHaveURL(/\/display\//)
    await expect(qrPage.getByText(/scan to check in/i)).toBeVisible({ timeout: 15_000 })
    await expect(qrPage.locator('svg').first()).toBeVisible()
    await qrPage.close()
  })

  test('analytics page renders', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance/analytics')
    await expect(page.getByRole('heading', { name: /attendance analytics/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('admin can confirm a suggested match ("This is them") from the review queue', async ({ page }) => {
    test.skip(!QUEUE_SESSION_ID, 'Set E2E_QUEUE_SESSION_ID (a session with a pending guest check-in)')

    await loginAsAdmin(page)
    await page.goto(`/admin/attendance/${QUEUE_SESSION_ID}`)
    await page.getByRole('tab', { name: /review queue/i }).click()

    // The seeded near-name check-in gets a high-confidence best-match suggestion
    // (blended scoring: token-based confidence tops up trigram similarity).
    await expect(page.getByText(/best match/i).first()).toBeVisible({ timeout: 15_000 })
    const beforeButtons = await page.getByRole('button', { name: /this is them/i }).count()
    expect(beforeButtons).toBeGreaterThan(0)

    // Confirm the best match on the first pending card.
    await page.getByRole('button', { name: /this is them/i }).first().click()

    // The resolved record leaves the queue.
    await expect(page.getByRole('button', { name: /this is them/i })).toHaveCount(0, {
      timeout: 15_000,
    })
  })

  test('admin can create a NEW member from a pending review-queue check-in', async ({ page }) => {
    test.skip(!QUEUE_SESSION_ID, 'Set E2E_QUEUE_SESSION_ID (a session with a pending guest check-in)')

    await loginAsAdmin(page)
    await page.goto(`/admin/attendance/${QUEUE_SESSION_ID}`)

    // Open the review queue and confirm there is something to resolve.
    await page.getByRole('tab', { name: /review queue/i }).click()
    const createBtn = page.getByRole('button', { name: /create new member/i }).first()
    await expect(createBtn).toBeVisible({ timeout: 15_000 })
    await createBtn.click()

    // The prefilled create-member dialog.
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /create member from check-in/i })).toBeVisible()

    // Submit — creates a visitor member and links this check-in to it.
    await dialog.getByRole('button', { name: /create & link/i }).click()

    // Dialog closes and the record leaves the pending queue.
    await expect(dialog).toBeHidden({ timeout: 15_000 })
  })

  test('admin can delete a session (with its check-ins)', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/admin/attendance')

    // Create a throwaway session to delete.
    const label = `E2E DEL ${Date.now()}`
    await page.getByRole('button', { name: /start a session|start your first session/i }).first().click()
    await page.getByLabel(/^label/i).fill(label)
    await page.getByRole('button', { name: /create & open/i }).click()
    await page.waitForURL(/\/admin\/attendance\/[0-9a-f-]{36}/, { timeout: 15_000 })

    // Delete it from the Manage page (confirm dialog).
    await page.getByRole('button', { name: /delete session/i }).click()
    await page.getByRole('button', { name: /yes, delete/i }).click()

    // Back on the list; the session is gone.
    await page.waitForURL(/\/admin\/attendance\/?$/, { timeout: 15_000 })
    await expect(page.getByText(label)).toBeHidden()
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
