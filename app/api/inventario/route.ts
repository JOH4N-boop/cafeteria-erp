import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const search = searchParams.get("search") || ""
  const alertas = searchParams.get("alertas") === "true"

  let query = `
    SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev,
           (i.stock_actual <= i.stock_minimo) as bajo_stock
    FROM ingredientes i
    JOIN unidades u ON i.unidad_id = u.id
    WHERE i.activo = 1
  `
  const params: string[] = []

  if (search) {
    query += " AND i.nombre LIKE ?"
    params.push(`%${search}%`)
  }
  if (alertas) {
    query += " AND i.stock_actual <= i.stock_minimo"
  }

  query += " ORDER BY i.nombre"

  const ingredientes = db.prepare(query).all(...params)
  return NextResponse.json(ingredientes)
}

export async function POST(request: Request) {
  const db = getDb()
  const body = await request.json()
  const { nombre, descripcion, unidad_id, stock_minimo, costo_unitario } = body

  if (!nombre || !unidad_id) {
    return NextResponse.json({ error: "Nombre y unidad son requeridos" }, { status: 400 })
  }

  const stmt = db.prepare(`
    INSERT INTO ingredientes (nombre, descripcion, unidad_id, stock_minimo, costo_unitario)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(nombre, descripcion || null, unidad_id, stock_minimo || 0, costo_unitario || 0)

  const nuevo = db.prepare("SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id WHERE i.id = ?").get(result.lastInsertRowid)
  return NextResponse.json(nuevo, { status: 201 })
}
