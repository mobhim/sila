# STOCKFLOW — Architecture & Database Design

This document is the Phase 1 deliverable: system architecture, roles and permissions,
core workflows, inventory calculation rules, and the database schema. The schema
itself lives in `prisma/schema.prisma`; raw-SQL constraints Prisma cannot express are in
`prisma/migrations/*/migration.sql` (see "Constraints outside Prisma").

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | Server components render data straight from the DB; server actions give CSRF-protected mutations without a hand-written API for every form. |
| UI | Tailwind CSS 4 + an in-repo component kit (`src/components/ui`) | No heavy component dependency; full control over RTL (logical properties `ms-/me-/ps-/pe-`). |
| Charts | Recharts | Mature, SSR-safe when rendered in client islands. |
| Database | PostgreSQL 14+ | Row locks (`SELECT … FOR UPDATE`), partial unique indexes, `numeric` precision. |
| ORM | Prisma 6 | Typed queries, migrations, interactive transactions; raw SQL where locking is needed. |
| Auth | In-house: bcrypt password hashes + opaque DB-backed sessions | No third-party dependency; sessions can be revoked server-side; tokens stored only as SHA-256 hashes. |
| Barcode | `BarcodeDetector` where the browser has it, `@zxing/browser` otherwise (iOS Safari) | Works on the phones employees already have. |
| Email | SMTP via Nodemailer | Any provider (SES, Postmark, Mailgun, Office 365, Zoho). |
| WhatsApp | Meta WhatsApp Business Cloud API (template messages) | Official API. |
| SMS | Twilio or Unifonic (common in KSA) | Either is selected by env vars. |
| Files | Storage interface: local disk (single server) or S3-compatible (AWS S3, Cloudflare R2, MinIO) | Serverless hosts have no persistent disk. |

Deployment target: any Node 20+ host (Docker image provided) or Vercel + managed Postgres
(Neon, Supabase, RDS). A cron hits `/api/cron/notifications` to dispatch/retry external messages.

**Tenancy.** One deployment = one business (single tenant). Every branch-owned row carries
`branch_id`; isolation is between branches, enforced server-side (see §4).

## 2. Code layout

```
src/
  app/                      routes (pages, server actions, route handlers)
    (auth)/login
    (app)/…                 authenticated staff area (owner, manager, employee)
    supplier/…              supplier portal (separate layout, separate nav)
    api/…                   exports, uploads, barcode lookup, cron, health
  server/                   ALL business logic — never imported by client components
    auth/                   password, session, current user, rate limit
    rbac.ts                 permission matrix + branch scoping
    inventory/ledger.ts     the only code path that changes stock
    inventory/calc.ts       pure calculations (status, ADC, days left, reorder qty)
    alerts.ts               low-stock engine
    replenishment.ts        replenishment state machine
    transfers.ts            transfer state machine
    counts.ts               physical count + reconciliation
    adjustments.ts          adjustment request / approval
    notifications/          in-app + outbox + channel providers
    reports.ts              report queries (shared by screens, CSV and print/PDF)
    audit.ts                audit log writer
    storage/                file storage drivers
  components/               UI (client + server components)
  i18n/                     Arabic/English dictionaries, formatting (SAR, Hijri)
  lib/                      framework-agnostic helpers safe for the client
tests/                      vitest suites run against a real PostgreSQL database
```

## 3. Roles and permissions

Roles are fixed (`OWNER`, `MANAGER`, `EMPLOYEE`, `SUPPLIER`) and map to a permission
matrix in `src/server/rbac.ts`. Every server action and route handler calls
`requirePermission()` and, for branch data, `assertBranchAccess()` — UI hiding is
cosmetic only.

| Permission | Owner | Manager | Employee | Supplier |
|---|:-:|:-:|:-:|:-:|
| View all branches | ✓ | assigned | primary branch | — |
| Manage branches | ✓ | — | — | — |
| Manage products, categories, suppliers | ✓ | — | — | — |
| View inventory & ledger | ✓ | assigned | own branch (stock), own transactions | — |
| Record consumption / withdrawal / return | ✓ | ✓ | ✓ | — |
| Receive stock (free receipt) | ✓ | ✓ | — | — |
| Request adjustment / report damage or loss | ✓ | ✓ | ✓ | — |
| Approve adjustments | ✓ | assigned | — | — |
| Edit stock thresholds | ✓ | assigned | — | — |
| Create / approve replenishment | ✓ | assigned | — | — |
| Transfers: request / approve / dispatch / receive | ✓ | assigned (source or destination) | — | — |
| Physical counts: run / approve | ✓ | assigned | count entry only | — |
| Reports | ✓ | assigned branches | — | — |
| Manage users | ✓ | employees of assigned branches | — | — |
| Audit log, settings | ✓ | — | — | — |
| Supplier portal | — | — | — | own supplier's requests |

