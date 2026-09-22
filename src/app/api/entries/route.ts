import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { noDb, seedEntries } from "@/lib/dev-seed";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const loggedBy = req.nextUrl.searchParams.get("logged_by");
  const exercise = req.nextUrl.searchParams.get("exercise");
  if (noDb()) {
    const rows = seedEntries().filter(
      (r) =>
        (!loggedBy || r.logged_by === loggedBy) &&
        (!exercise || r.data.exercise === exercise)
    );
    return NextResponse.json(rows.slice(0, 500));
  }
  const sql = getDb();

  const rows = await sql`
    SELECT id, logged_by, entry_date::text AS entry_date, data, created_at
    FROM workout_entries
    WHERE (${loggedBy}::text IS NULL OR logged_by = ${loggedBy})
      AND (${exercise}::text IS NULL OR data->>'exercise' = ${exercise})
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 500
  `;
  return NextResponse.json(rows);
}

export async function DELETE(req: NextRequest) {
  const sql = getDb();
  const id = req.nextUrl.searchParams.get("id");
  const loggedBy = req.nextUrl.searchParams.get("logged_by");
  const date = req.nextUrl.searchParams.get("date");
  if (id) {
    const rows = await sql`DELETE FROM workout_entries WHERE id = ${id} RETURNING id`;
    return NextResponse.json({ ok: true, deleted: rows.length });
  }
  if (loggedBy && date) {
    const rows = await sql`
      DELETE FROM workout_entries
      WHERE logged_by = ${loggedBy} AND entry_date = ${date}
      RETURNING id
    `;
    return NextResponse.json({ ok: true, deleted: rows.length });
  }
  return NextResponse.json(
    { error: "provide id, or logged_by and date" },
    { status: 400 }
  );
}

export async function POST(req: NextRequest) {
  const sql = getDb();
  const body = await req.json();
  const { loggedBy, entryDate, data } = body ?? {};
  if (!loggedBy || !entryDate || !data?.exercise) {
    return NextResponse.json(
      { error: "loggedBy, entryDate and data.exercise are required" },
      { status: 400 }
    );
  }
  const id = crypto.randomUUID();
  await sql`
    INSERT INTO workout_entries (id, logged_by, entry_date, data)
    VALUES (${id}, ${loggedBy}, ${entryDate}, ${JSON.stringify(data)}::jsonb)
  `;
  return NextResponse.json({ ok: true, id });
}
