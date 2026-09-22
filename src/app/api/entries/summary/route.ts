import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { noDb, seedEntries } from "@/lib/dev-seed";

export const dynamic = "force-dynamic";

/** Per-date, per-trainee set counts — powers the week strip + calendar dots. */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }
  if (noDb()) {
    const counts = new Map<string, number>();
    for (const r of seedEntries()) {
      if (r.entry_date < from || r.entry_date > to) continue;
      const key = `${r.entry_date}|${r.logged_by}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rows = Array.from(counts.entries())
      .map(([key, n]) => {
        const [entry_date, logged_by] = key.split("|");
        return { entry_date, logged_by, n };
      })
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    return NextResponse.json(rows);
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
