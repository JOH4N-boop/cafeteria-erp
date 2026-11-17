import { ERPLayout } from "@/components/erp/erp-layout"
import { RecetasContent } from "@/components/erp/recetas-content"
import { requireRole } from "@/lib/auth"
import { contarAlertas } from "@/lib/api"

export default async function RecetasPage() {
  const session = await requireRole("admin")
  const alertas = await contarAlertas()

  return (
    <ERPLayout alertasCount={alertas} userName={session.nombre}>
      <RecetasContent />
    </ERPLayout>
  )
}
