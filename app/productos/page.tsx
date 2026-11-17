import { ERPLayout } from "@/components/erp/erp-layout"
import { requireRole } from "@/lib/auth"
import { apiGet, contarAlertas } from "@/lib/api"
import { Badge } from "@/components/ui/badge"

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
}

type ProductoRow = {
  id: number
  nombre: string
  descripcion: string | null
  precio_venta: number
  costo_receta: number
  categoria_nombre: string
  receta_id: number | null
  disponible: number
}

export default async function ProductosPage() {
  const session = await requireRole("admin")

  const [alertas, productos] = await Promise.all([
    contarAlertas(),
    apiGet<ProductoRow[]>("/api/productos?full=1"),
  ])

  const categorias = [...new Set(productos.map((p) => p.categoria_nombre))]

  return (
    <ERPLayout alertasCount={alertas} userName={session.nombre}>
      <div className="p-4 lg:p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">Productos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {productos.length} productos activos
          </p>
        </div>

        {categorias.map((cat) => {
          const prods = productos.filter((p) => p.categoria_nombre === cat)
          return (
            <div key={cat} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">{cat}</h2>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Producto</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Precio venta</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Costo receta</th>
                      <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Margen</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Receta</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prods.map((p) => {
                      const margen = p.precio_venta > 0 && p.costo_receta > 0
                        ? ((p.precio_venta - p.costo_receta) / p.precio_venta) * 100
                        : null
                      return (
                        <tr key={p.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{p.nombre}</p>
                            {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-foreground">{formatCOP(p.precio_venta)}</td>
                          <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                            {p.costo_receta > 0 ? formatCOP(p.costo_receta) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {margen !== null ? (
                              <span className={margen >= 60 ? "text-emerald-400 font-semibold" : margen >= 40 ? "text-amber-400" : "text-destructive"}>
                                {margen.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.receta_id ? (
                              <Badge variant="outline" className="text-xs border-emerald-400/30 text-emerald-400">Sí</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">No</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {p.disponible ? (
                              <Badge variant="outline" className="text-xs border-emerald-400/30 text-emerald-400">Disponible</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground">No disponible</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </ERPLayout>
  )
}
