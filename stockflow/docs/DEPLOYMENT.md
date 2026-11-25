# Production deployment

## Option A — Docker (any VM / container platform)

```bash
cp .env.example .env     # fill in docs/ENVIRONMENT.md variables
docker compose up -d --build
docker compose exec app node -e "1"   # container is up; migrations ran on start
```

The image runs `prisma migrate deploy` on start, then the Next.js standalone server on port 3000.
Put it behind a TLS-terminating proxy (Caddy, Nginx, a cloud load balancer). Mount a volume at
`/app/.uploads` or use `UPLOAD_DRIVER=s3`.

Create the first owner once:

```bash
docker compose exec -e OWNER_EMAIL=you@company.sa -e OWNER_NAME="Name" app npx tsx scripts/bootstrap-owner.ts
```
(or run `npm run db:bootstrap` from any machine with `DATABASE_URL` set).

Schedule the notification dispatcher every 1–5 minutes:

```bash
*/2 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://stock.example.sa/api/cron/notifications
```

## Option B — Vercel + managed PostgreSQL (Neon, Supabase, RDS)

1. Create the database; copy the **pooled** connection string into `DATABASE_URL`.
2. Import the repository, set the project root to `stockflow/`, add the environment variables.
3. Build command `npm run build` (default). Run migrations from CI or locally:
   `DATABASE_URL=... npx prisma migrate deploy`.
4. Uploads: set `UPLOAD_DRIVER=s3` (serverless functions have no persistent disk).
5. `vercel.json` registers a cron for `/api/cron/notifications` every 5 minutes; Vercel sends
   `Authorization: Bearer $CRON_SECRET` automatically. (Sub-daily crons require a paid plan;
   otherwise use an external scheduler as in option A.)

## Migrations

Schema changes are versioned in `prisma/migrations`. Deploy with `npx prisma migrate deploy`
(never `migrate dev`/`reset` against production). The first migration also installs the
append-only trigger on `inventory_transactions`, the one-open-alert partial index and CHECK
constraints.

## Backups

* Use the provider's point-in-time recovery (Neon, Supabase, RDS all offer it) — retain ≥ 14 days.
* Additionally take a nightly logical dump to separate storage:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > stockflow-$(date +%F).dump`
* Back up the uploads bucket/volume (object versioning on S3/R2).
* Test a restore quarterly into a staging database: `pg_restore --clean --no-owner -d "$STAGING_URL" file.dump`.

## Monitoring and error handling

* `GET /api/health` returns `{ ok, db }` — point uptime monitoring at it.
* Server errors are logged with an `[action]`/`[api]` prefix and the error page shows a reference
  digest users can quote. Forward stdout to your log platform; add Sentry (or similar) by
  instrumenting `instrumentation.ts` if desired.
* Watch `notification_deliveries` with `status = 'FAILED'` (Settings shows the latest deliveries
  and their errors). Failed sends are retried with backoff 1, 5, 15, 60, 240 minutes.

## Security checklist

* Serve only over HTTPS (cookies are `Secure` in production, HSTS header is sent).
* Use a dedicated database role without superuser rights.
* Rotate `CRON_SECRET` and provider tokens periodically.
* Keep the demo seed out of production (`npm run db:seed` refuses unless `ALLOW_DEMO_SEED=true`).
