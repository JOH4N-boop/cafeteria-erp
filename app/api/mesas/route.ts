import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  const db = getDb()
  const mesas = db.prepare("SELECT * FROM mesas WHERE activa = 1 ORDER BY numero").all()
  return NextResponse.json(mesas)
}
