# Applying the member name parts migration

**File:** `2026-10-11_member_name_parts.sql` (rollback: `2026-10-11_member_name_parts_rollback.sql`)
**Backup taken first:** `tierra/data/backups/2026-10-11_pre-name-split/` (outside the repo, holds member PII)

The migration is **additive and reversible**. It never writes `members.name`.
The only change to existing rows is the two-word backfill (section 4), which
fills the new columns on plain two-word names and leaves every other column,
including `updated_at`, as it was.

## What it changes
1. New nullable columns on `public.members`: `first_name`, `middle_name`,
   `last_name`, `suffix`, `name_parts_reviewed_at`, `name_parts_reviewed_by`.
   New `name_parts_status text NOT NULL DEFAULT 'pending'` with a CHECK
   (`pending | auto | confirmed`) and a CHECK that a non-pending row has a first name.
2. Index `idx_members_name_parts_status`.
3. Trigger `trg_members_name_parts_guard` (function `public.members_name_parts_guard`,
   BEFORE INSERT OR UPDATE):
   - Browser sessions (anon/authenticated, not admin) cannot write the parts or
     the review state. Server functions use the service role and pass.
   - When an UPDATE changes `name` but not the parts or the review stamp, the
     parts are cleared and the row goes back to `pending`. Covers profile
     settings, Agapay and other single-field writers.
4. Backfill: two-word names with letters only (no comma, no dot, no one-letter
   token, no "Ma", no particle or suffix) become `first_name` + `last_name`,
   status `auto`. Expected on 2026-10-11: 100 of 310 rows.

## Apply (MCP `apply_migration`)
Apply as two named migrations, so a backfill failure leaves the columns in place.
Each `apply_migration` call runs in one transaction, so a failed backfill also
undoes its `DISABLE TRIGGER`. Run the `tgenabled` check below right after.
- `member_name_parts_columns`: sections 1 to 3.
- `member_name_parts_backfill`: section 4.

The app code that reads these columns (member form, `/admin/name-review`) needs
the columns to exist. Apply before deploying that code. The currently deployed
app ignores the new columns.

## Post-apply verification
```sql
-- status counts: confirmed = 0, auto = 100 (2026-10-11), pending = the rest
select name_parts_status, count(*) from public.members group by 1;

-- every auto row has both parts and they rebuild the name exactly: expect 0, 0
select count(*) from public.members
 where name_parts_status = 'auto' and (first_name is null or last_name is null);
select count(*) from public.members
 where name_parts_status = 'auto'
   and btrim(regexp_replace(name, '\s+', ' ', 'g')) <> first_name || ' ' || last_name;

-- updated_at untouched by the backfill: expect 0
select count(*) from public.members where updated_at > now() - interval '10 minutes';

-- updated_at trigger is back on: expect 'O'
select tgenabled from pg_trigger where tgname = 'update_members_updated_at';

-- name-parts guard present: expect 1
select count(*) from pg_trigger where tgname = 'trg_members_name_parts_guard';
```

## Required environment (app)
None new.

## Rollback
1. Export confirmed review work if it may be needed again (query in the rollback file header).
2. Deploy app code without the name parts.
3. Run `2026-10-11_member_name_parts_rollback.sql`.
