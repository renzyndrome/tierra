# Quest Circles and disciplers: admin guide

Every plain circle member walks with a discipler. The discipler shows on the
member's profile. Agapay, the discipleship app, reads the same discipler.

## Circle form

Admin → **Circles** → add or edit a circle. Fields: **Name**, **Description**,
**Satellite**, **Leader**, **Active**, **Team**.

No co-leader, meeting day, meeting time, location or max members on the
circle. Meetings: scheduled per meeting. Values saved before 2026-10-16 stay
on the circle and still show on its page.

Circle leader: set only here, in **Leader**. The circle page **Add Member**
adds members only, and member rows show a **Leader** tag with no role menu.

## Discipler on a member

- **New member:** Admin → Members → **Add member**. Optional **Discipler**
  and **Quest Circle** fields.
- **Existing member:** member **Edit** page, **Discipler** and **Quest
  Circle** fields. Accounts without permission to edit members see "Not
  permitted." and "An admin grants access." instead of the form.
- **Profile page:** **Church Journey** card, **Discipler** row. "No discipler"
  when empty.

A saved discipler also adds the member to Agapay. No second step there.

An archived discipler shows as "Archived member" (on the Edit page, the
name with an "Archived" tag), with **Clear**. The discipler stays until
cleared.

**Discipleship Stage** and **Discipler** on the Edit page are saved only when
changed there. A promotion or reassignment made in Agapay while the page was
open stays. A stage changed here on a member in Agapay adds a stage history
entry, "Changed in the directory app", and resets that member's Agapay
checklist to the new stage.

## Choosing a discipler picks the circle

A leader may run several Quest Circles. Choosing a discipler narrows the
**Quest Circle** field to the circles that discipler leads or co-leads.

| Discipler's circles | Quest Circle field |
|---|---|
| None chosen | Every circle listed. |
| One | That circle preselected. |
| Two or more | Empty. "Choose a Quest Circle." Save stays off until a circle or **No Quest Circle** is picked. |
| None led | Empty. Only **No Quest Circle** listed. |

On a member's Edit page, circles that member leads or co-leads are never
listed. An archived discipler narrows nothing: every circle listed. Teams
are never listed (see "Teams").

The **Quest Circle** field shows only for accounts allowed to change Quest
Circles. Without that permission, Add member and Edit save the member with
no circle change.

## Circle membership rules

One circle per plain member. Leaders and co-leaders are not limited. Teams
follow their own rules (see "Teams").

| Action | Result |
|---|---|
| Add a member with no discipler | Member joins. Discipler set to the circle leader, or the co-leader in a circle with no leader. Added to Agapay. |
| Add a member whose discipler is the circle leader or co-leader | Member joins. Discipler unchanged. |
| Add a member already in another circle | Refused: "Already in <circle>. Remove from that circle first." |
| Add a member who walks with someone outside the circle | Refused: "Walks with <name>. Change the discipler first." |
| Add the circle's leader or co-leader as a member | Refused: "Circle leaders cannot join as members." |
| Add an archived member | Refused: "Member archived. Restore first." |
| Change the role of someone no longer in the circle | Refused: "Member not in this Quest Circle." |
| Remove a member | Member leaves. Discipler cleared when it was the circle leader or co-leader. |
| Add a removed member again | Member rejoins. |
| Change the circle's leader | Members who walked with the old leader now walk with the new one. Others unchanged. |

## Teams

A team, for example a ministry crew, is not a discipleship circle. Members
keep their own Quest Circle and join a team on top of it. Agapay never shows
a team as a member's circle.

- **Mark a team:** Admin → **Quest Circles** → **Add Quest Circle** or circle
  **Edit** → **Team** ticked. Unticked by default: a new group is a Quest
  Circle.
- **Badge:** "Team" on the circle card, the circle page header, the member
  profile **Quest Circles** list and **My Quest Circles**.
- **Members:** added and removed on the team's own page. The member
  **Quest Circle** field never lists teams, and the Edit page moves the
  Quest Circle only, never a team membership.

| Action on a team | Result |
|---|---|
| Add a member already in a Quest Circle | Member joins the team. Quest Circle kept. |
| Add a member who walks with someone outside the team | Member joins. Discipler unchanged. |
| Add a member with no discipler | Member joins. No discipler set. Not added to Agapay. |
| Add the team's leader or co-leader as a member | Refused: "Circle leaders cannot join as members." |
| Remove a member | Member leaves. Discipler unchanged. |
| Change the team's leader | No discipler moved. |
| Turn the team back on | No member removed. |
| Sign-up QR of a team | Account linked, team joined. No discipler set. |
| Archive or delete the team's leader | Refused: "Leads <team>. Change the leader first." |

A team membership never counts as another circle: a team member joins a
Quest Circle under the usual rules, and a Quest Circle turned back on keeps
its team members.

Ticking or unticking **Team** on an existing group changes no membership
and no discipler.

## New member with a circle

The **Discipler** field shows "Loading Quest Circles..." until the circle list
loads. When the list fails to load: **Discipler** shown, **Quest Circle**
hidden, and the line "Quest Circles not loaded. Reload to assign a circle."

