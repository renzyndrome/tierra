# Member split names and Name Review (developer notes)

Shipped 2026-10-11. Migration: `supabase/2026-10-11_member_name_parts.sql`
(gitignored; apply guide `supabase/2026-10-11_member_name_parts_APPLY.md`).

## Model

`members.name` stays `NOT NULL` and stays the source for display, search
(`name.ilike`, `idx_members_name_trgm`, `search_members_similar`), the check-in
and claim matchers (`nameMatch.ts`, `memberClaim.ts`) and Agapay. Nothing reads
the split columns for those yet.

| Column | Notes |
|---|---|
| `first_name`, `middle_name`, `last_name`, `suffix` | Nullable text, original casing. `middle_name` holds what is known: "Santos" or "C.". `last_name` includes particles ("Dela Cruz"). |
| `name_parts_status` | `pending` (default) / `auto` / `confirmed`. CHECK: non-pending needs `first_name`. |
| `name_parts_reviewed_at`, `name_parts_reviewed_by` | Set with every confirm. `reviewed_by` is `user_profiles.id`, no FK. |

Trust rule: parts are trusted only when status is not `pending`
(`initialNameParts` in `src/lib/nameParts.ts`).

## Who writes what

| Writer | `name` | Parts and status |
|---|---|---|
| Backfill (migration section 4) | untouched | plain two-word names → `auto` |
| `confirmNameParts` (`nameReview.ts`) | **never** | parts + `confirmed` |
| `createMember` (admin form) | composed from parts | parts + `confirmed` |
| `updateMember` (admin form) | composed, only after a name box changed | parts + `confirmed`, same condition |
| Profile settings, complete-profile, claims, attendance visitor, import, Agapay | written as one field | not written; new rows `pending` |

`withNamePartsReview` (`src/lib/nameParts.ts`) is the single server-side gate:
a save without parts passes through unchanged; a save with parts must have
first and last name and gets the `confirmed` stamp. The client can never send
`name_parts_status`: it is not in `memberInsertSchema`, and zod strips unknown keys.

## Name-parts guard trigger

`trg_members_name_parts_guard` (BEFORE INSERT OR UPDATE, function
`public.members_name_parts_guard`):
- Browser sessions (`anon`/`authenticated`, not admin) get error 42501 when they
  write any of the seven name-parts columns. `members_update_self` would
  otherwise let a member mark their own split confirmed. Same pattern as
  `discipleship.guard_member_fields`.
- Stale split: when `name` changes and the same UPDATE leaves the four parts and
  `name_parts_reviewed_at` alone, the parts are cleared and the row goes back to
  `pending`. Covers every single-field writer, including browser updates
  through RLS and Agapay. The admin form never trips it: a name edit sends the
  parts, and the stamp changes.

`confirmNameParts` also sends the `name` the admin saw and updates only when it
still matches, so a rename during review returns "Member changed. Reload the
queue." instead of confirming a split of the old name.

## Guess rules (`guessNameParts`)

In order, original casing kept:
1. Nicknames in brackets or quotes are dropped (`nickname`).
2. Comma forms: "Juan Cruz, Jr." is space form plus suffix. Otherwise surname
   first: "Dela Cruz, Juan, C.", "Cruz, Juan C." (`comma`).
3. A trailing Jr/Sr/II/III/IV (3+ words) becomes `suffix`.
4. "Ma"/"Ma." as the first word joins the next ("Ma. Cristina").
5. Surname = last word plus preceding particles (de, dela, del, delos, la,
   los, san, sta, ...), keeping one word in front.
6. Middle = last remaining word plus its particles. First = the rest.

Confidence: `high` for two words or a middle initial, `medium` for a full
middle name, 4+ words, commas or nicknames, `low` for one word or empty.

## Backfill rule (`splitTwoTokenName`)

Exactly two words, no comma, each 2+ letters (letters, apostrophe, hyphen
only), first word not in `AUTO_SPLIT_BLOCKED_FIRST`, second not in
`AUTO_SPLIT_BLOCKED_LAST`. The SQL in section 4 implements the same rule.
`src/tests/lib/nameParts.test.ts` asserts the two token lists equal the SQL
lists (runs only where the gitignored migration file exists).

## Review queue paging

`getNameReviewQueue` orders by `is_archived, name, id`. Confirmed rows leave the
pending/auto set, so the next page offset is the count of loaded rows still in
the current status. Concurrent edits by another admin can shift a page by a few
rows; Start over reloads from the top.

## Future step (not done)

Once Pending is near zero: derive `name` from the parts (trigger or generated
column) and move the sign-up, claim, profile settings, complete-profile,
attendance visitor and import forms to split fields.

## Rollback

`2026-10-11_member_name_parts_rollback.sql`. Deploy code without the parts
first; the admin form and review screen write these columns.
