# Body Workshop

Shared workout tracker for Chris & Maryam. Next.js 14 (App Router) + Neon Postgres on Vercel.
Migrated from the old Google Apps Script prototype (single JSON file in Drive).

## Stack

- Next.js 14, TypeScript, Tailwind
- Neon Postgres (via Vercel Marketplace integration), queried with `@neondatabase/serverless`
- Auth: single shared password (`APP_PASSWORD` env var) checked in middleware

## Data model

Two JSONB-flexible tables — add fields to `data` without migrations:

- `programs(id, label, data)` — `data` holds the full program (days/exercises/intensityTiers/schedule) per trainee slot (`male` = Chris, `female` = Maryam)
- `workout_entries(id, logged_by, entry_date, data, created_at)` — `data` holds `{exercise, day, weight, sets, reps, rir, notes, ...}`

## Env vars

- `DATABASE_URL` — set automatically by the Neon Vercel integration
- `APP_PASSWORD` — shared login password

## Local dev

```bash
npm install
DATABASE_URL=... APP_PASSWORD=... npm run dev
```

## Seeding

```bash
DATABASE_URL=... npm run seed
```

Idempotent — creates tables if missing and upserts programs + the migrated entries from `seed/`.
