# Quest Circles and disciplers: developer notes

Two fields describe "who walks with whom": `member_cell_groups` (this app's
circles) and `members.discipler_id` (read by Agapay, the discipleship app on the
same Supabase project). These rules keep them in step.

## Where the rules live

| Concern | Code |
|---|---|
| Add refusal rule, discipler circle filter, claim note, leader-change selection, discipler from a circle, reactivation dedupe, circle save notice, team checks (`isTeam`, `circleSaveFollowUps`) (pure, unit-tested) | `src/lib/circleRules.ts` |
| Placement (`placeMemberInCircle`), role change (`changeMemberCircleRole`), leader-change move (`moveDisciplesToNewLeader`) and reactivation dedupe (`endPlainRowsInAnotherCircle`) | `src/server/circlePlacement.ts` |
| Add / remove / reactivate / role change, leader change on circle save | `src/server/functions/cellGroups.ts` |
| QR claim placement | `src/server/functions/memberClaims.ts` (`placeClaimInCircle`) |
| Spreadsheet import discipler step | `src/server/functions/importMembers.ts` |
| Discipler set, clear, Agapay enrollment, stage-change audit (`recordAgapayStageChange`), enrollment check (`hasAgapayEnrollment`) | `src/server/agapayEnroll.ts` |
| Enroll and stage audit after a member save | `src/server/functions/members.ts` (`savedWithDiscipler`, `savedStageChange`) |
| Edit payload without unchanged stage and discipler (`withoutUnchangedAgapayFields`), enrollment flag and warning copy (`agapayEnrollFlag`, `enrollFailedAfter`, `withAgapayEnrollNote`, `agapayEnrollFailedCount`) | `src/lib/agapay.ts` |
| Live `cell_groups.write` check for the Quest Circle field, live `members.write` check on the edit page (`useLivePermission`) | `src/lib/useLivePermission.ts` |
| Permission refusal message (`PERMISSION_DENIED`) | `src/server/functions/_authGuard.ts` |
| Archive and delete refusals (pure) | `src/lib/memberArchiveRules.ts` |
| Archive and delete checks, plain memberships ended on archive | `src/server/memberArchive.ts` |
| Discipler on the profile | `getMemberWithRelations` returns `discipler` |
| Discipler and Quest Circle fields | `src/components/MemberForm.tsx` |
| Circle add after create | `src/routes/admin/members/new.tsx` |
| Circle move on edit | `src/routes/admin/members/$memberId/edit.tsx` |
| **Team** checkbox on circle create and edit | `src/routes/admin/index.tsx` (Quest Circles tab dialog) |
| "Team" badge (`TeamBadge`) | `src/components/CellGroupCard.tsx`; used on the circle cards, the circle page header, the member profile and `/profile` circle lists |

## Teams

`cell_groups.is_team` (boolean, NOT NULL, default false) marks a team, for
example a ministry crew. A team is not a discipleship circle: people belong
to a team on top of their own Quest Circle. Teams live in the same tables
(`cell_groups`, `member_cell_groups`) and use the same circle page, add,
remove and role actions. `isTeam(row)` is true only for `is_team === true`;
null and a missing field read as a circle.

- **Types and validation:** `CellGroup.is_team`, optional on
  `CellGroupInsert` / `CellGroupUpdate`. `createCellGroup` validates with
  `cellGroupCreateSchema` (`is_team` defaults to false). The update schema
  has no default, since zod v4 `.partial()` keeps defaults and would write
  false on every update.
- **UI:** the circle dialog (Admin → Quest Circles, create and **Edit**) has
  a **Team** checkbox, unticked by default, with the line "Not a
  discipleship circle. Members keep their own Quest Circle." A "Team" badge
  shows on the circle card, the circle page header, and in the member's
  circle lists (member profile **Quest Circles**, `/profile` **My Quest
  Circles**). `getMemberWithRelations` selects `is_team` on each circle.

What skips teams (each reads `is_team` where it reads the circle):

