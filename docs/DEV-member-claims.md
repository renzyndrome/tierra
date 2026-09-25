# Member claims — developer notes

"Claim your member record": an existing church member scans their Quest Circle's
sign-up QR, creates an account, and is matched to the member record the church
already has for them.

## Why it exists

~200 member records were bulk-imported from spreadsheets, with giving
(`financial_transactions.member_id`) and attendance tagged to them. Almost none
had a login. The old path (`completeOwnProfile`) auto-linked **only on an exact
email match** and otherwise INSERTed a brand-new empty member — so a long-standing
member who signed up with a personal email became a second, empty record while
their giving history stayed orphaned on the first.

This module replaces guessing with scoring plus a human decision.

## Flow

```
leader enables link  ->  /join/<token>  ->  auth account + confirm email
                                             |
                                       score submission
                                             |
                        exactly one candidate >= 0.90 ?
                           yes -> auto_linked          no -> pending (queue)
                                                             |
                                       leader/admin: confirm | create | reject
```

After confirming their email the person sets a password at `/auth/reset-password`
and lands on `/profile`, which shows a "we're finding your record" banner while
the claim is pending.

## Rollout steps

The 28 circle leaders cannot use the QR until each has an account linked to
their own member record. Do this once, before the first meeting.

**Step 1. Bootstrap the leaders.** For each leader:

1. Admin → Users → **Invite**. Enter the leader's email.
2. Once the row appears, tap **Link member record** and pick the leader's own
   record.
3. Keep the role as **Member**.

Do **not** give a leader the **Discipleship** role. That role allows editing
any member record directly and skips Agapay's audit log. Circle leaders get
what they need from the Member role plus the link.

**Step 2. Leaders turn on their link at the meeting.** On at the start of the
meeting. Off when it ends.

Why the role matters: tierra's `is_leader_or_admin()` includes `discipleship`,
which grants direct UPDATE on `public.members` via RLS. Agapay decides who is a
discipler from `members.discipler_id`, not from the role, so `member` is enough.

## Files

| Area | Path |
|---|---|
| Scoring (pure, tested) | `src/lib/memberClaim.ts` |
| Scoring tests | `src/tests/lib/memberClaim.test.ts` |
| Server functions | `src/server/functions/memberClaims.ts` |
| Account creation / email plumbing | `src/server/authInvite.ts` |
| Public sign-up page | `src/routes/join/$token.tsx` |
| Leader view | `src/routes/profile/circle/index.tsx` |
| Admin view | `src/routes/admin/claims/index.tsx` |
| Shared queue UI | `src/components/ClaimQueue.tsx` |
| QR card | `src/components/SignupQRCard.tsx` |
| Migration | `supabase/2026-09-06_member_claims.sql` (+ `_rollback.sql`) |

## Scoring

`scoreClaimCandidate` reuses `nameMatchConfidence` from `src/lib/nameMatch.ts`
(the attendance matcher) so both flows rank names identically.

| Signal | Contribution |
|---|---|
| Name | `0.85 x max(token confidence, trigram similarity)` |
| In the scanned circle | `+0.12` |
| Phone equal (normalized) | `+0.15` |
| Birthday equal | `+0.10` |
| Exact email | floors the score at `0.95` |

Capped at 1.0. `CLAIM_AUTO_THRESHOLD = 0.9`.

Worked examples: exact email alone `0.95` (auto) · exact name + in circle `0.97`
(auto) · exact name alone `0.85` (queue) · middle-name variant `0.765` (queue) ·
first name only `0.567` (queue).

`resolveClaim` auto-links **only when exactly one** candidate clears the
threshold and that member does not already back another account. Ties stay
pending on purpose — two family members with the same name must never be guessed.

Trigram candidates come from the existing `search_members_similar` RPC.

## Agapay (discipleship app) on the same database

Agapay (`discipleship.questlaguna.org`) shares this Supabase project and reads
`public.members`. It decides who is a discipler by `members.discipler_id`,
while tierra's circle membership lives in `member_cell_groups`. The two drift.

The claim flow bridges them in two places:

- `groupMemberIds` counts a member whose `discipler_id` is the circle's leader
  as "in this circle", so the scoring bonus applies even when the
  `member_cell_groups` row is missing.
- `confirmClaim` (with the "Add to this circle as a disciple" box ticked) and
  `createMemberFromClaim` call `setDisciplerIfEmpty`: sets `discipler_id` to the
  circle's `leader_id` ONLY when it is null. Never overwrites, never points a
  leader at themselves. An existing discipler is changed only in Agapay via its
  audited `reassign_disciples` RPC.

