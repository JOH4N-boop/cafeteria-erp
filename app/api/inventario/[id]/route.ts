import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const ingrediente = db.prepare(`
    SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev
    FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id
    WHERE i.id = ? AND i.activo = 1
  `).get(id)

  if (!ingrediente) return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  return NextResponse.json(ingrediente)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const body = await request.json()
  const { nombre, descripcion, unidad_id, stock_actual, stock_minimo, costo_unitario } = body

  db.prepare(`
    UPDATE ingredientes
    SET nombre=?, descripcion=?, unidad_id=?, stock_actual=?, stock_minimo=?, costo_unitario=?, updated_at=datetime('now')
    WHERE id=?
  `).run(nombre, descripcion || null, unidad_id, stock_actual, stock_minimo, costo_unitario, id)

  const updated = db.prepare(`
    SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev
    FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id WHERE i.id = ?
  `).get(id)
  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  db.prepare("UPDATE ingredientes SET activo = 0 WHERE id = ?").run(id)
  return NextResponse.json({ success: true })
}
