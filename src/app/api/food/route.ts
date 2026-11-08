import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { noDb } from "@/lib/dev-seed";

export const dynamic = "force-dynamic";

/**
 * Calorie log. Kept in its own table, apart from workout_entries, so food rows never
 * show up in training history, set counts or the progression review.
 *
 * The table is created on first use, so deploying this needs no re-seed — re-seeding
 * would also rewrite both trainees' programs.
 */
let ready: Promise<unknown> | null = null;
function ensureTable() {
  const sql = getDb();
  ready ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS food_entries (
        id TEXT PRIMARY KEY,
        logged_by TEXT NOT NULL,
        entry_date DATE NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_food_logged_by ON food_entries (logged_by, entry_date)`;
  })().catch((e) => {
    ready = null; // let the next request retry
    throw e;
  });
  return ready;
}

const TRAINEES = new Set(["male", "female"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NO_DB = { error: "No database configured — food logging needs DATABASE_URL." };

/** GET ?logged_by=male&date=YYYY-MM-DD → that day's entries, oldest first. */
export async function GET(req: NextRequest) {
  const loggedBy = req.nextUrl.searchParams.get("logged_by");
  const date = req.nextUrl.searchParams.get("date");
  if (!loggedBy || !TRAINEES.has(loggedBy) || !date || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "logged_by and date are required" }, { status: 400 });
  }
  if (noDb()) return NextResponse.json([]);
  await ensureTable();
  const sql = getDb();
  const rows = await sql`
    SELECT id, logged_by, entry_date::text AS entry_date, data, created_at
    FROM food_entries
    WHERE logged_by = ${loggedBy} AND entry_date = ${date}
    ORDER BY created_at
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { loggedBy, entryDate, data } = body ?? {};
  const food = typeof data?.food === "string" ? data.food.trim().slice(0, 80) : "";
  const kcal = Number(data?.kcal);
  const protein = Number(data?.protein ?? 0);
  const servings = Number(data?.servings ?? 1);
  if (
    !TRAINEES.has(loggedBy) ||
    typeof entryDate !== "string" ||
    !DATE_RE.test(entryDate) ||
    !food ||
    !Number.isFinite(kcal) || kcal < 0 || kcal > 5000 ||
    !Number.isFinite(protein) || protein < 0 || protein > 500 ||
    !Number.isFinite(servings) || servings <= 0 || servings > 50
  ) {
    return NextResponse.json(
      { error: "loggedBy, entryDate, food and a valid kcal are required" },
      { status: 400 }
    );
  }
  if (noDb()) return NextResponse.json(NO_DB, { status: 503 });
  await ensureTable();
  const sql = getDb();
  const id = crypto.randomUUID();
  const clean = {
    food,
    kcal: Math.round(kcal),
    protein: Math.round(protein * 10) / 10,
    servings,
    ...(typeof data?.unit === "string" ? { unit: data.unit.slice(0, 20) } : {}),
  };
  await sql`
    INSERT INTO food_entries (id, logged_by, entry_date, data)
    VALUES (${id}, ${loggedBy}, ${entryDate}, ${JSON.stringify(clean)}::jsonb)
  `;
  return NextResponse.json({ ok: true, id });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (noDb()) return NextResponse.json(NO_DB, { status: 503 });
  await ensureTable();
  const sql = getDb();
  const rows = await sql`DELETE FROM food_entries WHERE id = ${id} RETURNING id`;
  return NextResponse.json({ ok: true, deleted: rows.length });
}
