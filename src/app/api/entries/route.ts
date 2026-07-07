import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sql = getDb();
  const loggedBy = req.nextUrl.searchParams.get("logged_by");
  const exercise = req.nextUrl.searchParams.get("exercise");

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
