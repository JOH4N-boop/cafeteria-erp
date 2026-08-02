import { NextResponse } from "next/server"
import { getDb, descontarInventarioPorPedido } from "@/lib/db"

// GET /api/pedidos?activos=true  → pedidos con su detalle
// Por defecto devuelve los pedidos "abiertos" (no entregados/cancelados).
export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const todos = searchParams.get("todos") === "true"

  const where = todos
    ? ""
    : "WHERE p.estado IN ('pendiente','en_preparacion','listo')"

  const pedidos = db.prepare(`
    SELECT p.*,
           (SELECT COUNT(*) FROM facturas f WHERE f.pedido_id = p.id) as facturado
    FROM pedidos p
    ${where}
    ORDER BY p.created_at DESC
    LIMIT 100
  `).all() as Record<string, unknown>[]

  const result = pedidos.map((ped) => {
    const items = db.prepare(`
      SELECT pd.*, pr.nombre as producto_nombre
      FROM pedidos_detalle pd
      JOIN productos pr ON pd.producto_id = pr.id
      WHERE pd.pedido_id = ?
    `).all(ped.id)
    return { ...ped, items }
  })

  return NextResponse.json(result)
}

// POST /api/pedidos  → crea un pedido nuevo
// body: { tipo, mesa, descuento, notas, items: [{ producto_id, cantidad, notas }] }
export async function POST(request: Request) {
  const db = getDb()
  const body = await request.json()
  const { tipo = "local", mesa = null, descuento = 0, notas = null, items } = body

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "El pedido debe tener al menos un producto" }, { status: 400 })
  }

  const result = db.transaction(() => {
    // Número correlativo: P-#####
    const last = db.prepare("SELECT numero FROM pedidos ORDER BY id DESC LIMIT 1").get() as { numero: string } | undefined
    const lastNum = last ? parseInt(last.numero.replace(/\D/g, ""), 10) : 1000
    const numero = `P-${String(lastNum + 1).padStart(5, "0")}`

    // Precios reales desde la tabla de productos (no confiamos en el cliente)
    const getProducto = db.prepare("SELECT precio_venta FROM productos WHERE id = ?")
    let subtotal = 0
    const lineas: Array<{ producto_id: number; cantidad: number; precio: number; notas: string | null }> = []

    for (const it of items) {
      const prod = getProducto.get(it.producto_id) as { precio_venta: number } | undefined
      if (!prod) continue
      const cantidad = Math.max(1, Number(it.cantidad) || 1)
      const precio = prod.precio_venta
      subtotal += precio * cantidad
      lineas.push({ producto_id: it.producto_id, cantidad, precio, notas: it.notas || null })
    }

    const desc = Math.max(0, Number(descuento) || 0)
    const total = Math.max(0, subtotal - desc)

    const res = db.prepare(`
      INSERT INTO pedidos (numero, estado, tipo, mesa, subtotal, descuento, total, notas)
      VALUES (?, 'pendiente', ?, ?, ?, ?, ?, ?)
    `).run(numero, tipo, mesa, subtotal, desc, total, notas)

    const pedidoId = res.lastInsertRowid
    const insertPD = db.prepare(`
      INSERT INTO pedidos_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const l of lineas) {
      insertPD.run(pedidoId, l.producto_id, l.cantidad, l.precio, l.precio * l.cantidad, l.notas)
    }

    // Descuenta del inventario los ingredientes que consumen las recetas de este pedido
    descontarInventarioPorPedido(db, Number(pedidoId), `Venta pedido ${numero}`)

    return { id: pedidoId, numero, total }
  })()

  return NextResponse.json({ success: true, ...result }, { status: 201 })
}
