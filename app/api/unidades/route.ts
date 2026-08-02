import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  const db = getDb()
  const unidades = db.prepare("SELECT * FROM unidades ORDER BY nombre").all()
  return NextResponse.json(unidades)
}
