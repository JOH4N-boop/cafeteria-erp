import { PosTerminal } from "@/components/pos/pos-terminal"
import { requireRole } from "@/lib/auth"

export const metadata = {
  title: "Grano & Aroma — Terminal del Mesero",
}

export default async function MeseroPage() {
  const session = await requireRole("mesero", "admin")
  return <PosTerminal asesor={session.nombre} />
}
