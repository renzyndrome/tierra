# Dev Notes — Inventory Module (maintenance + borrow/deployment)

Shipped 2026-07. Expands the basic item CRUD with purchase dates, maintenance
history, and a borrow/deployment lifecycle. See `USER-GUIDE-inventory.md` for
the end-user flow.

## Database (migration `supabase/2026-07-17_inventory_module.sql`)
> `*.sql` is gitignored — the migration + rollback live locally and are applied
> to the Supabase project (already applied to prod).

- `inventory_items.date_purchased DATE NULL` — added column.
- `inventory_maintenance_logs` — per-item dated service history.
  `maintenance_type` CHECK: Cleaning | Repair | Inspection | Servicing |
  Calibration | Other. `next_due_date` for scheduling. FK `item_id` CASCADE.
- `inventory_borrow_requests` — ONE row per checkout covering request → approval
  → checkout → return **and** deployment tracking:
  - `status`: pending → approved → checked_out → returned (terminals: rejected,
    cancelled). Enforced server-side by `loadAndAssertStatus`.
  - Custodian: `borrower_member_id` (FK members) or free-text `borrower_name`.
  - Destination: `destination_type` (internal|satellite|outreach|personal) +
    `destination_satellite_id` / `destination_detail`.
  - `condition_before` / `condition_after` (same enum as item condition);
    on return the item's `condition` is synced to `condition_after`.
- Both tables: RLS enabled, **no client policies** (service-role-only), standard
  `update_updated_at()` triggers, partial indexes on pending/active statuses.

## Server functions (all guarded via `_authGuard.requirePermission`)
- `src/server/functions/inventoryMaintenance.ts` — get/create/delete logs
  (read: `inventory.read`, write: `inventory.write`).
- `src/server/functions/inventoryBorrow.ts` — `getBorrowRequests` (filter by
  status/item), `createBorrowRequest` (needs `inventory.read`; zod refines:
  custodian required, satellite destination requires satellite id), and
  transitions `approve/reject/checkout/return/cancelBorrowRequest`
  (`inventory.write`; cancel also allowed to the original requester while not
  yet checked out).
- `getInventoryItem` added to `inventory.ts` (single item + signed photo URL).
- PostgREST embeds use explicit FK hints
  (`inventory_borrow_requests_<col>_fkey`) — verified against live constraint
  names; keep them in sync if columns are renamed.

## UI
- `src/routes/admin/inventory/$itemId.tsx` — item detail: info/purchase date,
  maintenance log CRUD, borrow history. Guarded `inventory.read`; write actions
  hidden without `inventory.write`.
- `src/routes/admin/inventory/requests.tsx` — queue with status filter chips,
  new-request dialog, lifecycle actions, condition dialog on checkout/return.
- `src/components/ui/combobox.tsx` — dependency-free searchable select
  (type-to-filter, keyboard nav, `role="listbox"`/`option`, optional clear
  button). Used for item/member/ministry pickers; reuse it for future
  searchable dropdowns.
- Entry points in `admin/index.tsx` Inventory tab: "📦 Borrow Requests" link,
  per-item "Manage" links, Date Purchased field in the item dialog.

## Types
`src/lib/types.ts`: `InventoryMaintenanceLog(Insert)`,
`InventoryBorrowRequest(WithRelations/Insert)`, `MaintenanceType`,
`BorrowStatus`, `BorrowDestinationType`; both tables registered in the
hand-maintained `Database` type. Option lists/labels/badges in
`src/lib/constants.ts` (`MAINTENANCE_TYPES`, `BORROW_*`).

## E2E (`e2e/inventory.spec.ts`)
- Auth-guard test (always runs): `/admin/inventory/requests` → login redirect.
- Lifecycle test (needs `E2E_ADMIN_EMAIL/PASSWORD`): submit via combobox →
  approve → check out → return → item detail → log maintenance.
- Runs against the DB the app points at; it creates rows named
  `E2E Custodian <ts>` / purpose `E2E lifecycle test` / description
  `E2E cleaning check`. Clean up after runs:
  ```sql
  DELETE FROM inventory_maintenance_logs WHERE description = 'E2E cleaning check';
  DELETE FROM inventory_borrow_requests
   WHERE borrower_name LIKE 'E2E Custodian %' OR purpose = 'E2E lifecycle test';
  ```

## Related: member profile leaders
`getMemberWithRelations` (`members.ts`) embeds ministry `head` and cell-group
`leader`/`co_leader` (FK-disambiguated). Rendered as `LeaderChip` rows in
`directory/members/$memberId.tsx`.

## Deliberate scope decisions
- Request creation requires `inventory.read` — ministry heads need a role with
  that permission; there is no auto-detection of "is a ministry head" from the
  user↔member link (candidate follow-up).
- No quantity/availability enforcement: approving N overlapping requests for
  the same item is allowed; managers judge availability (partial index
  `idx_inv_borrow_active` exists if a availability check is added later).