**Agapay enrollment (`src/server/agapayEnroll.ts`).** `discipler_id` alone
does not put anyone in the Agapay queue: the view
`discipleship.disciple_engagement` selects FROM `discipleship.disciple_profiles`.
`enrollInAgapayIfEligible` closes that gap. It mirrors
`agapay/scripts/import-disciples.ts` exactly:

- eligibility: non-archived, has a `discipler_id`, no profile row yet
- writes: `disciple_profiles` (member_id, cohort from `joined_date`), a
  "Joined Agapay (circle sign-up)" `stage_transitions` row with `created_by` =
  the approver, then `discipleship.snapshot_checklist`

Same rule as the script, so re-running the script afterwards is a no-op for
these members. Best-effort: logs and returns `'failed'`, never throws, so it
cannot undo an account link. `member_id` is UNIQUE, so a race returns
`'already_enrolled'`.

Called from: the auto-link in `submitClaimSignup`, `confirmClaim`, and
`createMemberFromClaim`. `createMemberFromClaim` also sets `joined_date` to
today so the new member gets a cohort.

The tierra Supabase client is typed for `public` only, so the helper casts to
an untyped `SupabaseClient` to call `.schema('discipleship')`. Requires
`discipleship` in the project's exposed API schemas (already true: Agapay uses
it).

Backlog from before this change: on 2026-09-23, 16 members had a discipler but
no profile row. The claim flow only enrolls people it touches. Run the Agapay
script once to catch them up:

```
cd /home/renzycode/projects/quest/agapay
pnpm tsx scripts/import-disciples.ts          # dry run, read only
pnpm tsx scripts/import-disciples.ts --apply
```

Do not give circle leaders the `discipleship` role. Tierra's
`is_leader_or_admin()` includes it, which grants direct UPDATE on
`public.members` and bypasses Agapay's audit trail. Leaders stay `member`.

## Authorization

- `getSignupGroup` / `submitClaimSignup` are **public**. They authorize on the
  unguessable signup token plus its `enabled` flag, the same way `publicCheckIn`
  uses a QR token. Neither response reveals whether a member record matched, so
  the directory cannot be probed.
- Everything else runs through `requireGroupApprover`: **admin**, or a holder of
  `cell_groups.write` (the `discipleship` role by default), or the circle's own
  `leader_id` / `co_leader_id`.
- `undoClaimLink` additionally requires a global approver.

## Schema

Two service-role-only tables (RLS enabled, zero policies):

- `cell_group_signup_links` — one row per circle: `token` (secret), `enabled`,
  `rotated_at`.
- `member_claim_requests` — `user_id` (UNIQUE), `cell_group_id`, the submitted
  fields, `status` (`auto_linked|pending|confirmed|new_member|rejected`),
  `matched_member_id`, `top_score`, `resolved_by/at`, `note`.

**The token is not a column on `cell_groups`** — policy `cell_groups_read_auth`
lets every authenticated user SELECT all columns and the app reads
`cell_groups(*)` client-side, so a token column would leak the secret.

## Gotchas

- **Candidates are recomputed on read** (`getClaimQueue`), never stored — the
  directory changes between submission and review. Mirrors `getPendingMatches`.
- **`completeOwnProfile` is guarded**: it throws when the caller has a pending
  claim, so a claim user can never create the duplicate member this module exists
  to prevent. `/auth/reset-password` and `/auth/complete-profile` also route
  claim users away, keyed on `user_metadata.claim === true`.
- **`members.email` is UNIQUE** — `createMemberFromClaim` maps the `23505`
  violation to "link to it instead of creating a new one".
- **1:1 is enforced in app code only** unless section 3 of the migration is
  applied. `assertMemberUnlinked` runs before every link, including a re-check
  immediately before the auto-link write.
- Scoring failures never block account creation; the claim falls back to
  `pending` so the sign-up is not lost.
- `/auth/register` is locked (redirects to login) and Supabase "Allow new users
  to sign up" stays OFF. All accounts come from an admin invite or this flow.

## Rate guard

`CLAIM_RATE_LIMIT` (20) claims per circle per `CLAIM_RATE_WINDOW_MINUTES` (10).
The token is secret, so this is a backstop against a leaked link, not a primary
control. A leader can rotate the token from their circle page.
