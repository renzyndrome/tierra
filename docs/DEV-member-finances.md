# Dev Notes — Member Finances & Finance Authz (2026-07-21)

Handoff notes for the member Giving Statement, Church Expense Report, account↔member
linking, and the finance authorization hardening. Pairs with the user guide in
[USER-GUIDE-member-finances.md](./USER-GUIDE-member-finances.md).

> **Schema note:** `supabase/*.sql` is **gitignored** (`.gitignore` has `*.sql`), so
> migrations are NOT in version control. They are applied to the remote project via
> the Supabase MCP / SQL editor. The **"Schema changes"** section below is the
> tracked record of what was applied.

---

## Features & key files

### A. Member Giving Statement (SOA) — self-service, read-only
- Server: `getMyGivingStatement` in `src/server/functions/finances.ts`. Resolves the
  member **from the caller's token** (`getCaller` → `user_profiles.member_id`), never
  from client input. Returns totals, per-category breakdown, and entries for income
  rows tagged to that member. No `finances.*` permission or finance PIN required (own
  data, mirrors `getMyAttendance`).
- UI: route `src/routes/profile/giving.tsx`, presentational component
  `src/components/GivingStatement.tsx`. PDF/Excel via `src/lib/export.ts`.

### B. Church Expense Report — request → finance releases → aggregate view
- Table: `expense_report_requests` (lifecycle only; report computed live).
- Server: `src/server/functions/expenseReports.ts`
  - `createExpenseReportRequest` (member; **requires a linked member** or throws),
    `getMyExpenseReportRequests`, `getMyExpenseReport` (own + released only) — all
    token-scoped via `getCaller`.
  - `listExpenseReportRequests` (`finances.read`), `releaseExpenseReportRequest` /
    `rejectExpenseReportRequest` (`finances.write`). One-time review (pending-only).
  - `getMyExpenseReport` / `computeExpenseSummary` aggregate **expenses** by category
    + satellite for the request's period. Aggregate only — no line items exposed.
- UI: member `src/routes/profile/expense-report.tsx`; finance queue
  `src/routes/finances/report-requests.tsx` (linked from the finances header).

### C. Account ↔ member linking (admin)
- Server (`src/server/functions/users.ts`): `searchLinkableMembers` (name/email search
  + giving total + already-linked flag) and `linkAccountToMember` (set/unlink
  `user_profiles.member_id`; enforces 1 member ↔ 1 account). Gated on `users.manage`.
- UI: `src/routes/admin/users/index.tsx` — per-user "Link member record" dialog.
- Context: signup auto-links only by **exact email** (`completeOwnProfile` in
  `users.ts`); mismatches need manual linking here.

### D. Finance authorization hardening (critical fix)
- Every finance server fn in `finances.ts` now calls `requirePermission` (reads →
  `finances.read`, writes → `finances.write`). Previously they used the service-role
  client with **no server-side auth**, so any caller could read/write all finance data
  (TanStack Start server fns are directly-invokable RPC endpoints; there is **no
  middleware**). Callers updated: `src/routes/finances/index.tsx` (threads the session
  token into all calls) and `src/routes/admin/index.tsx` (fetches the finance overview
  only when the role has `finances.read`, degrading gracefully otherwise).
- **Behavior change:** the `/admin` dashboard finance card now loads only for
  `finances.read` roles (admin, finance). Non-finance admin-area roles no longer see
  church finance totals there.

---

## Schema changes applied (not in git — `*.sql` is ignored)

1. **`ft_member_own_income` RLS policy** on `financial_transactions` — ✅ applied
   (migration `member_giving_rls_backstop`). SELECT-only; a member reads only their
   own income via `public.get_user_member_id()`. Defense-in-depth (app path uses the
   service-role client). Does not touch `ft_admin_all` / `ft_sat_leader_all`.

2. **`expense_report_requests` table** — ✅ applied. Columns: `id, requested_by,
   member_id, period_start, period_end, status(pending|released|rejected), note,
   reviewed_by, reviewed_at, created_at, updated_at`; `chk_err_period` (end ≥ start);
   RLS enabled, **no client policies** (service-role only); `updated_at` trigger.

Local SQL sources (gitignored) for reference / rollback:
`supabase/2026-07-21_member_giving_rls.sql`, `supabase/2026-07-21_expense_report_requests.sql`
(+ their `*_rollback.sql`).

---

## Conventions & gotchas
- Server fns take `accessToken` and verify it server-side (`_authGuard.ts`); the app's
  Supabase session lives client-side, so tokens are passed explicitly.
- The Supabase client is typed with an incomplete `Database` type, so `.from(...)`
  results are `never` — the codebase casts with `as unknown as T`. New tables produce
  `no overload`/`never` tsc noise on insert/update; this is expected and ships via
  esbuild (the build does not run `tsc`). Verify with `pnpm build`.
- PostgREST join hint for members→satellites is `satellites!members_satellite_id_fkey`
  (two FKs exist between the tables). Finance→satellite uses
  `satellites!financial_transactions_satellite_id_fkey`.
- Only linked members may request an expense report (server throws; the member route
  hides the form when unlinked).
- **Never take a member/user id from client input** in the member self-service reads —
  always resolve it from the caller's token (`getCaller` → `user_profiles.member_id`).
  Conversely, every admin/finance function must call `requirePermission`: server
  functions are directly-invokable RPC endpoints with no middleware, so route guards
  and the finance PIN are client-side only and protect nothing on their own.
- The unit suite is **green (205/205 as of 2026-07-21)**. Two long-standing MemberForm
  failures were test drift (city is not a required field; the stage `<select>` renders
  display labels New Friends/Schooling/Leader rather than the DB values) and are fixed —
  treat a red suite as a real regression, not pre-existing noise.
