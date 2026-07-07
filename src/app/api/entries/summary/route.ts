import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Per-date, per-trainee set counts — powers the week strip + calendar dots. */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }
  const sql = getDb();
  const rows = await sql`
    SELECT entry_date::text AS entry_date, logged_by, count(*)::int AS n
    FROM workout_entries
    WHERE entry_date BETWEEN ${from} AND ${to}
    GROUP BY entry_date, logged_by
    ORDER BY entry_date
  `;
  return NextResponse.json(rows);
}
