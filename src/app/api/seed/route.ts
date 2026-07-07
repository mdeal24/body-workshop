import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import programData from "../../../../seed/program-data.json";
import entryData from "../../../../seed/BodyWorkshop-data.json";

export const dynamic = "force-dynamic";

/**
 * One-shot idempotent seeder (auth-gated by middleware).
 * Creates tables if missing and upserts programs + migrated entries.
 */
export async function GET() {
  const sql = getDb();

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

  const names = programData.meta.trainees as Record<string, string>;
  const programs = programData.programs as Record<string, object>;
  for (const id of ["male", "female"] as const) {
    const data = {
      ...programs[id],
      intensityTiers: (programData as any).intensityTiers,
      schedule: (programData as any).schedule,
      traineeName: names[id],
    };
    await sql`
      INSERT INTO programs (id, label, data)
      VALUES (${id}, ${names[id]}, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, data = EXCLUDED.data
    `;
  }

  let entries = 0;
  for (const e of (entryData as any).entries) {
    const { id, date, program, ...rest } = e;
    await sql`
      INSERT INTO workout_entries (id, logged_by, entry_date, data)
      VALUES (${id}, ${program}, ${date}, ${JSON.stringify(rest)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        logged_by = EXCLUDED.logged_by,
        entry_date = EXCLUDED.entry_date,
        data = EXCLUDED.data
    `;
    entries++;
  }

  const [{ count }] =
    await sql`SELECT count(*)::int AS count FROM workout_entries`;
  return NextResponse.json({
    ok: true,
    programsSeeded: 2,
    entriesUpserted: entries,
    totalEntriesInDb: count,
  });
}
