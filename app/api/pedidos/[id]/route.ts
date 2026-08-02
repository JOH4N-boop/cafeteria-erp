import { NextResponse } from "next/server"
import { getDb, reponerInventarioPorPedido } from "@/lib/db"

const ESTADOS_VALIDOS = ["pendiente", "en_preparacion", "listo", "entregado", "cancelado"]

// PATCH /api/pedidos/[id]  → actualiza estado del pedido
// body: { estado }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const body = await request.json()
  const { estado } = body

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
  }

  const pedido = db.prepare("SELECT id FROM pedidos WHERE id = ?").get(id)
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })

  db.prepare("UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?").run(estado, id)
  return NextResponse.json({ success: true })
}

// DELETE /api/pedidos/[id]  → cancela el pedido y repone el inventario descontado
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const pedido = db.prepare("SELECT id, numero, estado FROM pedidos WHERE id = ?").get(id) as
    | { id: number; numero: string; estado: string }
    | undefined
  if (!pedido) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 })

  // Idempotente: si ya estaba cancelado, no repetir la reposición de inventario
  if (pedido.estado !== "cancelado") {
    db.transaction(() => {
      db.prepare("UPDATE pedidos SET estado = 'cancelado', updated_at = datetime('now') WHERE id = ?").run(pedido.id)
      reponerInventarioPorPedido(db, pedido.id, `Cancelación pedido ${pedido.numero}`)
    })()
  }

  return NextResponse.json({ success: true })
}