The member is saved first, then added to the chosen circle. A refused add
keeps the new member and shows "Member created. Quest Circle not set." with
the reason. **Edit Member** opens the record to fix the circle.

## Moving a member to another circle

Member **Edit** page, **Quest Circle** field. A refused move leaves the member
in the old circle with the original joined date, and shows the reason.

After any failed save, the page reloads the member's current circle and
discipler. The entered values stay on the form. A retry starts from the
current state.

The field covers plain membership only. A circle the member leads or co-leads
is set on the circle itself, not here.

## Agapay enrollment warnings

A save, circle add, role change, leader change, sign-up link or import
stands even when adding the member to Agapay fails.

| Where | Warning |
|---|---|
| Member **Edit** page | "Saved. Agapay enrollment failed. Save again to retry." The form stays open. |
| **Add member** | "Member created." and "Agapay enrollment failed. Save on the Edit Member page to retry." |
| Circle page **Add Member**, member profile **Quest Circles** add | "Agapay enrollment failed. Save on the Edit Member page to retry." |
| Sign-up request **Link record** or **Create record**, and the note under a linked request (auto-linked too) | "Agapay enrollment failed. Save on the Edit Member page to retry.", after any circle note |
| **Quest Circles** tab after a leader change | "2 Agapay enrollments failed. Save on each member's Edit page to retry." |
| **Import Members** results | Same count line, below the totals |

Saving the member's Edit page retries. A member already in Agapay with an
empty checklist gets the checklist for the current stage on that save. The
count lines name no member: after a leader change, the circle members now
walking with the new leader; after an import, the members whose discipler
the import set. Saving a member already in Agapay changes nothing there.

## Changing a circle's leader

Admin → **Quest Circles** → circle **Edit** → **Leader**. On save, plain
members who walked with the old leader move to the new leader, and join the
new leader's Agapay queue. Members with another discipler stay as they are.
A cleared leader moves no one.

Outcome above the circle list, for example "3 members now walk with
<leader>." On a failed move: "Members not moved to the new leader. Set
disciplers on each member's Edit page." Moved members not added to Agapay:
"2 Agapay enrollments failed. Save on each member's Edit page to retry."

## Turning a circle back on

Admin → **Quest Circles** → circle **Edit** → **Active** ticked again. Members
who joined another active circle while this one was inactive leave this
circle and stay in the other one. Leaders, co-leaders and disciplers are
unchanged.

Outcome above the circle list, for example "2 members removed: already in
another Quest Circle." On a failure: "Members in two Quest Circles not
removed. Remove from the circle page."

## Sign-up QR codes

Each Quest Circle has its own sign-up link and QR code. A leader of several
circles picks the circle on the **Quest Circle** page (Profile → Quest
Circle). The scanned QR code decides the circle.

A linked sign-up joins the scanned circle under the same rules as an admin
add. Confident matches join on their own. Reviewed requests join when **Add to
this circle as a disciple** stays ticked.

| Situation | Result |
|---|---|
| No other circle, no discipler or a discipler who leads this circle | Joins the circle. Discipler set when empty. |
| Already in this circle, or leads or co-leads it | Unchanged. Leader roles kept. |
| Already in another circle | Account linked. Note: "Quest Circle not set. Already in <circle>. Remove from that circle first." |
| Walks with someone outside the circle | Account linked. Note: "Quest Circle not set. Walks with <name>. Change the discipler first." |
| Member archived | Account linked. Note: "Quest Circle not set. Member archived. Restore first." |
| Sign-up QR of a team | Joins the team. No discipler set. In another circle or walking with someone outside the team: joins anyway. |
| Adding to Agapay failed | Account linked. Note ends with "Agapay enrollment failed. Save on the Edit Member page to retry." |

The note shows after **Link record** or **Create record**, and under the
linked request. Confident matches (Admin → **Member sign-ups** →
**Auto-linked**) are linked only: no circle. Add them on the circle page.

## Spreadsheet import

Admin → **Settings** → **Import Members**. A discipler from the sheet is set
only for members with no discipler. Members who already have one keep it,
counted as "discipler links skipped: already assigned". A discipler set by the
import also adds the member to Agapay. Failed adds show as a count below
the totals, for example "3 Agapay enrollments failed. Save on each member's
Edit page to retry."

Family members sharing one email address: the second person is imported
without an email.

## Circles started in Agapay

A discipler can start a circle from Agapay's **Add a disciple** sheet. The
circle appears here with that discipler as leader.

## Archiving and deleting a member

Admin → **Members**, member actions **Archive** and **Delete**.

| Situation | Archive | Delete |
|---|---|---|
| Other members walk with this member | Refused: "Disciples assigned. Reassign them first." | Same |
| Leads or co-leads an active circle | Refused: "Leads <circle>. Change the leader first." | Same |
| Member in Agapay | Archived | Refused: "Agapay history exists. Archive instead." |

An archived member leaves every circle where they were a plain member. The
circle history stays. Restoring the member does not rejoin a circle. An
archived member cannot join a circle: "Member archived. Restore first."

## Permission refusals

An action refused for a missing permission shows "Not permitted. An admin
grants access." Admin → **Settings** → **Roles & Permissions** sets each
role's permissions.
