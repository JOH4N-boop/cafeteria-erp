import { ERPLayout } from "@/components/erp/erp-layout"
import { VentasContent } from "@/components/erp/ventas-content"
import { requireRole } from "@/lib/auth"
import { contarAlertas } from "@/lib/api"

export const metadata = {
  title: "Historial de Ventas — Grano & Aroma",
}

export default async function VentasPage() {
  const session = await requireRole("admin")
  const alertas = await contarAlertas()

  return (
    <ERPLayout alertasCount={alertas} userName={session.nombre}>
      <VentasContent />
    </ERPLayout>
  )
}
