# User Guide — Inventory (Items, Maintenance & Borrowing)

This guide covers the Inventory module: keeping the item list, logging
maintenance (e.g. aircon cleaning), and the borrow/deployment workflow that
tracks **who is responsible for a unit** when it goes to a satellite or an
outreach program.

**Who can do what:**
- **View inventory / submit borrow requests** — anyone whose role has
  *View inventory* (by default: Admin and Satellite roles).
- **Add/edit items, approve requests, check out / return, log maintenance** —
  anyone whose role has *Manage inventory* (by default: Admin and Satellite).
- Permissions are adjustable per role in **Admin → Manage Roles**.

---

## 1. Items

**Where:** Admin dashboard → **Inventory** tab.

- **Add an item:** click **+ Add Item**. Fill in name, location (Moriah Hall /
  Nxtgen Hall), quantity, category, condition, an optional photo, and the
  **Date Purchased** (optional — useful for warranty and age tracking).
- **Edit / Delete:** use the buttons on each item card.
- **Manage:** opens the item's detail page — this is where maintenance logs and
  the item's borrow history live.
- Use the search box, filters, and the grid/list toggle to find items quickly.

---

## 2. Maintenance logs (e.g. aircon cleaning)

**Where:** Inventory tab → item's **Manage** page → **Maintenance Logs**.

**How:**
1. Click **+ Log Maintenance**.
2. Pick the **date** and **type** (Cleaning, Repair, Inspection, Servicing,
   Calibration, Other).
3. Optionally add a description ("Aircon deep cleaning"), who performed it
   (person or vendor), the cost, and a **Next due** date.
4. Save. The log appears in the item's history, newest first.

**Tips:**
- Use **Next due** to record when the next service should happen (e.g. aircon
  cleaning every 6 months).
- Logs are permanent history; delete only mistaken entries.

---

## 3. Borrow / Deployment requests

**Where:** Inventory tab → **📦 Borrow Requests** (or `/admin/inventory/requests`).

This one record follows the item from request to return and answers "who has
it, where is it, and in what condition did it leave and come back?"

### Submitting a request (e.g. a ministry head needs speakers for an outreach)
1. Click **+ New Request**.
2. **Item** — start typing to search, pick the item, set quantity.
3. **Responsible member** — search and pick the person accountable for the unit
   while it's out. If they're not in the directory, clear the picker and type
   their name instead.
4. **Requesting ministry** (optional) — which ministry is asking.
5. **Destination** — where the unit is going:
   - *Internal / On-campus* — stays on site
   - *Satellite* — pick which satellite
   - *Outreach program* — name the program in the detail field
   - *Personal* — personal borrow
6. Add borrow date, expected return, and purpose, then **Submit Request**.
   It enters the queue as **Pending approval**.

### Processing a request (inventory managers)
On each request card:
1. **Approve** or **Reject** (rejection can include a reason).
2. **Check Out** when the item is physically handed over — you'll record the
   **condition before** it leaves.
3. **Record Return** when it comes back — you'll record the **condition after**.
   The item's current condition is updated to match, so damage is visible
   immediately on the item list.
4. **Cancel** is available to managers (and to the requester) any time before
   the item is handed out.

Use the status filter chips (Pending / Approved / Checked out / Returned /
Rejected / Cancelled) to work the queue. The item name on each card links to
that item's detail page, where the full borrow history is listed.

**Status meanings:**
| Status | Meaning |
|---|---|
| Pending approval | Submitted, waiting for a manager |
| Approved | Cleared, not yet handed out |
| Checked out | Unit is out — the responsible person shown on the card is accountable |
| Returned | Back in inventory; condition after recorded |
| Rejected / Cancelled | Closed without the item leaving |

---

## 4. Member profile — leaders at a glance

On any member's profile (Directory), the **Ministries** and **Quest Circles**
sections now show the responsible leaders — each ministry lists its **Ministry
Head**, and each Quest Circle lists its **Leader** and **Co-Leader** — with
their photo, linked to their own profile. Use this to quickly find who oversees
a volunteer.