Managers see only branches in `branch_users`. Owners can grant a manager several branches,
which is the "explicitly authorized" cross-branch case.

## 4. Branch isolation

* `branch_users(user_id, branch_id, is_primary)` is the single source of branch access.
* `getBranchScope(user)` returns `"ALL"` for owners or the list of branch ids. All list
  queries take that scope; all single-record reads call `assertBranchAccess(user, branchId)`
  after loading the record, so guessing an id returns 404, not data.
* Employees never send a branch id: the server uses their primary branch.
* Suppliers are a separate user type (`users.supplier_id`); portal queries filter on
  `supplier_id` and only statuses from `SENT_TO_SUPPLIER` onward. Suppliers have no route
  into `(app)/`.
* Tests in `tests/isolation.test.ts` exercise cross-branch reads and writes.

Postgres row-level security is **not** enabled: Prisma shares pooled connections, so RLS
would require wrapping every query in a transaction that sets a session variable. The
access layer above is the enforcement point and is covered by tests. RLS can be added as
defence in depth later without schema changes.

## 5. Inventory rules

* Quantities are `numeric(18,3)` in the product's **base unit** (e.g. piece). Other units
  (carton = 12 pieces) are rows in `product_units` with a conversion `factor`. Entry in
  any unit is converted to base units on the server; the transaction keeps the entered
  quantity, unit and factor for traceability.
* `available = quantity − reserved`. `reserved` is reserved for future order-taking; it is
  0 unless set by a future module, and the calculations already honour it.
* **Negative stock** is rejected unless `settings.allow_negative_stock` is true.
* **Every change is a ledger row.** `branch_inventory.quantity` is written only by
  `server/inventory/ledger.ts → postMovements()`, which, inside one DB transaction:
  1. locks the affected `branch_inventory` rows with `SELECT … FOR UPDATE`, in a stable
     order (product id) to avoid deadlocks;
  2. computes `previous → new`, checks the negative-stock rule;
  3. writes `inventory_transactions` with previous/new quantity, user, reason, links;
  4. updates the balance, `last_movement_at` and average daily consumption;
  5. re-evaluates alerts for the row (same transaction, so alerts can never disagree
     with the balance).
* **Idempotency.** Mutating requests from the employee screen carry a client-generated
  `idempotency_key` (UUID, created when the form opens). `inventory_transactions` has a
  unique index on it; a replay returns the original transaction instead of deducting
  twice. Multi-line workflows (receive, dispatch, count approval) store their key in
  `idempotency_keys` and additionally guard on their state machine (a transfer cannot be
  dispatched twice because the status check happens under a row lock).
* Signed quantities: outflows (consumption, withdrawal, damaged, expired, transfer out,
  negative adjustments) are negative; inflows positive.
* **Average daily consumption** (ADC) = Σ(consumption + withdrawal) over the last
  `consumption_window_days` (default 30) ÷ window days. Days remaining = available ÷ ADC.

### Stock status

| Status | Rule |
|---|---|
| Out of stock | available ≤ 0 |
| Critical | available ≤ critical level (`critical_stock`, or `min_stock × critical_percent`, default 50%) |
| Low | available ≤ `min_stock` |
| Normal | above `min_stock` |
| Replenishment pending | any of the above while an open replenishment request covers the item |

`min_stock = 0` means "not monitored" — no alerts.

### Recommended replenishment quantity

```
safety      = safety_stock  (or ADC × settings.safety_days when safety_stock is 0)
cover       = ADC × (supplier lead time + branch review period) + safety
target      = max_stock > 0 ? max_stock : min_stock + reorder_qty
needed      = max(target, cover, min_stock + 1 unit)
recommended = needed − available − on_order          (on_order = open request items not yet received)
recommended = max(recommended, reorder_qty)  when recommended > 0
recommended = round up to the order multiple (largest purchase-unit factor marked as order unit)
```

The breakdown is stored on the request item and shown to the approver, who may override it.

## 6. Workflows

### Low-stock alerts
One open alert per (branch, product): enforced by a **partial unique index** on
`stock_alerts(branch_id, product_id) WHERE status <> 'RESOLVED'`. A movement that keeps the
item low does not create a duplicate; it may escalate the level (low → critical → out),
which notifies again. Rising above `min_stock` resolves the alert; falling again opens a
new one.

### Replenishment state machine

```
DRAFT → PENDING_APPROVAL → APPROVED → SENT_TO_SUPPLIER → ACCEPTED → IN_TRANSIT
                                                              ↘ PARTIALLY_RECEIVED → RECEIVED
any non-received state → CANCELLED
```
* Auto drafts are created by the alert engine when `auto_draft_replenishment` is on and no
  open request already covers the product in that branch; drafts for the same branch and
  supplier are merged into one request.
* Approval requires `replenishment.approve`. Nothing is sent to a supplier — and no
  purchase is implied — without that approval, unless the owner enables the separate
  automated purchasing policy (`settings.auto_approve_replenishment`), which is off by
  default and audited.
