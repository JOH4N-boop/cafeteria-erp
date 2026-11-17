import { ERPLayout } from "@/components/erp/erp-layout"
import { DashboardContent } from "@/components/erp/dashboard-content"
import { requireRole } from "@/lib/auth"
import { contarAlertas } from "@/lib/api"

export default async function HomePage() {
  const session = await requireRole("admin")
  const alertas = await contarAlertas()

  return (
    <ERPLayout alertasCount={alertas} userName={session.nombre}>
      <DashboardContent />
    </ERPLayout>
  )
}
