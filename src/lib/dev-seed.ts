/**
 * Local-dev fallback for running the UI without a database.
 *
 * With no DATABASE_URL set, the read routes serve the files in `seed/` — the same
 * data `npm run seed` would load — so the app can be worked on offline. Writes are
 * not faked: logging a set still fails, because pretending it succeeded would show
 * a "Logged ✓" state that no database ever received. Never active in production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Row = { id: string; logged_by: string; entry_date: string; data: Record<string, unknown> };

export const noDb = () =>
  !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";

const readSeed = (file: string) =>
  JSON.parse(readFileSync(join(process.cwd(), "seed", file), "utf8"));

/** Mirrors the programs rows built by scripts/seed.mjs. */
export function seedPrograms() {
  const p = readSeed("program-data.json");
  const names: Record<string, string> = p.meta.trainees;
  return ["male", "female"].map((id) => ({
    id,
    label: names[id],
    data: {
      ...p.programs[id],
      intensityTiers: p.intensityTiers,
      schedule: p.schedule,
      traineeName: names[id],
    },
  }));
}

/** Mirrors the workout_entries rows built by scripts/seed.mjs. */
export function seedEntries(): Row[] {
  const { entries } = readSeed("BodyWorkshop-data.json");
  return entries
    .map((e: Record<string, unknown>) => {
      const { id, date, program, ...rest } = e;
      return {
        id: String(id),
        logged_by: String(program),
        entry_date: String(date),
        data: rest,
      };
    })
    .sort((a: Row, b: Row) => b.entry_date.localeCompare(a.entry_date));
}
