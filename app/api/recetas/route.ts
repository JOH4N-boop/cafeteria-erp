import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  const db = getDb()

  const recetas = db.prepare(`
    SELECT r.*, p.nombre as producto_nombre, p.precio_venta, p.categoria_id,
           c.nombre as categoria_nombre
    FROM recetas r
    JOIN productos p ON r.producto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    ORDER BY p.nombre
  `).all()

  const result = (recetas as Record<string, unknown>[]).map((rec) => {
    const ingredientes = db.prepare(`
      SELECT ri.*, i.nombre as ingrediente_nombre, u.abreviatura as unidad,
             (ri.cantidad * i.costo_unitario * (1 + ri.merma_porcentaje / 100.0)) as costo_linea
      FROM receta_ingredientes ri
      JOIN ingredientes i ON ri.ingrediente_id = i.id
      JOIN unidades u ON i.unidad_id = u.id
      WHERE ri.receta_id = ?
    `).all(rec.id)

    const costo_total = (ingredientes as Array<{ costo_linea: number }>).reduce((sum, i) => sum + (i.costo_linea || 0), 0)
    const precio_venta = rec.precio_venta as number
    const margen = precio_venta > 0 ? ((precio_venta - costo_total) / precio_venta) * 100 : 0

    return { ...rec, ingredientes, costo_total, margen }
  })

  return NextResponse.json(result)
}

export async function POST(request: Request) {
  const db = getDb()
  const body = await request.json()
  const { producto_id, instrucciones, porciones, ingredientes } = body

  if (!producto_id) {
    return NextResponse.json({ error: "producto_id es requerido" }, { status: 400 })
  }

  const result = db.transaction(() => {
    // Eliminar receta existente si hay
    const existing = db.prepare("SELECT id FROM recetas WHERE producto_id = ?").get(producto_id) as { id: number } | undefined
    if (existing) {
      db.prepare("DELETE FROM receta_ingredientes WHERE receta_id = ?").run(existing.id)
      db.prepare("DELETE FROM recetas WHERE id = ?").run(existing.id)
    }

    const receta = db.prepare(`
      INSERT INTO recetas (producto_id, instrucciones, porciones)
      VALUES (?, ?, ?)
    `).run(producto_id, instrucciones || null, porciones || 1)

    const recetaId = receta.lastInsertRowid

    if (ingredientes && Array.isArray(ingredientes)) {
      const insertRI = db.prepare(`
        INSERT INTO receta_ingredientes (receta_id, ingrediente_id, cantidad, merma_porcentaje)
        VALUES (?, ?, ?, ?)
      `)
      for (const ing of ingredientes) {
        insertRI.run(recetaId, ing.ingrediente_id, ing.cantidad, ing.merma_porcentaje || 0)
      }

      // Recalcular costo de producto
      const costoResult = db.prepare(`
        SELECT SUM(ri.cantidad * i.costo_unitario * (1 + ri.merma_porcentaje / 100.0)) as costo
        FROM receta_ingredientes ri
        JOIN ingredientes i ON ri.ingrediente_id = i.id
        WHERE ri.receta_id = ?
      `).get(recetaId) as { costo: number }

      db.prepare("UPDATE productos SET costo_receta = ? WHERE id = ?").run(costoResult.costo || 0, producto_id)
    }

    return recetaId
  })()

  return NextResponse.json({ success: true, id: result }, { status: 201 })
}
