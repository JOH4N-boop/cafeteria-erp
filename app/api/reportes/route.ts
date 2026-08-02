import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const periodo = searchParams.get("periodo") || "30" // días

  const dias = parseInt(periodo)

  // Resumen del período
  const resumen = db.prepare(`
    SELECT
      COUNT(*) as total_pedidos,
      COUNT(CASE WHEN estado = 'entregado' THEN 1 END) as pedidos_completados,
      COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as pedidos_cancelados,
      COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total END), 0) as revenue_total,
      COALESCE(AVG(CASE WHEN estado = 'entregado' THEN total END), 0) as ticket_promedio,
      COALESCE(SUM(CASE WHEN estado = 'entregado' THEN descuento END), 0) as descuentos_total
    FROM pedidos
    WHERE created_at >= datetime('now', '-${dias} days')
  `).get() as Record<string, number>

  // Costo total del período
  const costoTotal = db.prepare(`
    SELECT COALESCE(SUM(p.costo_receta * pd.cantidad), 0) as costo
    FROM pedidos pe
    JOIN pedidos_detalle pd ON pd.pedido_id = pe.id
    JOIN productos p ON pd.producto_id = p.id
    WHERE pe.estado = 'entregado'
      AND pe.created_at >= datetime('now', '-${dias} days')
  `).get() as { costo: number }

  // Ventas por semana
  const ventasPorSemana = db.prepare(`
    SELECT
      strftime('%Y-W%W', created_at) as semana,
      COUNT(*) as pedidos,
      COALESCE(SUM(total), 0) as revenue
    FROM pedidos
    WHERE estado = 'entregado'
      AND created_at >= datetime('now', '-${dias} days')
    GROUP BY strftime('%Y-W%W', created_at)
    ORDER BY semana
  `).all()

  // Rentabilidad por producto
  const rentabilidadProductos = db.prepare(`
    SELECT
      p.nombre,
      c.nombre as categoria,
      SUM(pd.cantidad) as unidades,
      SUM(pd.subtotal) as revenue,
      SUM(p.costo_receta * pd.cantidad) as costo,
      SUM(pd.subtotal) - SUM(p.costo_receta * pd.cantidad) as ganancia,
      CASE WHEN SUM(pd.subtotal) > 0
        THEN (SUM(pd.subtotal) - SUM(p.costo_receta * pd.cantidad)) / SUM(pd.subtotal) * 100
        ELSE 0
      END as margen
    FROM pedidos_detalle pd
    JOIN productos p ON pd.producto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    JOIN pedidos pe ON pd.pedido_id = pe.id
    WHERE pe.estado = 'entregado'
      AND pe.created_at >= datetime('now', '-${dias} days')
    GROUP BY pd.producto_id
    ORDER BY ganancia DESC
  `).all()

  // Ventas por tipo
  const ventasTipo = db.prepare(`
    SELECT tipo, COUNT(*) as pedidos, COALESCE(SUM(total), 0) as revenue
    FROM pedidos
    WHERE estado = 'entregado'
      AND created_at >= datetime('now', '-${dias} days')
    GROUP BY tipo
  `).all()

  // Movimientos de inventario recientes
  const movimientos = db.prepare(`
    SELECT m.*, i.nombre as ingrediente_nombre, u.abreviatura as unidad
    FROM movimientos_inventario m
    JOIN ingredientes i ON m.ingrediente_id = i.id
    JOIN unidades u ON i.unidad_id = u.id
    WHERE m.created_at >= datetime('now', '-${dias} days')
    ORDER BY m.created_at DESC
    LIMIT 20
  `).all()

  return NextResponse.json({
    periodo: dias,
    resumen: {
      ...resumen,
      costo_total: costoTotal.costo,
      ganancia_bruta: resumen.revenue_total - costoTotal.costo,
      margen_bruto: resumen.revenue_total > 0
        ? ((resumen.revenue_total - costoTotal.costo) / resumen.revenue_total) * 100
        : 0,
    },
    ventasPorSemana,
    rentabilidadProductos,
    ventasTipo,
    movimientos,
  })
}
