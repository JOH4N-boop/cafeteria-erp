"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Receipt, Search, RefreshCw, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
}

function formatFecha(iso: string) {
  const d = new Date(iso + (iso.includes("Z") ? "" : "Z"))
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

const TIPO_LABEL: Record<string, string> = {
  local: "En mesa",
  para_llevar: "Para llevar",
  delivery: "Domicilio",
}

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  nequi: "Nequi",
  daviplata: "Daviplata",
}

interface VentaItem {
  cantidad: number
  precio_unitario: number
  subtotal: number
  notas: string | null
  producto_nombre: string
}

interface Venta {
  id: number
  numero: string
  pedido_id: number
  pedido_numero: string
  mesa: string | null
  tipo: string
  cliente: string | null
  subtotal: number
  descuento: number
  impuesto: number
  total: number
  metodo_pago: string
  created_at: string
  items: VentaItem[]
}

export function VentasContent() {
  const [q, setQ] = useState("")
  const { data: ventas = [], isLoading, mutate } = useSWR<Venta[]>(
    `/api/ventas${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    fetcher
  )
  const [detalle, setDetalle] = useState<Venta | null>(null)

  const totalPeriodo = useMemo(() => ventas.reduce((s, v) => s + v.total, 0), [ventas])

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Historial de Ventas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ventas.length} factura{ventas.length !== 1 ? "s" : ""} · {formatCOP(totalPeriodo)} en total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por factura, pedido o cliente..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <button
            onClick={() => mutate()}
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabla de ventas */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Cargando ventas...</div>
        ) : ventas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Receipt className="w-9 h-9 mb-2 opacity-30" />
            <p className="text-sm">No hay ventas registradas</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Factura</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Fecha</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Origen</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Pago</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Total</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id} className="border-b border-border/50 last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{v.numero}</p>
                    <p className="text-xs text-muted-foreground">Pedido {v.pedido_numero}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatFecha(v.created_at)}</td>
                  <td className="px-4 py-3 text-foreground">{v.cliente || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {v.tipo === "local" ? `Mesa ${v.mesa}` : TIPO_LABEL[v.tipo] || v.tipo}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {METODO_LABEL[v.metodo_pago] || v.metodo_pago}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">{formatCOP(v.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setDetalle(v)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de detalle */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-md">
          {detalle && (
            <div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Factura {detalle.numero}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Fecha</p>
                    <p className="text-foreground">{formatFecha(detalle.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="text-foreground">{detalle.cliente || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Origen</p>
                    <p className="text-foreground">
                      {detalle.tipo === "local" ? `Mesa ${detalle.mesa}` : TIPO_LABEL[detalle.tipo] || detalle.tipo}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Método de pago</p>
                    <p className="text-foreground">{METODO_LABEL[detalle.metodo_pago] || detalle.metodo_pago}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border divide-y divide-border/60">
                  {detalle.items.map((it, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between text-sm">
                      <div>
                        <span className="text-foreground">
                          <span className="text-muted-foreground font-medium">{it.cantidad}×</span> {it.producto_nombre}
                        </span>
                        {it.notas && <p className="text-xs text-muted-foreground italic">{it.notas}</p>}
                      </div>
                      <span className="text-foreground tabular-nums">{formatCOP(it.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-sm border-t border-border pt-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCOP(detalle.subtotal)}</span>
                  </div>
                  {detalle.descuento > 0 && (
                    <div className="flex justify-between text-emerald-500">
                      <span>Descuento</span>
                      <span className="tabular-nums">−{formatCOP(detalle.descuento)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Impoconsumo</span>
                    <span className="tabular-nums">{formatCOP(detalle.impuesto)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/60">
                    <span>Total</span>
                    <span className="tabular-nums text-primary">{formatCOP(detalle.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
