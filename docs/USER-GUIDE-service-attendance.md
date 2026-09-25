# User Guide — Service Attendance (for Registration Personnel)

This is your step-by-step guide to running attendance for a service: creating the
session, showing the QR code, checking people in, and cleaning up the review queue
afterwards.

**You don't need any technical knowledge.** Just follow the run sheet below.

---

## Before you start

**What you need**
- A Quest Laguna account that can sign in at the admin site.
- The **Registration** role (or Admin). Two levels exist:
  - *View attendance* — you can see sessions and numbers, but not change anything.
  - *Manage attendance* — you can create sessions, check people in, and review matches.
  If buttons like **Start a session** are missing, you only have view access — ask an
  admin to grant "Manage attendance".

**Where to go:** sign in → **Admin → Attendance**.

---

## The 60-second run sheet

| When | Do this |
|---|---|
| ~15 min before | **Start a session** for today's service |
| At the door | **Show QR** on a screen/TV so people can scan |
| During service | Watch the **checked in** count; use **Manual check-in** for anyone who can't scan |
| After service | **Close session** |
| Same day | Clear the **Review queue** (the amber "N to review" badge) |

---

## 1. Create (start) the session

Do this once per service, on the day of the service.

1. Go to **Admin → Attendance**.
2. Click **Start a session** (top right).
3. Fill in the form:
   - **Service** — pick one: *Family Sunday Service*, *Young Pro Service*,
     *Youth Service*, or *Dawn Prayerworks*.
   - **Date** — the date of the service (defaults to today).
   - **Satellite** *(optional)* — choose the campus, or leave as **All / Main**.
   - **Label** *(optional)* — a note shown beside the session, e.g. "Anniversary Sunday".
4. Click to create. The new session appears at the top of the list with a green
   **Open** badge.

> **One session per service per day.** Don't create a second session for the same
> service — check-ins would be split across both and your numbers won't add up.

### Reading the session list
Each row shows:
- The **service name** and an **Open** (green), **Overdue** (amber) or **Closed** (grey) badge
- An amber **"N to review"** badge when check-ins need your attention
- The date, satellite, and label
- A big number = **how many people have checked in**
- Buttons: **Show QR**, **Manage**, **Close / Reopen**

---

## 2. Show the QR code

People check in by scanning the session's QR code with their phone camera.

- Click **Show QR** on the session row (or **Show QR (new window)** inside the
  session). A full-screen QR page opens in a new window — put this on the TV,
  projector, or a tablet at the entrance.
- If the person running the screen is **not signed in** (e.g. the tech booth),
  open the session with **Manage** and click **Copy shareable link**, then send them
  that link. It opens the same QR display without needing an account.

> Keep the QR visible for the whole service — latecomers still need it.

---

## 3. How people check themselves in

When someone scans the QR, they see the service name and date, then:

- **Signed-in members** get a single big button: **"I'm here — Check in"**. One tap
  and they're done. These are matched to their member record automatically.
- **Guests / anyone not signed in** get a short form:
  - **Full name**
  - **Name of the person who invited you**

  These need to be matched to a member record afterwards — see the Review queue below.

**If the session is closed,** scanning shows *"Check-in is closed"* and no one can
check in. Reopen the session if you closed it too early.

---

## 4. Manual check-in (for people who can't scan)

Use this for anyone without a phone, with a dead battery, or who needs help.

1. Click **Manage** on the session.
2. Open the **Manual check-in** tab.
   *(This tab only appears while the session is **Open** and you have manage access.)*
3. Type the person's name in **Search members by name…**
4. Click the button beside the right person to check them in.

Because you picked them from the directory, manual check-ins are already matched —
they will **not** land in the review queue.

- Search: any part of the name, any order. "cruz juan" finds "Juan Dela Cruz".
- Each result: satellite and mobile number, for members with the same name.
- Members already in the session: **Checked in** (disabled).
- Past sessions: reopen, then use manual check-in to enter a paper list.

### Walk-ins not in the directory (register at the booth)

For someone new, e.g. a senior guest with no phone.

1. Search the name first. Result: **No members found.** or no match in the list.
2. Click **Register new person** (below the results).
3. Fill in the form:
   - **Name**: prefilled from the search.
   - **Mobile** *(optional)*.
   - **Satellite**: defaults to the session's satellite, else Quest Laguna Main.
   - **Invited by** *(optional)*.
