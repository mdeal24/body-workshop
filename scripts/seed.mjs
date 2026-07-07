/**
 * Seed the Neon database from the migrated Google Drive JSON files.
 * Usage: DATABASE_URL=postgres://... npm run seed
 * Idempotent: uses CREATE TABLE IF NOT EXISTS + upserts by primary key.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = neon(url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const programData = JSON.parse(
  readFileSync(join(root, "seed", "program-data.json"), "utf8")
);
const entryData = JSON.parse(
  readFileSync(join(root, "seed", "BodyWorkshop-data.json"), "utf8")
);

await sql`
  CREATE TABLE IF NOT EXISTS workout_entries (
    id TEXT PRIMARY KEY,
    logged_by TEXT NOT NULL,
    entry_date DATE NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )
`;
await sql`
  CREATE TABLE IF NOT EXISTS programs (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    data JSONB NOT NULL
  )
`;
await sql`CREATE INDEX IF NOT EXISTS idx_entries_logged_by ON workout_entries (logged_by, entry_date DESC)`;
await sql`CREATE INDEX IF NOT EXISTS idx_entries_exercise ON workout_entries ((data->>'exercise'))`;

// Programs: store the per-program structure plus shared bits (intensityTiers, schedule)
const names = programData.meta.trainees; // { male: "Chris", female: "Maryam" }
for (const id of ["male", "female"]) {
  const data = {
    ...programData.programs[id],
    intensityTiers: programData.intensityTiers,
    schedule: programData.schedule,
    traineeName: names[id],
  };
  await sql`
    INSERT INTO programs (id, label, data)
    VALUES (${id}, ${names[id]}, ${JSON.stringify(data)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, data = EXCLUDED.data
  `;
  console.log(`program upserted: ${id} (${names[id]})`);
}

// Entries: program -> logged_by, everything else into data
let n = 0;
for (const e of entryData.entries) {
  const { id, date, program, ...rest } = e;
  await sql`
    INSERT INTO workout_entries (id, logged_by, entry_date, data)
    VALUES (${id}, ${program}, ${date}, ${JSON.stringify(rest)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      logged_by = EXCLUDED.logged_by,
      entry_date = EXCLUDED.entry_date,
      data = EXCLUDED.data
  `;
  n++;
}
console.log(`entries upserted: ${n}`);

const [{ count }] = await sql`SELECT count(*)::int AS count FROM workout_entries`;
console.log(`workout_entries total in DB: ${count}`);
