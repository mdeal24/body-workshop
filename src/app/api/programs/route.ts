import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getDb();
  const rows = await sql`SELECT id, label, data FROM programs ORDER BY id`;
  return NextResponse.json(rows);
}
