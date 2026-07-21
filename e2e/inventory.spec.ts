import { test, expect, type Page } from '@playwright/test'

// End-to-end coverage for the Inventory module expansion:
//   1. Auth guard on the new broken-out routes (always runs, no login).
//   2. Full borrow / deployment lifecycle: submit a request -> approve ->
//      check out (condition before) -> record return (condition after).
//   3. Maintenance log: open the item's detail page and log maintenance.
//
// Preconditions (see e2e/README.md): the inventory_module migration applied,
// the app running, and admin credentials in E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
// The authenticated tests skip automatically when those are unset.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''

async function loginAsAdmin(page: Page) {
  await page.goto('/auth/login')
  // Target inputs by id — the TanStack devtools overlay injects elements whose
  // aria-labels also contain "password" (forgot/reset links), so getByLabel is
  // ambiguous in dev.
  await page.locator('#email').fill(ADMIN_EMAIL)
  await page.locator('#password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click()
  await page.waitForURL(/\/admin/, { timeout: 15_000 })
}

test.describe('Inventory — auth guard (no login)', () => {
  test('unauthenticated access to the borrow requests page redirects to login', async ({ page }) => {
    await page.goto('/admin/inventory/requests')
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 })
  })
})

test.describe('Inventory — borrow lifecycle & maintenance', () => {
  test.beforeEach(async () => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run')
  })

  test('submit a request, run it through the full lifecycle, then log maintenance', async ({ page }) => {
    const borrower = `E2E Custodian ${Date.now()}`

    await loginAsAdmin(page)
    await page.goto('/admin/inventory/requests')
    await expect(page.getByRole('heading', { name: /borrow.*deployment requests/i })).toBeVisible()

    // --- Submit a new request ------------------------------------------------
    await page.getByRole('button', { name: /new request/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Item is a searchable combobox — open it and pick the first item.
    await dialog.getByPlaceholder('Search item…').click()
    await page.getByRole('listbox').getByRole('option').first().click()

    // Leave "Responsible member" empty and use the free-text custodian name.
    await dialog.getByPlaceholder(/enter responsible person/i).fill(borrower)
    await dialog.getByPlaceholder(/why is this being borrowed/i).fill('E2E lifecycle test')

    await dialog.getByRole('button', { name: /submit request/i }).click()
    await expect(dialog).toBeHidden()

    // The new request appears as a card, pending approval.
    const card = page.locator('[data-slot="card"]').filter({ hasText: borrower })
    await expect(card).toBeVisible()
    await expect(card.getByText(/pending approval/i)).toBeVisible()

    // --- Approve -------------------------------------------------------------
    await card.getByRole('button', { name: /^approve$/i }).click()
    await expect(card.getByText(/^approved$/i)).toBeVisible()

    // --- Check out (records condition before) --------------------------------
    await card.getByRole('button', { name: /check out/i }).click()
    const checkoutDialog = page.getByRole('dialog')
    await expect(checkoutDialog.getByText(/check out item/i)).toBeVisible()
    await checkoutDialog.getByRole('button', { name: /check out/i }).click()
    await expect(card.getByText(/checked out/i)).toBeVisible()

    // --- Record return (records condition after) -----------------------------
    await card.getByRole('button', { name: /record return/i }).click()
    const returnDialog = page.getByRole('dialog')
    await expect(returnDialog.getByRole('heading', { name: /record return/i })).toBeVisible()
    await returnDialog.getByRole('button', { name: /record return/i }).click()
    await expect(card.getByText(/returned/i)).toBeVisible()

    // --- Open the item's detail page via the card's item link ----------------
    await card.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/admin\/inventory\/[0-9a-f-]{36}/, { timeout: 15_000 })
    await expect(page.getByText(/maintenance logs/i)).toBeVisible()

    // The returned borrow now shows in this item's history.
    await expect(page.getByText(borrower)).toBeVisible()

    // --- Log maintenance -----------------------------------------------------
    await page.getByRole('button', { name: /log maintenance/i }).click()
    const maintDialog = page.getByRole('dialog')
    await expect(maintDialog.getByRole('heading', { name: /log maintenance/i })).toBeVisible()
    await maintDialog.getByPlaceholder(/aircon deep cleaning/i).fill('E2E cleaning check')
    await maintDialog.getByRole('button', { name: /save log/i }).click()
    await expect(maintDialog).toBeHidden()

    // The new log is listed.
    await expect(page.getByText('E2E cleaning check')).toBeVisible()
  })
})
