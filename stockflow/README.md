# StockFlow — multi-branch inventory management

StockFlow gives a business owner live stock visibility across every branch. Employees record
each movement (mostly from a phone); the system keeps the balance through an append-only
ledger, raises low-stock alerts, drafts replenishment requests sized from real consumption,
routes them through approval to suppliers, and tracks deliveries, transfers and stock counts.

Arabic (RTL) and English, SAR currency, Gregorian dates with optional Hijri.

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture, permissions, inventory rules, workflows, schema |
| [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md) | Every environment variable |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment, backups, monitoring |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Owner onboarding: first branch, products, users, suppliers |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Guide for managers, employees and suppliers |

## Local development

Requirements: Node.js 20.12+, PostgreSQL 14+.

```bash
cp .env.example .env            # set DATABASE_URL
npm install
npx prisma migrate deploy       # create tables
npm run db:seed                 # OPTIONAL demo data (dev/staging only)
npm run dev                     # http://localhost:3000
```

Demo accounts created by the seed (password `Stockflow2026`):
`owner@stockflow.local`, `manager1@stockflow.local`, `emp11@stockflow.local`, `supplier@stockflow.local`.

Without the seed, create the first owner:

```bash
OWNER_EMAIL=you@company.sa OWNER_NAME="Your name" npm run db:bootstrap
```

## Tests

Integration tests run against a real PostgreSQL database (default
`postgresql://stockflow:stockflow@localhost:5432/stockflow_test`, override with `TEST_DATABASE_URL`).
The suite **truncates every table** in that database — never point it at real data.

```bash
npm test          # ledger, concurrency, idempotency, alerts, replenishment, transfers, counts, isolation, reports
npm run typecheck
```

## What is not simulated

Email, WhatsApp and SMS are real integrations (SMTP, Meta WhatsApp Cloud API, Twilio/Unifonic).
When credentials are missing, deliveries are marked **Requires setup** and Settings lists the
missing variables — nothing pretends to have been sent. See `docs/ENVIRONMENT.md`.
