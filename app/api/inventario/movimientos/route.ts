import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const ingredienteId = searchParams.get("ingrediente_id")
  const limit = parseInt(searchParams.get("limit") || "50")

  let query = `
    SELECT m.*, i.nombre as ingrediente_nombre, u.abreviatura as unidad
    FROM movimientos_inventario m
    JOIN ingredientes i ON m.ingrediente_id = i.id
    JOIN unidades u ON i.unidad_id = u.id
  `
  const params: (string | number)[] = []
  if (ingredienteId) {
    query += " WHERE m.ingrediente_id = ?"
    params.push(ingredienteId)
  }
  query += " ORDER BY m.created_at DESC LIMIT ?"
  params.push(limit)

  const movimientos = db.prepare(query).all(...params)
  return NextResponse.json(movimientos)
}

export async function POST(request: Request) {
  const db = getDb()
  const body = await request.json()
  const { ingrediente_id, tipo, cantidad, costo_unitario, motivo } = body

  if (!ingrediente_id || !tipo || cantidad == null) {
    return NextResponse.json({ error: "Campos requeridos: ingrediente_id, tipo, cantidad" }, { status: 400 })
  }

  const ajuste = tipo === "entrada" ? cantidad : -Math.abs(cantidad)

  const mov = db.transaction(() => {
    db.prepare(`
      UPDATE ingredientes
      SET stock_actual = stock_actual + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(ajuste, ingrediente_id)

    return db.prepare(`
      INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, costo_unitario, motivo)
      VALUES (?, ?, ?, ?, ?)
    `).run(ingrediente_id, tipo, cantidad, costo_unitario || null, motivo || null)
  })()

  return NextResponse.json({ success: true, id: mov.lastInsertRowid }, { status: 201 })
}
