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

  Each exercise is a tuple `[name, sets, reps, rest, cue, superset?]`. The optional 6th
  element is a superset tag: consecutive exercises in a day sharing a tag render as one
  block (A/B/C), alternated with no rest between them and the full rest only after the
  last move. Core/abs live in their own session and are not part of these days.
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

The app reads programs from the DB, not from `seed/program-data.json` — after editing that
file, re-run the seed (it upserts by primary key) for the change to show up.

Idempotent — creates tables if missing and upserts programs + the migrated entries from `seed/`.
