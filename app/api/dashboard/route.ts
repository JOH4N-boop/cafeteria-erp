import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET() {
  const db = getDb()

  // KPIs del día
  const hoy = new Date().toISOString().split("T")[0]
  const ayer = new Date(Date.now() - 86400000).toISOString().split("T")[0]

  const ventasHoy = db.prepare(`
    SELECT COUNT(*) as pedidos, COALESCE(SUM(total),0) as total
    FROM pedidos WHERE estado = 'entregado' AND date(created_at) = ?
  `).get(hoy) as { pedidos: number; total: number }

  const ventasAyer = db.prepare(`
    SELECT COUNT(*) as pedidos, COALESCE(SUM(total),0) as total
    FROM pedidos WHERE estado = 'entregado' AND date(created_at) = ?
  `).get(ayer) as { pedidos: number; total: number }

  // Ventas últimos 30 días por día
  const ventasDiarias = db.prepare(`
    SELECT date(created_at) as fecha,
           COUNT(*) as pedidos,
           COALESCE(SUM(total),0) as total
    FROM pedidos
    WHERE estado = 'entregado'
      AND created_at >= datetime('now', '-30 days')
    GROUP BY date(created_at)
    ORDER BY fecha
  `).all()

  // Productos más vendidos
  const topProductos = db.prepare(`
    SELECT p.nombre, SUM(pd.cantidad) as unidades, SUM(pd.subtotal) as revenue
    FROM pedidos_detalle pd
    JOIN productos p ON pd.producto_id = p.id
    JOIN pedidos pe ON pd.pedido_id = pe.id
    WHERE pe.estado = 'entregado'
      AND pe.created_at >= datetime('now', '-30 days')
    GROUP BY pd.producto_id
    ORDER BY unidades DESC
    LIMIT 8
  `).all()

  // Ventas por categoría
  const ventasCategorias = db.prepare(`
    SELECT c.nombre as categoria, SUM(pd.subtotal) as total
    FROM pedidos_detalle pd
    JOIN productos p ON pd.producto_id = p.id
    JOIN categorias c ON p.categoria_id = c.id
    JOIN pedidos pe ON pd.pedido_id = pe.id
    WHERE pe.estado = 'entregado'
      AND pe.created_at >= datetime('now', '-30 days')
    GROUP BY c.id
    ORDER BY total DESC
  `).all()

  // Alertas de stock bajo
  const alertasStock = db.prepare(`
    SELECT i.nombre, i.stock_actual, i.stock_minimo, u.abreviatura
    FROM ingredientes i
    JOIN unidades u ON i.unidad_id = u.id
    WHERE i.activo = 1 AND i.stock_actual <= i.stock_minimo
    ORDER BY (i.stock_actual / NULLIF(i.stock_minimo,0))
  `).all()

  // Pedidos pendientes
  const pedidosPendientes = db.prepare(`
    SELECT COUNT(*) as c FROM pedidos WHERE estado IN ('pendiente','en_preparacion')
  `).get() as { c: number }

  // Costo vs revenue últimos 7 días
  const costoVsRevenue = db.prepare(`
    SELECT date(pe.created_at) as fecha,
           COALESCE(SUM(pe.total),0) as revenue,
           COALESCE(SUM(p.costo_receta * pd.cantidad),0) as costo
    FROM pedidos pe
    JOIN pedidos_detalle pd ON pd.pedido_id = pe.id
    JOIN productos p ON pd.producto_id = p.id
    WHERE pe.estado = 'entregado'
      AND pe.created_at >= datetime('now', '-7 days')
    GROUP BY date(pe.created_at)
    ORDER BY fecha
  `).all()

  // Total ingredientes / valor inventario
  const valorInventario = db.prepare(`
    SELECT COALESCE(SUM(stock_actual * costo_unitario),0) as valor,
           COUNT(*) as total
    FROM ingredientes WHERE activo=1
  `).get() as { valor: number; total: number }

  return NextResponse.json({
    kpis: {
      ventasHoy: ventasHoy.total,
      pedidosHoy: ventasHoy.pedidos,
      ventasAyer: ventasAyer.total,
      pedidosAyer: ventasAyer.pedidos,
      pedidosPendientes: pedidosPendientes.c,
      alertasStock: (alertasStock as unknown[]).length,
      valorInventario: valorInventario.valor,
      totalIngredientes: valorInventario.total,
    },
    ventasDiarias,
    topProductos,
    ventasCategorias,
    alertasStock,
    costoVsRevenue,
  })
}
