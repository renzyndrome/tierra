import { test, expect } from '@playwright/test'

// End-to-end coverage for the PUBLIC member sign-up page (/join/<token>).
// No login required — the page is driven purely by the circle's signup token.
//
// Preconditions (see e2e/README.md):
//   - the member-claims migration applied to the target database
//   - app running at E2E_BASE_URL
//   - E2E_JOIN_TOKEN -> token of a cell_group_signup_links row with enabled=true
// Tests needing a real token skip individually when it is not provided.
//
// NOTE: the happy-path test creates a real auth user. Use a throwaway address
// and clean it up afterwards (deleting the auth user cascades user_profiles and
// member_claim_requests).

const JOIN_TOKEN = process.env.E2E_JOIN_TOKEN || ''

test.describe('Public member sign-up', () => {
  test('unknown token shows the inactive-link message', async ({ page }) => {
    await page.goto('/join/definitely-not-a-real-token-000')
    await expect(page.getByRole('heading', { name: /sign-up link inactive/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('an active link shows the sign-up form', async ({ page }) => {
    test.skip(!JOIN_TOKEN, 'Set E2E_JOIN_TOKEN (an enabled circle signup token) to run this test')

    await page.goto(`/join/${JOIN_TOKEN}`)
    await expect(page.getByRole('heading', { name: /account setup/i })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.locator('#join-name')).toBeVisible()
    await expect(page.locator('#join-email')).toBeVisible()
    await expect(page.locator('#join-phone')).toBeVisible()
    await expect(page.locator('#join-birthday')).toBeVisible()
  })

  test('rejects an invalid email before submitting', async ({ page }) => {
    test.skip(!JOIN_TOKEN, 'Set E2E_JOIN_TOKEN (an enabled circle signup token) to run this test')

    await page.goto(`/join/${JOIN_TOKEN}`)
    await page.locator('#join-name').fill('Test Person')
    await page.locator('#join-email').fill('not-an-email')
    await page.getByRole('button', { name: /^sign up$/i }).click()
    await expect(page.getByText(/email address invalid/i)).toBeVisible()
  })

  test('rejects a too-short name', async ({ page }) => {
    test.skip(!JOIN_TOKEN, 'Set E2E_JOIN_TOKEN (an enabled circle signup token) to run this test')

    await page.goto(`/join/${JOIN_TOKEN}`)
    await page.locator('#join-name').fill('X')
    await page.locator('#join-email').fill('someone@example.com')
    await page.getByRole('button', { name: /^sign up$/i }).click()
    await expect(page.getByText(/full name required/i)).toBeVisible()
  })

  test('submitting shows the check-your-email screen', async ({ page }) => {
    test.skip(!JOIN_TOKEN, 'Set E2E_JOIN_TOKEN (an enabled circle signup token) to run this test')
    test.skip(
      !process.env.E2E_CLAIM_EMAIL,
      'Set E2E_CLAIM_EMAIL to a throwaway address — this creates a real auth user',
    )

    await page.goto(`/join/${JOIN_TOKEN}`)
    await page.locator('#join-name').fill('E2E Claim Test')
    await page.locator('#join-email').fill(process.env.E2E_CLAIM_EMAIL!)
    await page.getByRole('button', { name: /^sign up$/i }).click()

    await expect(page.getByRole('heading', { name: /confirmation email sent|sign-up recorded/i })).toBeVisible({
      timeout: 20_000,
    })
  })
})

test.describe('Self-signup is locked', () => {
  test('/auth/register redirects to the login page', async ({ page }) => {
    await page.goto('/auth/register')
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 })
  })

  test('the login page offers no self sign-up', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: /^sign up$/i })).toHaveCount(0)
  })
})
