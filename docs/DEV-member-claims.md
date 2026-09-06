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
