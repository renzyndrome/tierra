# Applying the Account Management migration

**File:** `2026-07-16_account_management.sql` (rollback: `2026-07-16_account_management_rollback.sql`)
**Backup taken first:** `tierra-app/data/backups/2026-07-16_151146_pre_account_mgmt/`

The migration is **additive and reversible**. The only change to existing row
data is a single-row role remap (`super_admin → admin`), because there is
currently exactly one account (`admin@questlaguna.org`).

## What it changes
1. `user_profiles.role` CHECK → `admin | finance | satellite | registration | discipleship | member`, remapping existing values.
2. RLS helpers `is_admin()`, `is_leader_or_admin()`, `is_any_leader()` → new role names.
3. Finance policies `ft_admin_all` (admin+finance), `ft_sat_leader_all` (satellite).
4. New table `role_permissions` (+ seed defaults) — editable role→permission matrix.
5. New table `user_invitations` — invite audit trail (service-role only).
6. New table `user_finance_pins` — per-user finance PIN hashes (service-role only).

## Option A — Supabase dashboard (SQL editor)
1. Open the project → SQL Editor.
2. Paste the contents of `2026-07-16_account_management.sql`, run it.
3. Run the verification queries below.

## Option B — Supabase CLI / MCP `apply_migration`
Apply each numbered section as its own named migration (mirrors the 2026-07-10
hardening approach), e.g. `account_mgmt_roles`, `account_mgmt_rls_helpers`,
`account_mgmt_finance_policies`, `account_mgmt_role_permissions`,
`account_mgmt_invitations`, `account_mgmt_finance_pins`.

## Post-apply verification
```sql
-- roles remapped + constraint widened
select role, count(*) from user_profiles group by role;              -- expect: admin = 1
select pg_get_constraintdef(oid) from pg_constraint where conname = 'user_profiles_role_check';

-- new tables present
select count(*) from role_permissions;                                -- expect: 21 seeded rows
select to_regclass('public.user_invitations'), to_regclass('public.user_finance_pins');

-- helpers point at new roles
select prosrc from pg_proc where proname = 'is_admin';                -- references role = 'admin'
```

## Required environment (app)
- `SUPABASE_SERVICE_ROLE_KEY` — already required; used by all account server functions.
- `APP_URL` (or `VITE_APP_URL`) — **new, optional but recommended.** Base URL used
  to build invite redirect links (e.g. `https://your-domain`). If unset, Supabase
  falls back to the project's configured Site URL. Also ensure `/auth/callback`
  is in the Auth **Redirect URLs** allow-list.
- Supabase Auth email/SMTP must be configured for invite emails to be delivered.
  If email fails, the invite still creates the account and the UI shows a
  shareable invite link.

## Rollback
Run `2026-07-16_account_management_rollback.sql`. Note: any `finance`/`registration`
users created after applying are remapped to `member` on rollback.
