"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts"
import { DollarSign, ShoppingBag, TrendingUp, Percent, Package, BarChart2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { KpiCard } from "./kpi-card"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(value)
}

const TIPO_LABELS: Record<string, string> = {
  local: "Mesa / Local",
  para_llevar: "Para llevar",
  delivery: "Delivery",
}

interface Resumen {
  total_pedidos: number
  pedidos_completados: number
  pedidos_cancelados: number
  revenue_total: number
  ticket_promedio: number
  descuentos_total: number
  costo_total: number
  ganancia_bruta: number
  margen_bruto: number
}

interface Producto {
  nombre: string
  categoria: string
  unidades: number
  revenue: number
  costo: number
  ganancia: number
  margen: number
}

export function ReportesContent() {
  const [periodo, setPeriodo] = useState("30")
  const { data, isLoading } = useSWR(`/api/reportes?periodo=${periodo}`, fetcher)

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const { resumen, rentabilidadProductos, ventasTipo, movimientos } = data as {
    resumen: Resumen
    rentabilidadProductos: Producto[]
    ventasTipo: Array<{ tipo: string; pedidos: number; revenue: number }>
    movimientos: Array<{ tipo: string; ingrediente_nombre: string; cantidad: number; unidad: string; motivo: string; created_at: string }>
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reportes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Análisis de ventas, costos y rentabilidad</p>
        </div>
        <Select value={periodo} onValueChange={(value) => setPeriodo(value ?? "30")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 días</SelectItem>
            <SelectItem value="14">Últimos 14 días</SelectItem>
            <SelectItem value="30">Últimos 30 días</SelectItem>
            <SelectItem value="90">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Revenue total"
          value={formatCOP(resumen.revenue_total)}
          subvalue={`${resumen.pedidos_completados} pedidos entregados`}
          icon={DollarSign}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
        />
        <KpiCard
          label="Ganancia bruta"
          value={formatCOP(resumen.ganancia_bruta)}
          subvalue={`Costo: ${formatCOP(resumen.costo_total)}`}
          icon={TrendingUp}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-400/10"
        />
        <KpiCard
          label="Margen bruto"
          value={`${resumen.margen_bruto.toFixed(1)}%`}
          subvalue="Sobre revenue total"
          icon={Percent}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
        />
        <KpiCard
          label="Ticket promedio"
          value={formatCOP(resumen.ticket_promedio)}
          subvalue={`${resumen.total_pedidos} pedidos totales`}
          icon={ShoppingBag}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
      </div>

      {/* Rentabilidad por producto */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <p className="font-semibold text-foreground text-sm">Rentabilidad por producto</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={rentabilidadProductos.slice(0, 10)}
            layout="vertical"
            margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="category"
              dataKey="nombre"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={120}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.5rem",
                fontSize: "12px",
                color: "var(--color-foreground)",
              }}
              formatter={(value, name) => {
                const amount = typeof value === "number" ? value : Number(value ?? 0)
                return [
                  formatCOP(amount),
                  name === "ganancia" ? "Ganancia" : "Revenue",
                ]
              }}
            />
            <Bar dataKey="revenue" fill="var(--color-chart-2)" radius={[0, 3, 3, 0]} name="revenue" />
            <Bar dataKey="ganancia" fill="var(--color-chart-3)" radius={[0, 3, 3, 0]} name="ganancia" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalle tabla productos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="font-semibold text-foreground text-sm">Detalle por producto</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Producto</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Unidades</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Revenue</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Ganancia</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Margen</th>
                </tr>
              </thead>
              <tbody>
                {rentabilidadProductos.map((p, i) => (
                  <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{p.nombre}</p>
                      <p className="text-muted-foreground">{p.categoria}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{p.unidades}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{formatCOP(p.revenue)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-400">{formatCOP(p.ganancia)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <span className={cn(
                        "font-semibold",
                        p.margen >= 60 ? "text-emerald-400" : p.margen >= 40 ? "text-amber-400" : "text-destructive"
                      )}>
                        {p.margen.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel lateral */}
        <div className="space-y-4">
          {/* Ventas por tipo */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="font-semibold text-foreground text-sm mb-3">Por tipo de pedido</p>
            <div className="space-y-2">
              {ventasTipo.map((v, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{TIPO_LABELS[v.tipo] || v.tipo}</span>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCOP(v.revenue)}</p>
                    <p className="text-xs text-muted-foreground">{v.pedidos} pedidos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Movimientos recientes */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-foreground text-sm">Movimientos recientes</p>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {movimientos.slice(0, 10).map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] shrink-0",
                      m.tipo === "entrada" ? "border-emerald-400/30 text-emerald-400" :
                      m.tipo === "salida" ? "border-destructive/30 text-destructive" :
                      m.tipo === "merma" ? "border-amber-400/30 text-amber-400" :
                      "border-blue-400/30 text-blue-400"
                    )}
                  >
                    {m.tipo}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{m.ingrediente_nombre}</p>
                    <p className="text-xs text-muted-foreground">{m.cantidad} {m.unidad}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
