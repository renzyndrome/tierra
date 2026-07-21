import { test, expect } from '@playwright/test'

// End-to-end coverage for the PUBLIC service check-in page (/checkin/<token>).
// No login required — the page is driven purely by the QR token + session state.
//
// Preconditions (see e2e/README.md):
//   - the service-attendance migration applied to the target database
//   - app running at E2E_BASE_URL
//   - E2E_CHECKIN_TOKEN        -> qr_token of an OPEN session   (guest test)
//   - E2E_CLOSED_CHECKIN_TOKEN -> qr_token of a CLOSED session  (closed test)
// Tests skip individually when their token is not provided.

const OPEN_TOKEN = process.env.E2E_CHECKIN_TOKEN || ''
const CLOSED_TOKEN = process.env.E2E_CLOSED_CHECKIN_TOKEN || ''

test.describe('Public service check-in', () => {
  test('invalid token shows an "invalid link" message', async ({ page }) => {
    await page.goto('/checkin/definitely-not-a-real-token-000')
    await expect(page.getByRole('heading', { name: /invalid check-in link/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('guest can check in to an open session', async ({ page }) => {
    test.skip(!OPEN_TOKEN, 'Set E2E_CHECKIN_TOKEN (an open session qr_token) to run this test')

    await page.goto(`/checkin/${OPEN_TOKEN}`)

    // The service header renders once the session resolves.
    await expect(page.getByRole('button', { name: /^check in$/i })).toBeVisible({ timeout: 15_000 })

    // Neutral church branding — NOT the one-time anniversary event.
    await expect(page.getByText(/quest laguna/i).first()).toBeVisible()
    await expect(page.getByText(/nextlevel stronger/i)).toHaveCount(0)

    // A unique name so this run is traceable and never collides with a real member.
    const guestName = `E2E Guest ${Date.now()}`
    await page.getByLabel(/your name/i).fill(guestName)
    await page.getByLabel(/who invited you/i).fill('E2E Inviter')
    await page.getByRole('button', { name: /^check in$/i }).click()

    // Success screen (matching is invisible to the attendee; pending still succeeds).
    await expect(page.getByRole('heading', { name: /you're checked in/i })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByText(guestName)).toBeVisible()
  })

  test('closed session refuses check-in', async ({ page }) => {
    test.skip(!CLOSED_TOKEN, 'Set E2E_CLOSED_CHECKIN_TOKEN (a closed session qr_token) to run this test')

    await page.goto(`/checkin/${CLOSED_TOKEN}`)
    await expect(page.getByRole('heading', { name: /check-in is closed/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('projectable QR display renders WITHOUT login (shareable to a tech booth)', async ({ page }) => {
    test.skip(!OPEN_TOKEN, 'Set E2E_CHECKIN_TOKEN (an open session qr_token) to run this test')

    // No auth — the display link is public (keyed by the QR token).
    await page.goto(`/display/${OPEN_TOKEN}`)
    await expect(page).toHaveURL(/\/display\//) // not redirected to login
    await expect(page.getByText(/scan to check in/i)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('svg').first()).toBeVisible()
  })
})
