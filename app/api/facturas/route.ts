import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

const IVA = 0.08 // Impoconsumo típico de restaurantes/cafeterías en Colombia (8%)

// GET /api/facturas  → últimas facturas emitidas
export async function GET() {
  const db = getDb()
  const facturas = db.prepare(`
    SELECT f.*, p.numero as pedido_numero, p.mesa, p.tipo
    FROM facturas f
    JOIN pedidos p ON f.pedido_id = p.id
    ORDER BY f.created_at DESC
    LIMIT 50
  `).all()
  return NextResponse.json(facturas)
}

// POST /api/facturas  → genera factura de un pedido y lo cierra (entregado)
// body: { pedido_id, cliente, metodo_pago }
export async function POST(request: Request) {
  const db = getDb()
  const body = await request.json()
  const { pedido_id, cliente = null, metodo_pago = "efectivo" } = body

  if (!pedido_id) {
    return NextResponse.json({ error: "pedido_id es requerido" }, { status: 400 })
  }

  const result = db.transaction(() => {
    const pedido = db.prepare("SELECT * FROM pedidos WHERE id = ?").get(pedido_id) as
      | { id: number; subtotal: number; descuento: number; estado: string }
      | undefined

    if (!pedido) throw new Error("PEDIDO_NO_ENCONTRADO")

    const existente = db.prepare("SELECT id, numero FROM facturas WHERE pedido_id = ?").get(pedido_id) as
      | { id: number; numero: string }
      | undefined
    if (existente) return { id: existente.id, numero: existente.numero, yaFacturado: true }

    const last = db.prepare("SELECT numero FROM facturas ORDER BY id DESC LIMIT 1").get() as
      | { numero: string }
      | undefined
    const lastNum = last ? parseInt(last.numero.replace(/\D/g, ""), 10) : 0
    const numero = `FAC-${String(lastNum + 1).padStart(5, "0")}`

    const base = pedido.subtotal - pedido.descuento
    const impuesto = Math.round(base * IVA)
    const total = base + impuesto

    const res = db.prepare(`
      INSERT INTO facturas (numero, pedido_id, cliente, subtotal, descuento, impuesto, total, metodo_pago)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(numero, pedido_id, cliente, pedido.subtotal, pedido.descuento, impuesto, total, metodo_pago)

    // Cerrar el pedido
    db.prepare("UPDATE pedidos SET estado = 'entregado', updated_at = datetime('now') WHERE id = ?").run(pedido_id)

    return { id: res.lastInsertRowid, numero, total, impuesto }
  })

  try {
    return NextResponse.json({ success: true, ...result() }, { status: 201 })
  } catch (e) {
    if (e instanceof Error && e.message === "PEDIDO_NO_ENCONTRADO") {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })
    }
    throw e
  }
}