* Approved requests carry PO numbers and unit costs and act as the purchase order; a
  separate PO table would duplicate them.
* Receiving can be partial, any number of times; each receipt posts `PURCHASE_RECEIPT`
  transactions and updates `received_qty`. When every line is fully received the request
  becomes `RECEIVED`; a manager can also close a partially received request.
* Suppliers accept/decline, set in-transit with an expected date, confirm shipped
  quantities and upload delivery documents. The branch records what actually arrived.

### Transfers
`REQUESTED → APPROVED → DISPATCHED → (PARTIALLY_RECEIVED →) COMPLETED`, cancel before
dispatch. Stock leaves the source only on dispatch (`TRANSFER_OUT`) and enters the
destination only on receipt (`TRANSFER_IN`); a short receipt leaves the difference
recorded as in-transit loss, which the destination manager can close with a reason.

### Physical counts
Create (branch + optional category) → enter counted quantities (system quantity is
snapshotted the moment each line is counted) → submit → approver reviews variances
(reason required for every non-zero variance) → approval posts `COUNT_CORRECTION`
transactions of `counted − snapshot` applied to the *current* balance, so sales made
during the count are not lost. History is never rewritten.

### Adjustments and damage reports
Employees file a request (damaged, expired, missing, or other correction) with reason and
optional photo. Managers approve or reject; approval posts the transaction. A manager's own
request is auto-approved and both sides are recorded.

## 7. Notifications

`notifications` holds in-app messages. For each recipient who opted into email/WhatsApp/SMS
and has an address, a `notification_deliveries` row is written in the same transaction
(outbox pattern). The dispatcher (`/api/cron/notifications`, secured by `CRON_SECRET`)
sends pending rows, retrying with exponential backoff (1, 5, 15, 60, 240 min; 5 attempts).
If a channel's credentials are missing the delivery is marked `NOT_CONFIGURED` and the
Settings page shows the channel as "requires setup" — nothing is faked.

## 8. Security

* bcrypt (cost 12) password hashes; login rate-limited per email and per IP in the DB
  (`rate_limits`), generic error messages, constant-time-ish comparison via bcrypt.
* Session cookie: random 32 bytes, `HttpOnly`, `Secure` in production, `SameSite=Lax`,
  hashed at rest, 12-hour idle / 7-day absolute lifetime, revoked on password change and
  deactivation.
* Server actions are origin-checked by Next.js (CSRF). Every input is validated with Zod.
* Uploads: size limit, MIME sniffed from magic bytes (PDF, PNG, JPEG, WebP), random
  storage keys, served through an authorized route with `Content-Disposition`.
* Security headers (CSP, frame-ancestors none, nosniff, referrer policy) in
  `next.config.ts`.
* Audit log for: logins, user/role/branch-access changes, branch/product/supplier changes,
  threshold changes, adjustments, approvals, transfers, counts, settings.

## 9. Database schema (summary)

| Table | Purpose | Key constraints |
|---|---|---|
| users | staff and supplier accounts | unique email; `supplier_id` FK for supplier users |
| sessions | login sessions | unique token hash; FK user (cascade) |
| rate_limits | login/action throttling | PK key |
| branches | branches | unique code |
| branch_users | branch access | PK (user, branch) |
| product_categories | categories (one level of nesting) | unique name |
| suppliers | suppliers / representatives | unique code |
| products | catalog | unique sku, unique barcode |
| product_units | unit conversions | unique (product, unit) |
| branch_inventory | balance + thresholds per branch × product | unique (branch, product) |
| inventory_transactions | ledger (append-only) | unique idempotency key; indexes on branch/product/user/type × time |
| stock_alerts | low-stock alerts | partial unique open alert per branch × product |
| stock_adjustment_requests | adjustment / damage workflow | |
| replenishment_requests (+ _items, _receipts, _receipt_items) | replenishment / PO | unique number; unique (request, product) |
| inventory_transfers (+ _items) | branch transfers | check source ≠ destination |
| inventory_counts (+ _items) | physical counts | unique (count, product) |
| workflow_events | status history for requests, transfers, counts | index (entity) |
| attachments | uploaded files | |
| notifications, notification_deliveries | in-app + outbox | index (user, read) ; (status, next_attempt_at) |
| audit_logs | audit trail | index (entity), (created_at) |
| settings | organization settings (single row) | |
| idempotency_keys | multi-line operation replays | PK key |
| user_favorite_products | employee favourites | PK (user, product) |

### Constraints outside Prisma
Added in the first migration with raw SQL:
* partial unique index `stock_alerts_one_open_per_item`;
* `CHECK (source_branch_id <> destination_branch_id)` on transfers;
* `CHECK` that thresholds are non-negative;
* trigger blocking `UPDATE`/`DELETE` on `inventory_transactions` (the ledger is append-only).
