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

## Option B — Vercel + Neon (fastest; works from a browser)

1. Vercel → **Add New → Project** → import the GitHub repository. Set **Root Directory** to `stockflow`.
   Framework is detected as Next.js; the `vercel-build` script runs migrations automatically.
2. In the project → **Storage → Create Database → Neon (Postgres)**, connect it to the project.
   This adds `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct, used by migrations).
3. Environment variables: `APP_URL` (the site URL), `CRON_SECRET` (any long random string).
   For a demo site add `ALLOW_DEMO_SEED=true` to load sample branches, products, users and history
   on the first build (skipped automatically once users exist). Leave it out for real use and
   create the owner with `npm run db:bootstrap` instead.
4. Deploy. Uploads on Vercel default to the function's temporary disk (`/tmp`), which is not
   persistent — set `UPLOAD_DRIVER=s3` with an S3/R2 bucket for real use.
5. `vercel.json` registers a daily cron for `/api/cron/notifications` (allowed on the free plan).
   For near-real-time email/WhatsApp/SMS, call that URL every few minutes from an external
   scheduler with `Authorization: Bearer $CRON_SECRET`, or use a paid plan and a shorter schedule.

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
