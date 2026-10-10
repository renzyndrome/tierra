# User Guide — Member Finances (Giving Statement & Expense Reports)

This guide covers the member-facing finance features and the admin/finance steps
that support them. Three audiences: **Admins**, **Members**, and **Finance**.

---

## 1. Admins — link a signup to its member record

**Why:** Member records (with their giving already tagged) were imported first.
As people sign up, each new account must be connected to its existing member
record so their **Giving Statement** shows the right history. Signup only
auto-links when the person's **email matches** the email on their member record.
When it doesn't, the account is left unlinked (or a duplicate is created), and you
link it here.

**How:**
1. Go to **Admin → Users**.
2. Find the account. Under their email you'll see either:
   - **"Link member record"** (account is not linked), or
   - **"Linked: <name> · Change"** (already linked).
3. Click it. In the dialog, **search by name or email**.
4. Each result shows the member's **satellite** and **total giving on record**, and
   flags anyone **already linked to another account**. Pick the correct person and
   click **Link**.
5. To disconnect, open the dialog and click **Unlink**.

**Rules & tips:**
- One member record can be linked to only **one** account (the dialog blocks
  double-linking).
- If a duplicate member was created at signup, link the account to the **original**
  (income-tagged) record; then archive the duplicate from the members directory.

---

## 2. Members — my Giving Statement (SOA)

**Where:** Profile → **My Giving Statement** (`/profile/giving`).

- Shows **your own** contributions only (tithes, offerings, missions recorded
  against you). You never see anyone else's giving.
- **Period filter:** All time / This year / Last 12 months.
- Shows your **total given**, a breakdown **by category**, and your full
  **transaction history**.
- **Download** as PDF or Excel.

> If you see "No giving record yet — your account isn't linked," ask an admin to
> link your account (Section 1).

---

## 3. Members — request a Church Expense Report

**Where:** Profile → **Church Expense Report** (`/profile/expense-report`).

- This is a report of **how the church used its funds** (church-wide expenses),
  separate from your personal giving.
- Only **linked** accounts can request one. (If unlinked, you'll see a notice to
  contact an admin.)
- **To request:** pick a **From** and **To** date, add an optional note, and
  **Submit request**. Finance reviews it.
- **Statuses:** *Pending review* → *Released* (or *Rejected*, with a note).
- When **Released**, click **View report** to see an **aggregate summary by
  category** (Utilities, Supplies, Equipment, Events, Programs) with a total, and
  **Download PDF**. Individual expense line items are not shown — figures are
  aggregate only.

---

## 4. Finance — review expense report requests

**Where:** Finances → **Report Requests** (`/finances/report-requests`).
Requires the **View finances** permission; releasing/rejecting requires **Manage
finances**.

1. The queue lists requests with the requester, requested period, and status.
   Filter by **Pending / Released / Rejected / All**.
2. For a **Pending** request:
   - **Release** — the member can then view/download the aggregate report for that
     period.
   - **Reject** — optionally add a note explaining why; the member sees it.
3. Released/rejected requests are read-only (each request is reviewed once).

---

## Who can see what (quick reference)

| Data | Member (self) | Finance / Admin |
|------|---------------|-----------------|
| Own giving statement | ✅ | ✅ (via finance tools) |
| Another member's giving | ❌ | ✅ |
| Church expense **details** (line items) | ❌ | ✅ |
| Church expense **aggregate** (a released report) | ✅ for released periods | ✅ |

Finance data is protected on the server (permission checks + a per-user finance
PIN for the finance dashboard). Members only ever reach their own data.
