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

With no `DATABASE_URL` set, the read routes serve the files in `seed/` instead, so the UI
can be worked on without a database. Writes still fail in that mode — a set cannot be
logged with nothing to log it to. The fallback is disabled whenever `NODE_ENV` is
`production`, which is what Vercel builds set, so it cannot activate on a deployment.

## Seeding

```bash
DATABASE_URL=... npm run seed
```

The app reads programs from the DB, not from `seed/program-data.json` — after editing that
file, re-run the seed (it upserts by primary key) for the change to show up.

Idempotent — creates tables if missing and upserts programs + the migrated entries from `seed/`.

## Deployment (Vercel)

Vercel watches the repo: every push to `main` is a production deploy, every pull request
gets its own preview URL.

1. vercel.com → **Add New → Project** → import this repo. It is private, so Vercel will ask
   for repository access. Framework preset is detected as **Next.js** — leave the build
   settings alone.
2. Set both environment variables under **Settings → Environment Variables**:
   - `DATABASE_URL` — the Neon connection string. Adding the Neon integration from the
     Vercel Marketplace sets this for you.
   - `APP_PASSWORD` — the shared login password.
3. Deploy, then visit **`/api/seed` once** while logged in.

Step 3 is the one that is easy to miss. The app reads its program from the database, not
from `seed/program-data.json`, so until the seed runs the deployed app shows whatever
program the database already holds — not what is in this repo.

`/api/seed` is idempotent and auth-gated by the middleware. It upserts both programs by
primary key and re-upserts the migrated historical entries from `seed/`; anything logged
since is left alone.

### Seeding changes the program for both trainees

`/api/seed` upserts the `programs` rows, and both Chris and Maryam read their day from
those same rows. Editing `seed/program-data.json` and seeding therefore changes what the
other person is told to train, not just your own view — worth agreeing on before running
it rather than after.

### Secrets

Never in the repo — both values live only in Vercel's environment variables and, for local
work, in `.env.local`, which is gitignored. `seed/` holds real names and training loads, so
keep this repository private.

### Security headers

Set in `next.config.mjs`, applied to every route: a same-origin CSP, `X-Frame-Options:
DENY`, `nosniff`, a strict referrer policy, camera/mic/geolocation disabled, and
`noindex, nofollow` to keep personal training data out of search engines.

Verify after deploying:

```bash
curl -sI https://<your-app>.vercel.app/ | grep -iE "content-security|x-frame|x-robots"
```