| Rule | Team behavior | Code |
|---|---|---|
| One active plain circle per member | A team row never counts as "another circle", for an add, a role change to `member`, or a circle turned back on | `otherActiveMemberCircleName`, `plainRowsInAnotherCircle` |
| Add to a team (role `member`) | Only "Circle leaders cannot join as members." is checked. Another circle and the discipler never block | `circleAddBlockReason` (`isTeam`), `memberAddBlockReason` in `circlePlacement.ts` |
| Discipler and Agapay after a plain add or a role change to `member` | Not run: no `setDisciplerIfEmpty`, no `enrollInAgapayIfEligible`, no `agapayEnroll` on the result | `placeMemberInCircle`, `changeMemberCircleRole` |
| Discipler set on join, cleared on leave | `disciplerFromCircle` gives null and `disciplersClearedOnLeave` gives none for a team, so `setDisciplerIfEmpty` and `clearDisciplerIfCircleLeader` write nothing | `agapayEnroll.ts` |
| Leader change moves disciples | No move for a team (as saved) | `circleSaveFollowUps` in `updateCellGroup` |
| Circle turned back on ends duplicate rows | Not run for a team | `circleSaveFollowUps` in `updateCellGroup` |
| Member form Quest Circle field | Teams never listed; `circlesLedBy` and `circlesNotLedBy` leave them out, so `circleAfterDisciplerPick` never counts one | `MemberForm.tsx` |
| Edit page current circle | `activePlainCircle` ignores team rows, so a circle move never removes a team membership | `edit.tsx` |
| QR sign-up for a team | Placement joins the team only: no discipler, no enrollment from the placement | `placeClaimInCircle` → `placeMemberInCircle` |

Kept for teams: "Circle leaders cannot join as members." (a team leader is
not a member of their own team), the archived-member refusal, and the
archive and delete refusal "Leads <circle>. Change the leader first." An
archive also ends active plain team rows, like circle rows.

Not handled: ticking or unticking **Team** on an existing group changes no
membership or discipler. A circle turned into a team keeps its members'
disciplers. A team turned into a circle runs no duplicate check, so a member
may then be a plain member of two circles until removed on the circle page.

## Rules

- **Teams:** a team skips the discipleship rules below, see "Teams" above.
- **Leaders:** a member may lead or co-lead several active circles. Nothing
  limits the number.
- **Add, role `member`:** refused (nothing written), in this order, when the
  member is the circle's own `leader_id` or `co_leader_id` ("Circle leaders
  cannot join as members.", the same rule as Agapay's `place_in_circle`), is
  an active plain member of another active circle, or has a `discipler_id`
  that is neither the circle's `leader_id` nor its `co_leader_id`. Roles
  `leader` and `co_leader` skip all three checks.
- **After a plain-member add:** `setDisciplerIfEmpty` (only when empty: the
  leader, or the co-leader when the circle has no leader, never the member
  themself; `disciplerFromCircle`), then `enrollInAgapayIfEligible`. Both log
  and never throw.
