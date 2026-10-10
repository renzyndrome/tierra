# Member sign-ups: Quest Circle leader guide

Sign-up by Quest Circle QR code. Existing members: account linked to the
existing member record, giving and attendance history included. New people:
new member record, created by the circle leader.

## Rollout steps (admin)

Once, before the first meeting. Circle leaders need a linked account before
the QR works.

**Step 1. Bootstrap the 28 leaders.** Per leader:

1. Admin → Users → **Invite**. Leader's email address.
2. **Link member record**: the leader's own record.
3. Role: **Member**.

Never the **Discipleship** role. That role edits any member record directly
and skips the Agapay audit log. Member role plus the link: enough for a
circle leader.

**Step 2. Leaders turn on the link at the meeting.** On at the start of the
meeting. Off when it ends.

## Leader prerequisite

Account linked to the leader's own member record. Missing link: the
**Quest Circle** page shows "No circle led". Fix: Admin → Users →
**Link member record**.

## Showing the QR code

1. Sign in. Open the profile.
2. **Quest Circle**, top of the profile.
3. Tick **Sign-up link active**.
4. QR code on screen, or **Copy** for the group chat.

Link off between meetings.

## Sign-up form

Fields:

- Full name, as on church records
- Email address
- Mobile number (optional)
- Birthday (optional)

Mobile number and birthday: optional, but they separate similar names.

Next: confirmation email. Open the link, set a password. Missing email: check
the spam folder.

## Reviewing requests

**Quest Circle** page, **Waiting for review** list. Confident matches link
automatically and skip this list.

Per request: the submitted details, then possible matches. Per match:

- Match score, for example "85% match"
- Match reasons: same email, name matches, same phone, in this circle
- Giving on record, for telling similar names apart

Actions:

- **Link record**: links the account to that record. The normal case.
- **Create new member**: new to the church, no record yet.
- **Reject**: unknown person.

**Add to this circle as a disciple**: on by default. Adds the person to the
circle. Sets the circle leader as discipler when none is set. Existing
discipler unchanged.

Already in another circle, or walking with someone outside this circle:
account linked, circle unchanged. Note shown, for example "Quest Circle not
set. Already in <circle>. Remove from that circle first." Confident matches
(Admin → **Member sign-ups** → **Auto-linked**) are linked only, with no
circle. Add them on the circle page.

Agapay follow-up queue: automatic. A linked person with a discipler joins that
discipler's Agapay queue the moment the leader confirms. When that fails, the
link stands and the note reads "Agapay enrollment failed. Save on the Edit
Member page to retry." An admin saves the member's Edit page to retry.

### New people (not yet in the directory)

Same QR, same form. No record matches, so the request arrives with no
candidates.

Leader action: **Create new member**.

Result: member record created, account linked, person added to the circle,
circle leader set as discipler, person added to the leader's Agapay queue.
Stage: Newbie. City: blank, for an admin to fill in.

Before the leader acts: sign-in works, profile shows "Sign-up under review".

### Uncertain match

No guessing. A wrong link hands one person another person's giving history.
Leave the request in the queue. Ask an admin, or confirm the email and
birthday with the person.

### "Account exists" badge

Record already claimed by another account. Not selectable. Report to an admin.

## Leaked link

**Replace link** on the Quest Circle page. Old QR code stops working at once.
Requests already submitted: unaffected.

## Common cases

**Duplicate sign-up.** Second attempt: fresh confirmation email, no second
account.

**Sign-in not working yet.** Email link not opened yet. Account unusable until
then.

**Giving missing after a link.** Likely the wrong record. Admin undo: Admin →
Member Sign-ups.
