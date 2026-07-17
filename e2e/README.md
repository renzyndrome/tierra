# E2E tests (Playwright)

Covers:
- **Account management** (`account-management.spec.ts`): role/permission matrix,
  user invitations, and the per-user finance PIN gate.
- **Service attendance — public** (`attendance-public.spec.ts`): the public QR
  check-in page (invalid token, guest check-in, closed session). Needs no login.
- **Service attendance — admin** (`attendance-admin.spec.ts`): create a session,
  the live QR display, session detail tabs, and analytics. Needs an admin login.

## One-time setup

```bash
pnpm add -D @playwright/test      # add the dependency
pnpm test:e2e:install             # download the Chromium browser
```

## Prerequisites before running

1. **Migration applied** — `supabase/2026-07-16_account_management.sql` must be
   applied to the database the app points at (a dev/staging project is strongly
   recommended, not production).
2. **App running** — start it (`pnpm dev`) or set `E2E_BASE_URL` to a deployed URL.
3. **Admin account** — an existing user whose `user_profiles.role = 'admin'`.

## Run

```bash
E2E_ADMIN_EMAIL="admin@example.org" \
E2E_ADMIN_PASSWORD="••••••" \
E2E_BASE_URL="http://localhost:3000" \
pnpm test:e2e
```

Optional env:

| Var | Purpose | Default |
|-----|---------|---------|
| `E2E_BASE_URL` | App base URL | `http://localhost:3000` |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin login (tests skip if unset) | — |
| `E2E_INVITE_EMAIL` | Address used by the invite test | `e2e+<ts>@example.com` |
| `E2E_CHECKIN_TOKEN` | `qr_token` of an **open** session (public guest test) | — |
| `E2E_CLOSED_CHECKIN_TOKEN` | `qr_token` of a **closed** session (public closed test) | — |
| `E2E_START_SERVER=1` | Let Playwright run `pnpm dev` itself | off |

The tests **skip** automatically when their required env is not provided, so
they are safe to include in a suite that hasn't been configured yet.

## Seeding tokens for the public check-in test

The public spec (`attendance-public.spec.ts`) drives real sessions by their QR
token. The invalid-token test always runs; the guest and closed tests need a
seeded session each. Create throwaway sessions and read their tokens:

```sql
-- one OPEN and one CLOSED session (labeled for easy cleanup)
insert into service_sessions (service_type_id, session_date, title, is_open, closed_at)
select id, current_date, 'E2E_OPEN',   true,  null  from service_types where slug='sunday';
insert into service_sessions (service_type_id, session_date, title, is_open, closed_at)
select id, current_date, 'E2E_CLOSED', false, now() from service_types where slug='sunday';

select title, qr_token from service_sessions where title in ('E2E_OPEN','E2E_CLOSED');
```

Run, then clean up:

```bash
E2E_CHECKIN_TOKEN="<open token>" \
E2E_CLOSED_CHECKIN_TOKEN="<closed token>" \
pnpm test:e2e attendance-public

# cleanup (cascades the test check-ins):
# delete from service_sessions where title in ('E2E_OPEN','E2E_CLOSED');
```
