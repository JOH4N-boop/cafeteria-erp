import { ERPLayout } from "@/components/erp/erp-layout"
import { VentasContent } from "@/components/erp/ventas-content"
import { getDb } from "@/lib/db"
import { requireRole } from "@/lib/auth"

export const metadata = {
  title: "Historial de Ventas — Grano & Aroma",
}

export default async function VentasPage() {
  const session = await requireRole("admin")
  const db = getDb()
  const alertasStock = db.prepare(`
    SELECT COUNT(*) as c FROM ingredientes WHERE activo=1 AND stock_actual <= stock_minimo
  `).get() as { c: number }

  return (
    <ERPLayout alertasCount={alertasStock.c} userName={session.nombre}>
      <VentasContent />
    </ERPLayout>
  )
}
