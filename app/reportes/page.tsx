import { ERPLayout } from "@/components/erp/erp-layout"
import { ReportesContent } from "@/components/erp/reportes-content"
import { requireRole } from "@/lib/auth"
import { contarAlertas } from "@/lib/api"

export default async function ReportesPage() {
  const session = await requireRole("admin")
  const alertas = await contarAlertas()

  return (
    <ERPLayout alertasCount={alertas} userName={session.nombre}>
      <ReportesContent />
    </ERPLayout>
  )
}
