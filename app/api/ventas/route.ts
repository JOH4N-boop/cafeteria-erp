import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

// GET /api/ventas  → historial de ventas (facturas) con el detalle de cada pedido
export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() || ""

  let query = `
    SELECT f.*, p.numero as pedido_numero, p.mesa, p.tipo
    FROM facturas f
    JOIN pedidos p ON f.pedido_id = p.id
  `
  const params: string[] = []

  if (q) {
    query += ` WHERE f.numero LIKE ? OR p.numero LIKE ? OR f.cliente LIKE ?`
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }

  query += ` ORDER BY f.created_at DESC LIMIT 200`

  const facturas = db.prepare(query).all(...params) as Record<string, unknown>[]

  const result = facturas.map((fac) => {
    const items = db.prepare(`
      SELECT pd.cantidad, pd.precio_unitario, pd.subtotal, pd.notas, pr.nombre as producto_nombre
      FROM pedidos_detalle pd
      JOIN productos pr ON pd.producto_id = pr.id
      WHERE pd.pedido_id = ?
      ORDER BY pd.id
    `).all(fac.pedido_id)
    return { ...fac, items }
  })

  return NextResponse.json(result)
}
