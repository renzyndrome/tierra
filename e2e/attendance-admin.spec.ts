import { test, expect, devices, type Page, type Locator } from '@playwright/test'

// End-to-end coverage for the admin Service Attendance flows:
//   1. Create a session and see it in the list
//   2. Open the live projectable QR display
//   3. Session detail tabs (check-ins / manual / review queue)
//   4. Analytics page renders
//   5. Full workflow: guest QR check-in -> manual check-in -> review -> close
//   6. Overdue sessions (dated before today) are flagged and refuse QR check-in
//   7. Walk-in registration at the booth (similar-name warning)
//   8. Linking check-ins: a nickname QR guest with an email, and a walk-in
//      wrongly registered as new (re-link + duplicate archive)
//   9. Phone screens: the QR form and the booth registration form
//
// Every test that creates a session deletes it again (the e2e target is often
// the live database; deleting a session cascades its check-ins).
//
// Preconditions (see e2e/README.md): migration applied, app running, and an
// account with the registration.read/write permissions (admin works) in
// E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. Tests skip when creds are absent.

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || ''
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || ''
// A session id that already has a pending (unmatched) guest check-in in its
// review queue — seed one, then pass its id here.
const QUEUE_SESSION_ID = process.env.E2E_QUEUE_SESSION_ID || ''
// A name fragment that matches at least one directory member (manual check-in).
const MEMBER_QUERY = process.env.E2E_MEMBER_QUERY || 'an'
// Registering a walk-in creates a real member record that the session delete
// does not remove. Only run those steps when the target database may receive
// them (delete the 'E2E Walkin%', 'E2E Resolve%' and '%E2eqzv%' members
// afterwards).
const ALLOW_MEMBER_WRITES = process.env.E2E_ALLOW_MEMBER_WRITES === '1'
// The app server runs with TYPESAFE_API_KEY, so Jev tags likely matches.
const EXPECT_JEV = process.env.E2E_EXPECT_JEV === '1'

// YYYY-MM-DD in the church's time zone, offset by whole days.
function manilaDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

// Create a labeled session (optionally on a given date) and return the URL of
// its Manage page, where the browser lands after creation.
async function createSession(page: Page, label: string, date?: string): Promise<string> {
  await page.goto('/admin/attendance')
  await page.getByRole('button', { name: /start a session|start your first session/i }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  if (date) await page.locator('#svc-date').fill(date)
  await page.getByLabel(/^label/i).fill(label)
  await page.getByRole('button', { name: /create & open/i }).click()
  await page.waitForURL(/\/admin\/attendance\/[0-9a-f-]{36}/, { timeout: 15_000 })
  // The URL flips before the Manage page renders; wait for its own controls.
  await expect(page.getByRole('button', { name: /delete session/i })).toBeVisible({ timeout: 15_000 })
  return page.url()
}

// Delete the session at the given Manage URL (cleanup).
async function deleteSessionAt(page: Page, url: string) {
  await page.goto(url)
  await page.getByRole('button', { name: /delete session/i }).click()
  await page.getByRole('button', { name: /yes, delete/i }).click()
  await page.waitForURL(/\/admin\/attendance\/?$/, { timeout: 15_000 })
}

// Read the session's public QR token from the "Show QR (new window)" popup URL.
async function readQrToken(page: Page): Promise<string> {
  const [popup] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByRole('button', { name: /show qr/i }).click(),
  ])
  await popup.waitForLoadState()
  const token = new URL(popup.url()).pathname.split('/').pop() ?? ''
  await popup.close()
  expect(token).not.toBe('')
  return token
}

// Submit the walk-in dialog and wait for the registration notice. Test members
// left by an earlier run count as similar names, so the warning is confirmed
// with "Register anyway" when it appears.
async function submitWalkIn(page: Page, name: string) {
  const dialog = page.getByRole('dialog')
  const notice = page.getByText(`${name} registered and checked in ✓`)
  const anyway = dialog.getByRole('button', { name: /register anyway/i })
  await dialog.getByRole('button', { name: /register & check in/i }).click()
  await expect(notice.or(anyway)).toBeVisible({ timeout: 15_000 })
  if (await anyway.isVisible()) await anyway.click()
  await expect(notice).toBeVisible({ timeout: 15_000 })
}

