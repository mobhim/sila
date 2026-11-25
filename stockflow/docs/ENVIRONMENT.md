# Environment variables

Secrets are read only on the server. Nothing here is exposed to the browser except
`NEXT_PUBLIC_*` variables.

## Required

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/stockflow?sslmode=require` | PostgreSQL connection. Use a pooled URL on serverless hosts (e.g. Neon pooler, `?pgbouncer=true&connection_limit=1`). |
| `APP_URL` | `https://stock.example.sa` | Public URL, used for links in emails/messages. |
| `CRON_SECRET` | 32+ random chars | Protects `/api/cron/notifications`. Callers send `Authorization: Bearer <secret>`. |

## Optional

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_TIME_ZONE` | `Asia/Riyadh` | Business time zone for dates and day boundaries. |
| `UPLOAD_DRIVER` | `local` | `local` (single server with persistent disk) or `s3`. |
| `UPLOAD_DIR` | `./.uploads` | Directory for the local driver. |
| `S3_ENDPOINT` | AWS regional | S3-compatible endpoint (Cloudflare R2: `https://<account>.r2.cloudflarestorage.com`). |
| `S3_REGION` | `auto` | Region. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | — | Required when `UPLOAD_DRIVER=s3`. Bucket must be private. |

## Notification channels

Each channel also has an on/off switch in **Settings**. A channel that is switched on but missing
credentials shows **Requires setup** and its deliveries are marked `NOT_CONFIGURED`.

**Email (SMTP)** — `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` for 465), `SMTP_USER`,
`SMTP_PASSWORD`, `SMTP_FROM` (e.g. `StockFlow <no-reply@example.sa>`).

**WhatsApp Business (Meta Cloud API)** — `WHATSAPP_TOKEN` (permanent system-user token),
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE` (approved template name), `WHATSAPP_TEMPLATE_LANG`
(`ar` default), `WHATSAPP_API_VERSION` (`v21.0`). Business-initiated messages must use an approved
template with **two body variables**: `{{1}}` = title, `{{2}}` = message body.

**SMS** — `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; or
`SMS_PROVIDER=unifonic` with `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID` (registered sender name).

Users choose their own channels in **Profile**; phone numbers must be in international format
(`+9665…`).

## Scripts only

| Variable | Used by |
|---|---|
| `OWNER_EMAIL`, `OWNER_NAME`, `BUSINESS_NAME` | `npm run db:bootstrap` |
| `SEED_PASSWORD`, `ALLOW_DEMO_SEED` | `npm run db:seed` (refuses to run in production unless `ALLOW_DEMO_SEED=true`) |
| `TEST_DATABASE_URL` | `npm test` |
