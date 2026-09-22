import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { noDb, seedPrograms } from "@/lib/dev-seed";

export const dynamic = "force-dynamic";

export async function GET() {
  if (noDb()) return NextResponse.json(seedPrograms());
  const sql = getDb();
  const rows = await sql`SELECT id, label, data FROM programs ORDER BY id`;
  return NextResponse.json(rows);
}