- **One code path:** `placeMemberInCircle(supabase, { memberId, cellGroupId,
  role, actorUserId, source, preserveJoinedAt })` does the archived check,
  the active-row check, the add rule, reactivate or insert, then discipler
  and enrollment.
  Reactivation sets `joined_at` to now unless `preserveJoinedAt` is true
  (`addMemberToCellGroup` passes it through; the edit page's restore uses it). It returns
  `{ ok: true, membership, agapayEnroll? }` or `{ ok: false, kind, reason }`
  with `kind` `already_in_circle | refused | failed`, and never throws.
  `agapayEnroll` is the enrollment result after a plain-member add (absent
  for leader roles). `addMemberToCellGroup` throws `reason`, so its messages
  are unchanged.
- **Archived member:** `placeMemberInCircle` refuses any role for a member
  with `is_archived` true: "Member archived. Restore first."
  (`MEMBER_ARCHIVED_REFUSAL`, kind `refused`). A failed read gives `failed`.
  A claim placement turns it into the usual note.
- **Role change** (circle page role select, `updateMemberCellGroupRole` →
  `changeMemberCircleRole`): acts on the ACTIVE row only; none gives "Member
  not in this Quest Circle." A `leader` or `co_leader` row turned `member`
  passes the same add rule as above (refusal message unchanged, nothing
  written), then gets `setDisciplerIfEmpty` and `enrollInAgapayIfEligible`
  (source `circle`), like an add. It returns `{ ok: true, agapayEnroll? }`
  (`agapayEnroll` only after such a change). Other role changes run no rule.
  The circle page shows a refusal in the existing alert, and a failed
  enrollment as a warning (see "Agapay enrollment failures").
- **Leader change:** see "Circle leader change" below.
- **Remove:** soft remove (`is_active = false`, `left_at = now()`). When the row
  was an active plain membership, `clearDisciplerIfCircleLeader` clears
  `discipler_id` only while it still equals the circle's leader or co-leader
  (`disciplersClearedOnLeave`, never the member themself). The condition sits
  in the UPDATE (`discipler_id in (leader, co-leader)`), so a discipler
  changed meanwhile is untouched.
- **Re-add:** `member_cell_groups` is `UNIQUE (member_id, cell_group_id)`. An
  inactive row is reactivated; only an active row blocks.
- **`is_active` null** reads as active (the column defaults to true), matching
  Agapay's `coalesce(is_active, true)`. The UI reads it the same way
  (`is_active !== false`): the circle page member list, the member profile
  circle list, the dashboard circle counts and export, and the profile page
  circle query (`.not('is_active', 'is', false)`).
- **Member save:** `createMember` / `updateMember` enroll in Agapay when the
  written fields include `discipler_id` and the saved row has one.
  `updateMember` with `retryAgapayEnroll: true` (the edit page always sends
  it) also enrolls when the saved row has a discipler that was not written.
  Never on a self-edit. See "Agapay enrollment failures" below.
- **Stage change:** when `updateMember` writes `discipleship_stage`, it reads
  the stage first (a failed read fails the save). When the saved stage
  differs (`savedStageChange`) and the member has a
  `discipleship.disciple_profiles` row, `recordAgapayStageChange` inserts a
  `stage_transitions` row (from, to, note "Changed in the directory app",
  `created_by` the caller) and calls `discipleship.snapshot_checklist` for
  the new stage, as Agapay's `promote_disciple` does. Best-effort, logged,
  never fails the save. It runs before enrollment, so a member enrolled by
  the same save gets only the "Joined Agapay" row.

## Member form: the discipler picks the circle

`MemberForm` (admin create and edit) gets the active circles from
`getAllCellGroups` (`select('*')`, so `leader_id` and `co_leader_id` are
present).

- **No discipler:** the Quest Circle field lists every circle, as before.
- **Own circles (edit only):** `circlesNotLedBy(circles, member.id)` drops the
  circles the edited member leads or co-leads, from the full list, the
  discipler list and the preselect count. The add rule refuses them anyway.
- **Discipler chosen:** the field lists only `circlesLedBy(circles, discipler)`
  (active circles where the discipler is `leader_id` or `co_leader_id`), plus
  "No Quest Circle". The current selection stays listed when it falls outside
  that list, so legacy data still shows.
- **Picking a discipler** applies `circleAfterDisciplerPick`:
  one led circle is preselected; two or more clear the field and set
  `circleChoiceRequired`, which disables Save and shows "Choose a Quest
  Circle." until an option is picked ("No Quest Circle" counts); none clears
  the field.
- The filtered list matches the add rule above, so a circle picked here is
  not refused for the discipler.
- **Archived discipler:** `getAllMembersLite` leaves archived members out,
  so a stored archived discipler is not in the picker. The Discipler field
  shows "Archived member" (or the name from `currentDiscipler`, which the
  edit page takes from `getMemberWithRelations`' `discipler`, with an
  "Archived" tag) and a **Clear** action. The value is kept until cleared.
  `disciplerToNarrowBy` narrows the Quest Circle field only by a listed
  discipler, so an archived one lists every circle.
- **Permission split:** a member save needs `members.write` (the create
  page's route gate); a circle add needs `cell_groups.write`. `useLivePermission(accessToken, role,
  'cell_groups.write')` reads the live matrix (`getRolePermissions`, falling
  back to code defaults on a failed read; admin always passes, as in
  `requirePermission`). Without the permission the page passes no circles:
  no Quest Circle field, no discipler narrowing, and the save sends no circle
  change, so it never half-fails. The create page maps this through
  `createFormCircleProps`; the edit page waits for it behind the loading
  spinner.

## Create page

`new.tsx` loads the circles and passes them to the form. Until the list
loads, `circlesLoad="loading"` replaces the Discipler field with "Loading
Quest Circles...", so a discipler is never picked before the preselect and
choice rule can apply. A failed load passes `circlesLoad="failed"` and no
circles: the Discipler field shows, the Quest Circle field is replaced by
"Quest Circles not loaded. Reload to assign a circle.", and no circle is
added. After `createMember`
succeeds and a circle was chosen, it calls `addMemberToCellGroup` with role
`member`. A refused add keeps the member: the form is replaced by "Member
created. Quest Circle not set." with the reason, a **Back to Members** link
and an **Edit Member** link. Save is gone, so no duplicate member. A failed
Agapay enrollment replaces the form the same way, with "Member created." and
"Agapay enrollment failed. Save on the Edit Member page to retry."

## Edit page

- **Permission:** `useLivePermission(accessToken, role, 'members.write')`.
  `false` replaces the form with "Not permitted." and "An admin grants
  access." plus **Back to Members**; `null` keeps the loading spinner. The
  server still enforces `members.write` in `updateMember` (unchanged); this
  only stops a form that cannot save.
- **Current circle:** `activePlainCircle(cell_groups)`, the member's active
  plain-member row. Leader and co-leader rows are ignored, so the field never
  removes a leader from a circle they lead. A member who only leads shows an
  empty field.
- **Agapay-owned fields:** `discipleship_stage` and `discipler_id` are sent
  only when changed on the form against the values last read from the
  server (`withoutUnchangedAgapayFields`). An edit page opened before a
  promotion or reassignment in Agapay no longer reverts it, and a stage
  change made here gets an Agapay audit row (see "Stage change" above). The
  create page sends both as before.
- **Move:** `updateMember` first (so the add rule sees the new discipler), then
  remove from the current circle, then add to the selected one as `member`,
  then, only when the admin changed the discipler in this save, save it
  again (`disciplerToKeepAfterMove`). Leaving a circle clears a discipler who
  leads it, and joining fills in the new circle's leader. A discipler the
  admin chose (for example a co-leader of the new circle) is put back. An
  unchanged discipler gives way to the new circle's leader, so a circle move
  also moves the member to that leader's Agapay queue. (Until 2026-10-09 the
  unchanged discipler was re-saved too, which left members in one leader's
  circle and another leader's queue.)
- **Refused add:** re-adds the current circle with its role (always `member`)
  and `preserveJoinedAt: true`, so the old row keeps its original
  `joined_at`, then shows the refusal. The restore goes through the same add
  rule; when the new discipler does not lead the old circle, the restore is
  refused and only logged.
- **Agapay enrollment failed:** the save stands. The page stays on the form
  with "Saved. Agapay enrollment failed. Save again to retry.", reads the
  member again (as after a failed save), and the next Save retries
  (`retryAgapayEnroll`). The last enrollment that ran in the save chain
  decides (`enrollFailedAfter`).
- **After any failed save:** the page reads the member again and resets its
  current circle, role and the stage and discipler it compares against. The
  form keeps the admin's input. A retry starts from the real state, for
  example no circle after a refused restore, instead of the circle the page
  first loaded.

## QR sign-up

Each circle has its own `cell_group_signup_links` row (one token per circle).
`getMyLedGroups` returns every active circle where the caller is leader or
co-leader; `/profile/circle` shows a circle picker when there are two or more,
with a separate QR card per circle. `/join/<token>` resolves the token to one
circle, so the scanned QR decides the circle.

## Agapay side

Agapay migration `20261009041144_discipleship_circles.sql` adds
`discipleship.create_circle` and `discipleship.place_in_circle`, with the same
one-circle-per-member rule. They write `cell_groups` and `member_cell_groups`
the same way this app does. The Agapay database functions ignore teams: a
disciple is never placed in a team as their circle, team memberships never
block or get closed by placement or reassign, and Agapay never shows a team
as a disciple's circle.

## QR claim placement

`confirmClaim` (with "Add to this circle as a disciple" ticked) and
`createMemberFromClaim` call `placeClaimInCircle`, which goes through `placeMemberInCircle` with role
`member` and Agapay source `circle sign-up`.

- An existing ACTIVE row is never changed. A leader or co-leader row is not
  demoted, and a person who is the circle's `leader_id` or `co_leader_id`
  counts as already placed (no row written).
- **Team link:** the person joins the team only. No discipler is set and the
  placement enrolls no one in Agapay. The enrollment call that follows the
  account link still runs; it enrolls only a member who already has a
  discipler.
- A refusal or a database error never undoes the account link. It becomes a
  note: `claimCircleNote` gives "Quest Circle not set." plus the refusal
  reason, or "Quest Circle not set. Add from Admin → Quest Circles." for an
  error. Nothing is reported for "already in this circle".
- The note is saved on `member_claim_requests.note` and returned as
  `circleNote` from `confirmClaim` and `createMemberFromClaim`. The approver
  pages (`/profile/circle`, `/admin/claims`) show it after the action, and
  `ClaimQueue` shows a saved note under "Linked to ..." on resolved claims.
- **Failed Agapay enrollment:** the last `enrollInAgapayIfEligible` call in
  `confirmClaim` / `createMemberFromClaim` (after any enrollment inside the
  placement, so it decides) returning `failed` appends
  `AGAPAY_ENROLL_FAILED_RETRY_ON_EDIT` to the note (`withAgapayEnrollNote`):
  "Agapay enrollment failed. Save on the Edit Member page to retry." A
  resolved claim has no Confirm action, so the note points to the Edit
  page, whose Save retries (`retryAgapayEnroll`). The auto-link in
  `submitClaimSignup` saves the same note on the claim, shown on the
  **Auto-linked** list.
- **Auto-link:** links the account only, with no circle row. It runs from
  the public sign-up page, so placement (which also sets the discipler)
  waits for the circle leader or an admin.
- Write errors are logged (`console.error`); refusals log a `console.warn`.

## Circle leader change

`updateCellGroup` reads the circle's `leader_id` before saving when the update
sets `leader_id`. `leaderSwap(old, new)` is non-null only when both are set and
differ. Then `moveDisciplesToNewLeader`:

1. reads the circle's active plain rows with each member's `discipler_id`;
2. `membersToMoveOnLeaderSwap` keeps those walking with the old leader,
   minus the new leader (no self-discipling);
3. `update members set discipler_id = new where id in (...) and
   discipler_id = old`, so a discipler changed meanwhile is untouched;
4. enrolls each moved member in Agapay (source `circle leader change`) and
   counts the `failed` results (`enrollFailed`).

Members with another discipler, co-leader and leader rows, and inactive rows
are untouched. A cleared leader (null) moves no one. A team (as saved) moves
no one: `circleSaveFollowUps` gives no swap. The circle save stands
even when the move fails. The result adds `membersMoved`,
`membersMoveFailed` and `membersEnrollFailed`; the Quest Circles tab shows
"3 members now walk with <leader>." (`leaderSwapOutcome`) or the failure
line, then, when enrollments failed, "2 Agapay enrollments failed. Save on
each member's Edit page to retry." (`agapayEnrollFailedCount`, warning
style). The move stands.

The old leader's disciples move even when the old leader stays on as
co-leader in the same save.

## Circle turned back on

`updateCellGroup` also reads the circle's `is_active` before saving when the
update sets `is_active: true`. An inactive circle keeps its rows, and its
members may join another circle meanwhile (inactive circles do not block an
add). When the save turns it from `false` to `true` (`circleReactivated`),
`endPlainRowsInAnotherCircle`:

1. reads the circle's active plain rows;
2. reads the same members' active plain rows with their circles;
3. `plainRowsInAnotherCircle` keeps this circle's rows whose member is an
   active plain member of another active circle;
4. soft-removes them (`is_active = false`, `left_at = now()`).

Leader and co-leader rows, disciplers and Agapay rows are untouched. A team
row elsewhere does not count, and a team turned back on skips this step
(`circleSaveFollowUps`). The circle save stands even when this fails. The result adds `duplicatesEnded`
and `duplicatesEndFailed`; `circleSaveNotice` joins this with the leader
change line, e.g. "2 members removed: already in another Quest Circle.", or
"Members in two Quest Circles not removed. Remove from the circle page."

## Agapay enrollment failures

`enrollInAgapayIfEligible` returns `enrolled | repaired | already_enrolled |
not_eligible | failed`:

- **Already enrolled, no checklist items** (`discipleship.disciple_checklist_items`
  empty for the profile): calls `snapshot_checklist` for the member's current
  stage and returns `repaired`. Items already there are never touched.
- **New enrollment whose checklist snapshot fails:** `failed` (the profile row
  stays, so a retry repairs it). A failed audit row is logged only.

Server responses carry `agapayEnrollFailed` (`agapayEnrollFlag`) only when an
enrollment ran: `createMember`, `updateMember`, `addMemberToCellGroup`,
`updateMemberCellGroupRole`. Batch steps return a count instead
(`updateCellGroup.membersEnrollFailed`, import `results.agapayEnrollFailed`),
and the claim paths add the failure to the claim note. The save, add, role
change, move, import or link itself stands. UI warnings (non-blocking, amber):

| Where | Text |
|---|---|
| Edit page | "Saved. Agapay enrollment failed. Save again to retry." |
| Create page result | "Member created." + "Agapay enrollment failed. Save on the Edit Member page to retry." |
| Circle page add, circle page role change to Member, member profile circle add | "Agapay enrollment failed. Save on the Edit Member page to retry." |
| Claim **Link record** / **Create record** note, saved claim note (auto-link too) | the circle note, if any, then "Agapay enrollment failed. Save on the Edit Member page to retry." |
| Quest Circles tab after a leader change | "N Agapay enrollments failed. Save on each member's Edit page to retry." (1: "1 Agapay enrollment failed. Save on the member's Edit page to retry.") |
| Import results | the same count line, below the totals |

Every retry above is the member edit page: it always sends
`retryAgapayEnroll: true`, so its Save re-runs `enrollInAgapayIfEligible`
for a member with a discipler (a profile with no checklist is repaired). The
count lines name no member: the
moved members are the circle's plain members now walking with the new
leader; the import ones are members whose discipler the import set. Saving
an already enrolled member is a no-op for Agapay.

The circle page role change and add share one warning slot (`addNotice`),
cleared at the start of either action.

## Spreadsheet import

`importSpreadsheetData` (Admin → Settings → **Import Members**), discipler step:

- Sets `discipler_id` only where it is null (`.is('discipler_id', null)`).
  A member who already has a discipler is counted in `disciplerSkipped` and
  shown as "discipler links skipped: already assigned".
- Each discipler it sets is followed by `enrollInAgapayIfEligible` (source
  `import`). A `failed` result counts in `results.agapayEnrollFailed`; the
  import dialog shows `agapayEnrollFailedCount` in amber below the totals.
  The discipler link stands.
- The name lookup over existing members pages through `fetchAllPages`
  (`src/lib/fetchAllPages.ts`), so directories over 1000 rows are matched in
  full.
- Duplicate emails: `members.email` is UNIQUE, and the sheet has family
  members sharing one address. A `23505` on insert retries with
  `email = null`, so the second person is kept without an email. Deliberate.
  Re-running the import still inserts every row again (no name dedupe).

## Archive and delete

`archiveMember` and `deleteMember` (`src/server/functions/members.ts`) check
first, through `src/server/memberArchive.ts` and the pure rules in
`src/lib/memberArchiveRules.ts`:

| Check | Archive | Delete | Message |
|---|---|---|---|
| A non-archived member has this member as `discipler_id` | refused | refused | "Disciples assigned. Reassign them first." |
| `leader_id` or `co_leader_id` of an active circle (first by name) | refused | refused | "Leads <circle>. Change the leader first." |
| A `discipleship.disciple_profiles` row | allowed | refused | "Agapay history exists. Archive instead." |

- Checks run in that order. A failed read refuses with the usual "Failed to
  archive member" / "Failed to delete member".
- An archived member cannot be placed in a circle: `placeMemberInCircle`
  refuses with "Member archived. Restore first." (admin add, circle page,
  member profile, claim placement).
- After an archive, `endPlainCircleMemberships` soft-removes every active
  plain membership (`is_active = false`, `left_at = now()`). Leader and
  co-leader rows, `discipler_id` and Agapay rows are untouched. Best-effort,
  logged, never fails the archive. Restoring a member does not rejoin a
  circle.
- The Members tab (`MembersTabContent.tsx`) shows the server message in its
  existing alert for both actions.

## Permission refusals

`requirePermission` (`src/server/functions/_authGuard.ts`) throws
`PERMISSION_DENIED`: "Not permitted. An admin grants access." Until
2026-10-09 it threw "You do not have permission to perform this action"
(second person). Pages that show the server message (alerts, form errors)
now show the new text. No code matched on the old string.