// A mid-size phone, short enough that the booth registration form must scroll.
const PHONE = {
  viewport: { width: 390, height: 700 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: devices['iPhone 13'].userAgent,
}

// No sideways scrolling, and every visible field has 16px+ text (smaller text
// makes iOS Safari zoom on focus) and a 44px+ tap target.
async function expectPhoneFriendly(page: Page, scope: Locator) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  const fields = await scope.locator('input:visible, select:visible').all()
  expect(fields.length).toBeGreaterThan(0)
  for (const field of fields) {
    const { id, size, height } = await field.evaluate((el) => ({
      id: el.id,
      size: parseFloat(getComputedStyle(el).fontSize),
      // Layout height: ignores the dialog's zoom-in animation transform.
      height: (el as HTMLElement).offsetHeight,
    }))
    expect(size, `font size of #${id}`).toBeGreaterThanOrEqual(16)
    expect(height, `height of #${id}`).toBeGreaterThanOrEqual(44)
  }
}

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

    const sessionUrl = page.url()

    // Back on the list, the new session shows up with its label.
    await page.goto('/admin/attendance')
    await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 })

    await deleteSessionAt(page, sessionUrl)
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

  test('full workflow: guest QR check-in, manual check-in, review, close', async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const sessionUrl = await createSession(page, `E2E FLOW ${Date.now()}`)

    try {
      const token = await readQrToken(page)

      // 1. A guest scans the QR in a separate, signed-out browser.
      const guestCtx = await browser.newContext({ baseURL })
      const guest = await guestCtx.newPage()
      const guestName = `E2E Guest ${Date.now()}`
      await guest.goto(`/checkin/${token}`)
      await guest.getByLabel(/your name/i).fill(guestName)
      await guest.getByRole('button', { name: /^check in$/i }).click()
      await expect(guest.getByRole('heading', { name: /you're checked in/i })).toBeVisible({
        timeout: 15_000,
      })

      // 2. Staff sees the guest check-in.
      await page.reload()
      await expect(page.getByRole('tab', { name: /check-ins \(1\)/i })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(guestName)).toBeVisible()

      // 3. Manual check-in: search the directory and check a member in.
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      await page.getByPlaceholder(/search members/i).fill(MEMBER_QUERY)
      const checkInBtn = page.getByRole('button', { name: /^check in$/i }).first()
      await expect(checkInBtn).toBeVisible({ timeout: 15_000 })
      await checkInBtn.click()
      await expect(page.getByText(/checked in ✓/)).toBeVisible({ timeout: 15_000 })
      // The same member now shows as already checked in, and the count moved.
      await expect(page.getByRole('button', { name: /^checked in$/i }).first()).toBeDisabled()
      await expect(page.getByRole('tab', { name: /check-ins \(2\)/i })).toBeVisible()

      // 4. Review queue: the guest is pending; ignore it (a test entry).
      await page.getByRole('tab', { name: /review queue/i }).click()
      await expect(page.getByText(guestName)).toBeVisible()
      await page.getByRole('button', { name: /^ignore$/i }).first().click()
      await expect(page.getByText(/nothing to review/i)).toBeVisible({ timeout: 15_000 })
      // Ignored check-ins do not count.
      await expect(page.getByRole('tab', { name: /check-ins \(1\)/i })).toBeVisible()

      // 5. Close the session; the QR now refuses check-ins.
      await page.getByRole('button', { name: /close session/i }).click()
      await expect(page.getByRole('button', { name: /reopen session/i })).toBeVisible({ timeout: 15_000 })
      await guest.goto(`/checkin/${token}`)
      await expect(guest.getByRole('heading', { name: /check-in is closed/i })).toBeVisible({
        timeout: 15_000,
      })
      await guestCtx.close()
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })

  test('an open session dated before today is flagged overdue and its QR refuses check-in', async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000)
    await loginAsAdmin(page)
    const label = `E2E OVERDUE ${Date.now()}`
    const sessionUrl = await createSession(page, label, manilaDate(-1))

    try {
      // Manage page: overdue badge + notice. Manual check-in stays available
      // on an open past session (backfill from a paper list).
      await expect(page.getByText(/^overdue$/i).first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(/service date passed/i)).toBeVisible()
      await expect(page.getByRole('tab', { name: /manual check-in/i })).toBeVisible()

      // The public QR refuses check-ins even though the session is still open.
      const token = await readQrToken(page)
      const anonCtx = await browser.newContext({ baseURL })
      const anon = await anonCtx.newPage()
      await anon.goto(`/checkin/${token}`)
      await expect(anon.getByRole('heading', { name: /check-in is closed/i })).toBeVisible({
        timeout: 15_000,
      })
      await anonCtx.close()

      // Session list: the bulk close action is offered. It is NOT clicked here:
      // it would also close real overdue sessions in the target database.
      await page.goto('/admin/attendance')
      await expect(page.getByText(label)).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: /close overdue sessions/i })).toBeVisible()
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })

  test('walk-in at the booth: similar-name warning, then registration', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const sessionUrl = await createSession(page, `E2E WALKIN ${Date.now()}`)

    try {
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      const search = page.getByPlaceholder(/search members/i)

      // 1. Registering an existing member's exact name shows the similar-name
      //    warning instead of creating a duplicate. Nothing is written.
      await search.fill(MEMBER_QUERY)
      const firstName = (await page.locator('[data-slot="card"] p.font-medium').first().innerText()).trim()
      await page.getByRole('button', { name: /register new member/i }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel(/^name/i).fill(firstName)
      await dialog.getByRole('button', { name: /register & check in/i }).click()
      await expect(dialog.getByText(/similar names in the directory/i)).toBeVisible({ timeout: 15_000 })
      await expect(dialog.getByText(firstName, { exact: true }).first()).toBeVisible()
      await dialog.getByRole('button', { name: /^cancel$/i }).click()
      await expect(dialog).toBeHidden()

      // A typo of that name (second letter dropped) is flagged too.
      const typo = firstName.slice(0, 1) + firstName.slice(2)
      await page.getByRole('button', { name: /register new member/i }).click()
      await dialog.getByLabel(/^name/i).fill(typo)
      await dialog.getByRole('button', { name: /register & check in/i }).click()
      await expect(dialog.getByText(/similar names in the directory/i)).toBeVisible({ timeout: 15_000 })
      await expect(dialog.getByText(firstName, { exact: true }).first()).toBeVisible()
      await dialog.getByRole('button', { name: /^cancel$/i }).click()
      await expect(dialog).toBeHidden()

      // 2. A person not in the directory is registered and checked in.
      test.skip(!ALLOW_MEMBER_WRITES, 'Set E2E_ALLOW_MEMBER_WRITES=1 to create (and later delete) a test member')
      const walkIn = `E2E Walkin ${Date.now()}`
      await search.fill(walkIn)
      await expect(page.getByText(/no members found/i)).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: /register new member/i }).click()
      await expect(dialog.getByLabel(/^name/i)).toHaveValue(walkIn)
      // An explicit "Unassigned" must be kept (not replaced by the session's satellite).
      await dialog.locator('#wi-sat').selectOption('')
      // Optional details land on the new member record.
      await dialog.getByLabel(/^mobile/i).fill('09171234567')
      await dialog.getByLabel(/^city/i).fill('Santa Rosa')
      await dialog.locator('#wi-gender').selectOption('female')
      await dialog.getByLabel(/^age/i).fill('72')
      await submitWalkIn(page, walkIn)
      await expect(page.getByRole('tab', { name: /check-ins \(1\)/i })).toBeVisible()
      await page.getByRole('tab', { name: /check-ins/i }).click()
      await expect(page.getByText(walkIn)).toBeVisible()
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })

  test('link check-ins: nickname QR guest with email, and a duplicate walk-in', async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(!ALLOW_MEMBER_WRITES, 'Set E2E_ALLOW_MEMBER_WRITES=1 to create (and later delete) test members')
    test.setTimeout(180_000)
    await loginAsAdmin(page)
    const ts = Date.now()
    const memberName = `E2E Resolve Target ${ts}`
    const dupName = `${memberName} Dup`
    const email = `e2e-resolve-${ts}@example.com`
    const nickname = `Targ ${ts}`
    const sessionUrl = await createSession(page, `E2E RESOLVE ${ts}`)
    const card = (text: string) => page.locator('[data-slot="card"]', { hasText: text })
    const dialog = page.getByRole('dialog')

    try {
      // 1. Booth registers member A (with email), then that check-in is
      //    removed so A is in the directory but not checked in.
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      await page.getByPlaceholder(/search members/i).fill(memberName)
      await expect(page.getByText(/no members found/i)).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: /register new member/i }).click()
      await dialog.getByLabel(/^email/i).fill(email)
      await submitWalkIn(page, memberName)
      await page.getByRole('tab', { name: /check-ins/i }).click()
      await card(memberName).getByRole('button', { name: /^remove$/i }).click()
      await expect(page.getByText(/no check-ins yet/i)).toBeVisible({ timeout: 15_000 })

      // 2. A guest checks in by QR with a nickname and A's email. An invalid
      //    email is refused first.
      const token = await readQrToken(page)
      const guestCtx = await browser.newContext({ baseURL })
      const guest = await guestCtx.newPage()
      await guest.goto(`/checkin/${token}`)
      await guest.getByLabel(/your name/i).fill(nickname)
      await guest.getByLabel(/^email/i).fill('not-an-email')
      await guest.getByRole('button', { name: /^check in$/i }).click()
      await expect(guest.getByText(/email address invalid/i)).toBeVisible()
      await guest.getByLabel(/^email/i).fill(email.toUpperCase())
      await guest.getByRole('button', { name: /^check in$/i }).click()
      await expect(guest.getByRole('heading', { name: /you're checked in/i })).toBeVisible({ timeout: 15_000 })
      await guestCtx.close()

      // 3. The nickname stays unmatched (no auto-link by email alone).
      await page.reload()
      await expect(card(nickname).getByText('(unmatched)')).toBeVisible({ timeout: 15_000 })

      // 4. "New member" from that check-in warns: A already holds the email.
      await card(nickname).getByRole('button', { name: /^link member$/i }).click()
      await expect(dialog.getByRole('heading', { name: /link check-in/i })).toBeVisible()
      await expect(dialog.getByText(/email match/i)).toBeVisible()
      await dialog.getByRole('button', { name: /^new member$/i }).click()
      await expect(dialog.getByRole('heading', { name: /create member from check-in/i })).toBeVisible()
      await expect(dialog.locator('#cm-email')).toHaveValue(email)
      await dialog.getByRole('button', { name: /create & link/i }).click()
      await expect(dialog.getByText(/similar names in the directory/i)).toBeVisible({ timeout: 15_000 })
      await expect(dialog.getByText(memberName, { exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: /^cancel$/i }).click()
      await expect(dialog).toBeHidden()

      // 5. Link the guest to A from the directory search.
      await card(nickname).getByRole('button', { name: /^link member$/i }).click()
      await dialog.getByPlaceholder(/search members/i).fill(memberName)
      const resultRow = dialog.locator('div.rounded-lg', { has: page.getByText(memberName, { exact: true }) }).last()
      await resultRow.getByRole('button', { name: /^link$/i }).click()
      await expect(page.getByText(`Linked to ${memberName} ✓`)).toBeVisible({ timeout: 15_000 })
      const linkedRow = card(`Typed: ${nickname}`)
      await expect(linkedRow.getByText(/^confirmed$/i)).toBeVisible()
      await expect(linkedRow.getByRole('button', { name: /^change$/i })).toBeVisible()

      // 6. A walk-in for the same person is registered as new anyway (B).
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      await page.getByPlaceholder(/search members/i).fill(dupName)
      await page.getByRole('button', { name: /register new member/i }).click()
      await dialog.getByRole('button', { name: /register & check in/i }).click()
      await expect(dialog.getByText(/similar names in the directory/i)).toBeVisible({ timeout: 15_000 })
      await dialog.getByRole('button', { name: /register anyway/i }).click()
      await expect(page.getByText(`${dupName} registered and checked in ✓`)).toBeVisible({ timeout: 15_000 })

      // 7. Staff corrects B's check-in to A: A is already checked in, so the
      //    check-in folds (ignored) and B's visitor record is archived.
      await page.getByRole('tab', { name: /check-ins/i }).click()
      await card(dupName).getByRole('button', { name: /^change$/i }).click()
      await expect(dialog.getByLabel(/archive duplicate record/i)).toBeChecked()
      await dialog.getByPlaceholder(/search members/i).fill(memberName)
      const targetRow = dialog.locator('div.rounded-lg', { has: page.getByText(memberName, { exact: true }) }).last()
      await targetRow.getByRole('button', { name: /^link$/i }).click()
      await expect(page.getByText(/already checked in\. This check-in marked ignored\. Duplicate record archived\./)).toBeVisible({
        timeout: 15_000,
      })
      await expect(card(dupName).getByText(/^ignored$/i)).toBeVisible()
      // The folded check-in drops its old link (the archived duplicate).
      await expect(card(dupName).getByText('(unmatched)')).toBeVisible()
      await expect(card(dupName).getByRole('button', { name: /^link member$/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /check-ins \(1\)/i })).toBeVisible()
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })
  test('manual check-in suggests a member for initials plus surname', async ({ page }) => {
    test.skip(!ALLOW_MEMBER_WRITES, 'Set E2E_ALLOW_MEMBER_WRITES=1 to create (and later delete) a test member')
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    // A made-up surname keeps real members out of the suggestions.
    const surname = `E2eqzv${String(Date.now()).slice(-5).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])}`
    const memberName = `Juan Carlos ${surname}`
    const sessionUrl = await createSession(page, `E2E SUGGEST ${Date.now()}`)

    try {
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      await page.getByPlaceholder(/search members/i).fill(memberName)
      await expect(page.getByText(/no members found/i)).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: /register new member/i }).click()
      await submitWalkIn(page, memberName)
      await page.getByRole('tab', { name: /check-ins/i }).click()
      await page.locator('[data-slot="card"]', { hasText: memberName }).getByRole('button', { name: /^remove$/i }).click()
      await expect(page.getByText(/no check-ins yet/i)).toBeVisible({ timeout: 15_000 })

      // "JC <surname>" matches no name directly, so the member is suggested.
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      await page.getByPlaceholder(/search members/i).fill(`JC ${surname}`)
      await expect(page.getByText(/no exact name match/i)).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText(/suggested members/i)).toBeVisible()
      const row = page.locator('[data-slot="card"]', { hasText: memberName })
      await expect(row.getByText(/same initials/i)).toBeVisible()
      await row.getByRole('button', { name: /^check in$/i }).click()
      await expect(page.getByText(`${memberName} checked in ✓`)).toBeVisible({ timeout: 15_000 })
      await expect(row.getByRole('button', { name: /^checked in$/i })).toBeDisabled()
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })

  test('phone: QR form and booth registration fit a phone screen', async ({ page, browser, baseURL }) => {
    test.setTimeout(150_000)
    await loginAsAdmin(page)
    const sessionUrl = await createSession(page, `E2E PHONE ${Date.now()}`)

    try {
      const token = await readQrToken(page)

      // 1. A guest on a phone.
      const guestCtx = await browser.newContext({ ...PHONE, baseURL })
      const guest = await guestCtx.newPage()
      await guest.goto(`/checkin/${token}`)
      const nameField = guest.getByLabel(/your name/i)
      await expect(nameField).toBeVisible({ timeout: 15_000 })
      await expectPhoneFriendly(guest, guest.locator('form'))
      await expect(guest.getByText('For a church account setup soon.')).toBeVisible()
      // The keyboard's next key moves on instead of sending a half-filled form.
      await nameField.fill('E2E Phone Guest')
      await nameField.press('Enter')
      await expect(guest.getByLabel(/^email/i)).toBeFocused()
      await guest.getByLabel(/^email/i).press('Enter')
      await expect(guest.getByLabel(/who invited you/i)).toBeFocused()
      await expect(guest.getByRole('heading', { name: /you're checked in/i })).toHaveCount(0)
      await guest.screenshot({ path: test.info().outputPath('phone-checkin.png'), fullPage: true })
      await guestCtx.close()

      // 2. Booth staff on a phone: the registration form scrolls inside the
      //    dialog, so its buttons stay reachable. Nothing is saved.
      const staffCtx = await browser.newContext({ ...PHONE, baseURL })
      const staff = await staffCtx.newPage()
      await loginAsAdmin(staff)
      await staff.waitForLoadState('networkidle')
      await staff.goto(sessionUrl)
      await staff.getByRole('tab', { name: /manual check-in/i }).click()
      const search = staff.getByPlaceholder(/search members/i)
      await expectPhoneFriendly(staff, staff.locator('[role="tabpanel"]'))
      await search.fill(`E2E Phone ${Date.now()}`)
      await staff.getByRole('button', { name: /register new member/i }).click()
      const dialog = staff.getByRole('dialog')
      await expect(dialog.getByLabel(/^name/i)).toBeVisible()
      await expectPhoneFriendly(staff, dialog)
      await staff.screenshot({ path: test.info().outputPath('phone-register-top.png') })
      const submit = dialog.getByRole('button', { name: /register & check in/i })
      await submit.scrollIntoViewIfNeeded()
      await expect(submit).toBeInViewport()
      await staff.screenshot({ path: test.info().outputPath('phone-register-bottom.png') })
      await dialog.getByRole('button', { name: /^cancel$/i }).click()
      await expect(dialog).toBeHidden()
      await staffCtx.close()
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })

  test('Jev tags the likely member for a nickname check-in', async ({ page, browser, baseURL }) => {
    test.skip(!ALLOW_MEMBER_WRITES || !EXPECT_JEV, 'Set E2E_ALLOW_MEMBER_WRITES=1 and E2E_EXPECT_JEV=1')
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    // A made-up surname: only these test names reach Jev.
    const surname = `Xylofrent${String(Date.now()).slice(-4).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])}`
    const memberName = `Katherine ${surname}`
    const sessionUrl = await createSession(page, `E2E JEV ${Date.now()}`)

    try {
      await page.getByRole('tab', { name: /manual check-in/i }).click()
      await page.getByPlaceholder(/search members/i).fill(memberName)
      await page.getByRole('button', { name: /register new member/i }).click()
      await submitWalkIn(page, memberName)
      await page.getByRole('tab', { name: /check-ins/i }).click()
      await page.locator('[data-slot="card"]', { hasText: memberName }).getByRole('button', { name: /^remove$/i }).click()
      await expect(page.getByText(/no check-ins yet/i)).toBeVisible({ timeout: 15_000 })

      const token = await readQrToken(page)
      const guestCtx = await browser.newContext({ baseURL })
      const guest = await guestCtx.newPage()
      await guest.goto(`/checkin/${token}`)
      await guest.getByLabel(/your name/i).fill(`Kat ${surname}`)
      await guest.getByRole('button', { name: /^check in$/i }).click()
      await expect(guest.getByRole('heading', { name: /you're checked in/i })).toBeVisible({ timeout: 15_000 })
      await guestCtx.close()

      await page.reload()
      await page.getByRole('tab', { name: /review queue/i }).click()
      const suggestion = page.locator('div.rounded-lg', { has: page.getByText(memberName, { exact: true }) }).last()
      await expect(suggestion.getByText(/likely match/i)).toBeVisible({ timeout: 20_000 })
    } finally {
      await deleteSessionAt(page, sessionUrl)
    }
  })
})
