import { ERPLayout } from "@/components/erp/erp-layout"
import { InventarioContent } from "@/components/erp/inventario-content"
import { requireRole } from "@/lib/auth"
import { contarAlertas } from "@/lib/api"

export default async function InventarioPage() {
  const session = await requireRole("admin")
  const alertas = await contarAlertas()

  return (
    <ERPLayout alertasCount={alertas} userName={session.nombre}>
      <InventarioContent />
    </ERPLayout>
  )
}