4. Click **Register & check in**. Result: a new visitor record plus a check-in, status **New member**.

**Similar names in the directory**: the form lists existing members with a close
name instead of registering. Pick **Check in** beside the right member, or
**Register anyway** for a different person with the same name.

No review needed: booth registrations never enter the review queue.

---

## 5. Clear the Review queue (important)

When a guest types their name, the system tries to match it to an existing member.
Anything it isn't confident about is parked for a human to decide — that's you.

The queue holds only self check-ins from the QR form. Walk-ins registered at the
booth (section 4) skip it.

1. Click **Manage** on the session → **Review queue** tab.
   The tab shows a count, and the session row shows the amber **"N to review"** badge.
2. For each person marked **Needs review** you'll see **Suggested matches**. Choose one:
   - **Pick a suggested member** — if it's the same person (e.g. "Jun Dela Cruz" =
     "Junnel Dela Cruz"), click that member. Status becomes **Confirmed**.
   - **Create new member** — a genuine first-timer. This adds them to the directory
     and links the check-in. Status becomes **New member**.
   - **Ignore** — a test entry, a duplicate, or an unusable name. It stays recorded
     but is **excluded from attendance numbers**.
3. You're done when it says *"Nothing to review. All check-ins are matched."*

> Do this the **same day**, while you still remember who was there. Suggested matches
> get harder to judge later.

### What the statuses mean

| Status | Meaning | Counts in attendance? |
|---|---|---|
| **Auto-matched** | Confidently matched automatically (signed-in member, or a clear name match) | ✅ Yes |
| **Needs review** | The system isn't sure — waiting on you | ✅ Yes |
| **Confirmed** | You picked the correct member | ✅ Yes |
| **New member** | You created a new member record for them | ✅ Yes |
| **Ignored** | You dismissed it (test/duplicate/unusable) | ❌ No |

If someone accidentally checks in twice, the duplicate is automatically ignored, so
your count stays correct.

---

## 6. Close the session

Once the service is over, click **Close session** (on the row or inside the session).

- Closing **stops any further check-ins** — the QR shows "Check-in is closed".
- Numbers and the review queue stay available; closing doesn't delete anything.
- Made a mistake or a latecomer needs to check in? Click **Reopen**.

### Overdue sessions

A session still open after its service date (Philippine time) is **Overdue**.

- Badge: **Overdue** (amber) on the list and on the session page.
- QR check-in: stopped for overdue sessions. The QR page shows "Check-in is closed".
- Manual check-in: still available while the session is open.
- List banner: count of overdue sessions, plus **Close overdue sessions** to close them all at once.

---

## 7. Checking the numbers

- The session row shows the live **checked in** count.
- The **Check-ins** tab inside a session lists everyone, with how they checked in
  (*QR (self)*, *QR (guest)*, or *Manual*).
- **Admin → Attendance → View analytics** shows the bigger picture:
  - **Attendance trend** over time
  - **By service** and **By satellite**
  - **Most consistent attendees**

---

## Troubleshooting

**"I don't see the *Start a session* button."**
You have view-only access. Ask an admin for the "Manage attendance" permission.

**"Someone scanned but says nothing happened."**
Check the session is **Open**. If it's Closed, reopen it and ask them to scan again.

**"The QR says *Check-in is closed* but the session is Open."**
Session date already passed. QR check-in works on the service date only.
Next step: **Start a session** for today, or use **Manual check-in**.

**"The QR won't scan."**
Increase screen brightness and size. Alternatively use **Manual check-in**, or send
them the **Copy shareable link** URL directly.

**"A member checked in as a guest by mistake."**
No problem — resolve it in the **Review queue** by picking their member record. It
becomes *Confirmed* and counts normally.

**"There are two sessions for the same service today."**
Check-ins are split between them. Pick the one to keep, manually re-check-in anyone
from the other, then close (or delete) the extra one.

**"A member's name isn't in the search."**
Not in the directory yet. At the booth: **Manual check-in** → **Register new person**
(section 4). For a QR self check-in: **Create new member** in the review queue.

---

## Good habits

- Start the session **before** people arrive — not after the first person asks.
- Keep the QR on screen for the **whole** service.
- Close the session when the service ends so stray scans don't land in the wrong day.
- Clear the review queue the **same day**.
- Never create a duplicate session for the same service and date.
