# Owner onboarding guide

A fresh installation has one owner account (from `npm run db:bootstrap`). Sign in with the
temporary password; you'll be asked to set a permanent one.

## 1. Settings (Administration → Settings)
* Business name and VAT number (printed on purchase orders).
* **Allow negative stock** — off by default. Leave it off unless you deliberately sell before receiving.
* **Critical level %** — a product is *critical* when available ≤ this % of its minimum (default 50%).
* **Consumption window** — days used to compute average daily consumption (default 30).
* **Safety days** — safety stock used when a product has no explicit safety stock.
* **Auto-draft replenishment** — create draft requests automatically when an alert opens.
* **Automated purchasing policy** — OFF by default. When on, drafts are approved and sent to the
  supplier with no human approval. Enable only with agreed supplier terms.
* Notification channels — switch on email/WhatsApp/SMS; the page shows which need setup.

## 2. Branches (Master data → Branches)
Create each branch with a short code (e.g. `RUH-01`), address and contact. Per branch you can
disable auto-drafting and set the **review period** (days between orders, used in reorder sizing).

## 3. Suppliers
Add suppliers with their **lead time** (days from order to delivery). Lead time drives the
recommended order quantity. To give a supplier portal access, create a user with role
*Supplier* linked to that supplier.

## 4. Products and categories
* SKU (unique), optional barcode, Arabic and English names, category, **base unit**, cost price
  (SAR, used for valuation), optional selling price, default supplier.
* Extra units: e.g. *Carton = 12 pieces*. Mark one as **order unit** to round orders to full cartons.
  Each unit may have its own barcode (scanning the carton barcode selects the carton unit).

## 5. Stock levels per branch
Open a product → *Stock by branch* and set **minimum**, optional **critical level**, **reorder
quantity** (minimum order), **maximum** (target) and **safety stock**. Minimum 0 = not monitored.

Opening balances: use *Record movement → Initial stock* (owner/manager) once per product and
branch, or run a **stock count** for the whole branch — the count posts corrections for every difference.

## 6. Users
Create managers (one or more branches) and employees (exactly one branch). A temporary password
is shown once; users must change it at first sign-in. Managers can create employees for their
own branches. Deactivating a user signs them out everywhere immediately.

## 7. Daily operation
* Dashboard → KPIs, alerts and branch comparison.
* Replenishment → approve drafts (adjust quantities if needed) → send to supplier → receive.
* Adjustments → approve damage/expiry/missing reports from employees.
* Audit log → who did what and when (logins, permission changes, approvals, adjustments, settings).

## Notes on correctness
* Stock never changes without a ledger entry; ledger entries cannot be edited or deleted (enforced
  by the database). Corrections are new entries (adjustment or count correction).
* Duplicate taps/network retries do not double-post (idempotency keys).
