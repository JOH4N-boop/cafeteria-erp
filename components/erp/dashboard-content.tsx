"use client"

import useSWR from "swr"
import {
  DollarSign,
  ShoppingBag,
  Package,
  AlertTriangle,
  TrendingUp,
  BarChart2,
} from "lucide-react"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { KpiCard } from "./kpi-card"
import { Badge } from "@/components/ui/badge"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
}

function formatLabel(fecha: string) {
  try {
    return format(parseISO(fecha), "d MMM", { locale: es })
  } catch {
    return fecha
  }
}

interface DashboardData {
  kpis: {
    ventasHoy: number
    pedidosHoy: number
    ventasAyer: number
    pedidosAyer: number
    pedidosPendientes: number
    alertasStock: number
    valorInventario: number
    totalIngredientes: number
  }
  ventasDiarias: Array<{ fecha: string; pedidos: number; total: number }>
  topProductos: Array<{ nombre: string; unidades: number; revenue: number }>
  ventasCategorias: Array<{ categoria: string; total: number }>
  alertasStock: Array<{ nombre: string; stock_actual: number; stock_minimo: number; abreviatura: string }>
  costoVsRevenue: Array<{ fecha: string; revenue: number; costo: number }>
}

export function DashboardContent() {
  const { data, isLoading } = useSWR<DashboardData>("/api/dashboard", fetcher, { refreshInterval: 30000 })

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-32 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl h-72 animate-pulse" />
          <div className="bg-card border border-border rounded-xl h-72 animate-pulse" />
        </div>
      </div>
    )
  }

  const { kpis, ventasDiarias, topProductos, ventasCategorias, alertasStock, costoVsRevenue } = data

  const trendVentas =
    kpis.ventasAyer > 0
      ? ((kpis.ventasHoy - kpis.ventasAyer) / kpis.ventasAyer) * 100
      : 0

  const trendPedidos =
    kpis.pedidosAyer > 0
      ? ((kpis.pedidosHoy - kpis.pedidosAyer) / kpis.pedidosAyer) * 100
      : 0

  const chartData = ventasDiarias.map((d) => ({
    ...d,
    fecha: formatLabel(d.fecha),
  }))

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Resumen del negocio — últimos 30 días
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ventas hoy"
          value={formatCOP(kpis.ventasHoy)}
          subvalue={`Ayer: ${formatCOP(kpis.ventasAyer)}`}
          trend={trendVentas}
          icon={DollarSign}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
        />
        <KpiCard
          label="Pedidos hoy"
          value={String(kpis.pedidosHoy)}
          subvalue={`${kpis.pedidosPendientes} pendientes`}
          trend={trendPedidos}
          icon={ShoppingBag}
          iconColor="text-blue-400"
          iconBg="bg-blue-400/10"
        />
        <KpiCard
          label="Valor inventario"
          value={formatCOP(kpis.valorInventario)}
          subvalue={`${kpis.totalIngredientes} ingredientes`}
          icon={Package}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-400/10"
        />
        <KpiCard
          label="Alertas de stock"
          value={String(kpis.alertasStock)}
          subvalue="ingredientes bajo mínimo"
          icon={AlertTriangle}
          iconColor={kpis.alertasStock > 0 ? "text-destructive" : "text-muted-foreground"}
          iconBg={kpis.alertasStock > 0 ? "bg-destructive/10" : "bg-muted"}
        />
      </div>

      {/* Gráficas fila 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ventas diarias */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-foreground text-sm">Ventas diarias</p>
              <p className="text-xs text-muted-foreground">Últimos 30 días</p>
            </div>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                  color: "var(--color-foreground)",
                }}
                formatter={(v: unknown) => [formatCOP(Number(v)), "Ventas"]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                fill="url(#colorVentas)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Ventas por categoría */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-foreground text-sm">Por categoría</p>
              <p className="text-xs text-muted-foreground">Últimos 30 días</p>
            </div>
            <BarChart2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={ventasCategorias}
                dataKey="total"
                nameKey="categoria"
                cx="50%"
                cy="45%"
                outerRadius={70}
                innerRadius={38}
                paddingAngle={3}
              >
                {ventasCategorias.map((_, index) => (
                  <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                  color: "var(--color-foreground)",
                }}
                formatter={(v: unknown) => [formatCOP(Number(v)), ""]}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px", color: "var(--color-muted-foreground)" }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráficas fila 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top productos */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-foreground text-sm">Productos más vendidos</p>
              <p className="text-xs text-muted-foreground">Por unidades — últimos 30 días</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topProductos} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={110}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                  color: "var(--color-foreground)",
                }}
                formatter={(v: unknown) => [Number(v), "unidades"]}
              />
              <Bar dataKey="unidades" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Alertas de stock */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-foreground text-sm">Alertas de stock</p>
              <p className="text-xs text-muted-foreground">Bajo el mínimo</p>
            </div>
            {alertasStock.length > 0 && (
              <Badge variant="destructive" className="text-xs">{alertasStock.length}</Badge>
            )}
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {alertasStock.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <Package className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs">Sin alertas activas</p>
              </div>
            ) : (
              alertasStock.slice(0, 6).map((alerta, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-destructive/5 border border-destructive/10">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{alerta.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {alerta.stock_actual} / {alerta.stock_minimo} {alerta.abreviatura}
                    </p>
                  </div>
                  <Badge variant="destructive" className="text-[10px] shrink-0 ml-2">Bajo</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Costo vs Revenue */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-foreground text-sm">Revenue vs Costo</p>
            <p className="text-xs text-muted-foreground">Últimos 7 días</p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={costoVsRevenue.map((d) => ({ ...d, fecha: formatLabel(d.fecha) }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="fecha"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={45}
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
                return [formatCOP(amount), name === "revenue" ? "Revenue" : "Costo"]
              }}
            />
            <Bar dataKey="revenue" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} name="revenue" />
            <Bar dataKey="costo" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} name="costo" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
