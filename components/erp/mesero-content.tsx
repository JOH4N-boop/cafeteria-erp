"use client"

import { useMemo, useState } from "react"
import useSWR, { mutate } from "swr"
import {
  Plus,
  Minus,
  Search,
  Trash2,
  RefreshCw,
  X,
  ShoppingCart,
  ConciergeBell,
  Receipt,
  Utensils,
  Coffee,
  ChefHat,
  CheckCircle2,
  Clock,
  Printer,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso + (iso.includes("Z") ? "" : "Z")).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "Ahora"
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h`
}

const MESAS = ["1", "2", "3", "4", "5", "6", "7", "8"]

interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  precio_venta: number
  categoria_nombre: string | null
  disponible: number
}

interface PedidoItem {
  id: number
  producto_id: number
  producto_nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  notas: string | null
}

interface Pedido {
  id: number
  numero: string
  estado: "pendiente" | "en_preparacion" | "listo" | "entregado" | "cancelado"
  tipo: "local" | "para_llevar" | "delivery"
  mesa: string | null
  subtotal: number
  descuento: number
  total: number
  notas: string | null
  created_at: string
  facturado: number
  items: PedidoItem[]
}

interface CartItem {
  producto_id: number
  nombre: string
  precio: number
  cantidad: number
}

interface FacturaResult {
  numero: string
  total: number
  impuesto: number
}

const ESTADO_META: Record<Pedido["estado"], { label: string; className: string; icon: typeof Clock }> = {
  pendiente: { label: "Pendiente", className: "border-amber-400/30 text-amber-400 bg-amber-400/10", icon: Clock },
  en_preparacion: { label: "En preparación", className: "border-chart-2/40 text-chart-2 bg-chart-2/10", icon: ChefHat },
  listo: { label: "Listo", className: "border-emerald-400/30 text-emerald-400 bg-emerald-400/10", icon: CheckCircle2 },
  entregado: { label: "Entregado", className: "border-border text-muted-foreground bg-muted/40", icon: CheckCircle2 },
  cancelado: { label: "Cancelado", className: "border-destructive/30 text-destructive bg-destructive/10", icon: X },
}

const TIPO_LABEL: Record<Pedido["tipo"], string> = {
  local: "En mesa",
  para_llevar: "Para llevar",
  delivery: "Domicilio",
}

const SIGUIENTE_ESTADO: Partial<Record<Pedido["estado"], Pedido["estado"]>> = {
  pendiente: "en_preparacion",
  en_preparacion: "listo",
}

export function MeseroContent() {
  const [tab, setTab] = useState<"pos" | "activos">("pos")

  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)
  const { data: pedidos = [] } = useSWR<Pedido[]>("/api/pedidos", fetcher, { refreshInterval: 15000 })

  // ── Estado del punto de venta ─────────────────────────────
  const [tipo, setTipo] = useState<Pedido["tipo"]>("local")
  const [mesa, setMesa] = useState<string>("1")
  const [search, setSearch] = useState("")
  const [categoria, setCategoria] = useState<string>("Todas")
  const [cart, setCart] = useState<CartItem[]>([])
  const [descuento, setDescuento] = useState("")
  const [notas, setNotas] = useState("")
  const [enviando, setEnviando] = useState(false)

  // ── Facturación ───────────────────────────────────────────
  const [facturaModal, setFacturaModal] = useState<Pedido | null>(null)
  const [cliente, setCliente] = useState("")
  const [metodoPago, setMetodoPago] = useState("efectivo")
  const [facturando, setFacturando] = useState(false)
  const [facturaEmitida, setFacturaEmitida] = useState<FacturaResult | null>(null)

  const categorias = useMemo(() => {
    const set = new Set<string>()
    productos.forEach((p) => p.categoria_nombre && set.add(p.categoria_nombre))
    return ["Todas", ...Array.from(set)]
  }, [productos])

  const productosFiltrados = useMemo(
    () =>
      productos.filter((p) => {
        const okCat = categoria === "Todas" || p.categoria_nombre === categoria
        const okSearch = p.nombre.toLowerCase().includes(search.toLowerCase())
        return okCat && okSearch
      }),
    [productos, categoria, search]
  )

  const mesasOcupadas = useMemo(() => {
    const set = new Set<string>()
    pedidos.forEach((p) => p.tipo === "local" && p.mesa && set.add(p.mesa))
    return set
  }, [pedidos])

  const subtotal = cart.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const desc = Math.min(subtotal, Math.max(0, Number(descuento) || 0))
  const total = subtotal - desc
  const totalItems = cart.reduce((s, i) => s + i.cantidad, 0)

  // ── Acciones del carrito ──────────────────────────────────
  function addProducto(p: Producto) {
    setCart((prev) => {
      const existe = prev.find((i) => i.producto_id === p.id)
      if (existe) {
        return prev.map((i) => (i.producto_id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i))
      }
      return [...prev, { producto_id: p.id, nombre: p.nombre, precio: p.precio_venta, cantidad: 1 }]
    })
  }

  function cambiarCantidad(id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.producto_id === id ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    )
  }

  function quitarItem(id: number) {
    setCart((prev) => prev.filter((i) => i.producto_id !== id))
  }

  function vaciar() {
    setCart([])
    setDescuento("")
    setNotas("")
  }

  async function enviarPedido() {
    if (cart.length === 0) return
    setEnviando(true)
    try {
      await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          mesa: tipo === "local" ? mesa : null,
          descuento: desc,
          notas: notas || null,
          items: cart.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })),
        }),
      })
      mutate("/api/pedidos")
      vaciar()
      setTab("activos")
    } finally {
      setEnviando(false)
    }
  }

  // ── Acciones de pedidos activos ───────────────────────────
  async function avanzarEstado(pedido: Pedido) {
    const siguiente = SIGUIENTE_ESTADO[pedido.estado]
    if (!siguiente) return
    await fetch(`/api/pedidos/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: siguiente }),
    })
    mutate("/api/pedidos")
  }

  async function cancelarPedido(pedido: Pedido) {
    await fetch(`/api/pedidos/${pedido.id}`, { method: "DELETE" })
    mutate("/api/pedidos")
  }

  function abrirFactura(pedido: Pedido) {
    setFacturaModal(pedido)
    setCliente("")
    setMetodoPago("efectivo")
    setFacturaEmitida(null)
  }

  async function generarFactura() {
    if (!facturaModal) return
    setFacturando(true)
    try {
      const res = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedido_id: facturaModal.id,
          cliente: cliente || null,
          metodo_pago: metodoPago,
        }),
      })
      const data = await res.json()
      setFacturaEmitida({ numero: data.numero, total: data.total, impuesto: data.impuesto })
      mutate("/api/pedidos")
      mutate("/api/facturas")
    } finally {
      setFacturando(false)
    }
  }

  const pedidosActivos = pedidos.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado")

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Vista del Mesero</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toma de pedidos por mesa y facturación
          </p>
        </div>
        {/* Selector de vista */}
        <div className="inline-flex items-center rounded-lg border border-border bg-card p-1 self-start">
          <button
            onClick={() => setTab("pos")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === "pos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Utensils className="w-4 h-4" />
            Nuevo pedido
          </button>
          <button
            onClick={() => setTab("activos")}
            className={cn(
              "flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              tab === "activos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ConciergeBell className="w-4 h-4" />
            Pedidos activos
            {pedidosActivos.length > 0 && (
              <span className="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-amber text-sidebar-primary-foreground text-xs font-bold flex items-center justify-center">
                {pedidosActivos.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {tab === "pos" ? (
        <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
          {/* ── Columna izquierda: mesas + menú ── */}
          <div className="space-y-5">
            {/* Tipo de pedido */}
            <div className="flex flex-wrap gap-2">
              {(["local", "para_llevar", "delivery"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                    tipo === t
                      ? "bg-secondary border-primary/40 text-foreground"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>

            {/* Selector de mesa */}
            {tipo === "local" && (
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Selecciona la mesa
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {MESAS.map((m) => {
                    const ocupada = mesasOcupadas.has(m)
                    const activa = mesa === m
                    return (
                      <button
                        key={m}
                        onClick={() => setMesa(m)}
                        className={cn(
                          "relative aspect-square rounded-lg border flex flex-col items-center justify-center gap-0.5 transition-all",
                          activa
                            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                            : "border-border bg-background hover:border-primary/40"
                        )}
                      >
                        <span className={cn("text-lg font-bold", activa ? "text-primary" : "text-foreground")}>{m}</span>
                        <span className="text-[10px] text-muted-foreground leading-none">Mesa</span>
                        {ocupada && (
                          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber" title="Con pedido activo" />
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber" /> Con pedido activo
                  </span>
                </div>
              </div>
            )}

            {/* Buscador + categorías */}
            <div className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoria(c)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                      categoria === c
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de productos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {productosFiltrados.map((p) => {
                const disponible = p.disponible === 1
                return (
                  <button
                    key={p.id}
                    disabled={!disponible}
                    onClick={() => addProducto(p)}
                    className={cn(
                      "group text-left bg-card border border-border rounded-xl p-3.5 transition-all",
                      disponible
                        ? "hover:border-primary/50 hover:shadow-sm active:scale-[0.98]"
                        : "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-2.5">
                      <Coffee className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{p.nombre}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{p.categoria_nombre}</p>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-sm font-bold text-primary">{formatCOP(p.precio_venta)}</span>
                      {disponible ? (
                        <span className="w-6 h-6 rounded-md bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="text-[10px] text-destructive font-medium">Agotado</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Columna derecha: ticket ── */}
          <div className="lg:sticky lg:top-4 bg-card border border-border rounded-xl flex flex-col max-h-[calc(100vh-7rem)]">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Receipt className="w-4.5 h-4.5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-none">Pedido actual</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {tipo === "local" ? `Mesa ${mesa}` : TIPO_LABEL[tipo]} · {totalItems} ítem{totalItems !== 1 ? "s" : ""}
                </p>
              </div>
              {cart.length > 0 && (
                <button onClick={vaciar} className="text-muted-foreground hover:text-destructive transition-colors" title="Vaciar">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[120px]">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 text-muted-foreground text-center">
                  <ShoppingCart className="w-9 h-9 mb-2 opacity-30" />
                  <p className="text-sm">Toca un producto para agregarlo</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.producto_id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.nombre}</p>
                      <p className="text-xs text-muted-foreground">{formatCOP(item.precio)} c/u</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => cambiarCantidad(item.producto_id, -1)}
                        className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums">{item.cantidad}</span>
                      <button
                        onClick={() => cambiarCantidad(item.producto_id, 1)}
                        className="w-6 h-6 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="w-16 text-right text-sm font-semibold text-foreground tabular-nums">
                      {formatCOP(item.precio * item.cantidad)}
                    </span>
                    <button
                      onClick={() => quitarItem(item.producto_id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Totales + acciones */}
            {cart.length > 0 && (
              <div className="border-t border-border p-4 space-y-3">
                <div className="space-y-1.5">
                  <Textarea
                    placeholder="Notas del pedido (ej: sin azúcar, para llevar...)"
                    rows={2}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    className="text-sm resize-none"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Descuento (COP)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={descuento}
                    onChange={(e) => setDescuento(e.target.value)}
                    className="h-8 w-28 text-right"
                  />
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCOP(subtotal)}</span>
                  </div>
                  {desc > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Descuento</span>
                      <span className="tabular-nums">−{formatCOP(desc)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-foreground pt-1 border-t border-border/60 mt-1">
                    <span>Total</span>
                    <span className="tabular-nums text-primary">{formatCOP(total)}</span>
                  </div>
                </div>
                <Button onClick={enviarPedido} disabled={enviando} className="w-full gap-2">
                  {enviando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ConciergeBell className="w-4 h-4" />}
                  Enviar pedido
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Pedidos activos ── */
        <div>
          {pedidosActivos.length === 0 ? (
            <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ConciergeBell className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No hay pedidos activos</p>
              <Button variant="link" onClick={() => setTab("pos")} className="mt-1 text-primary">
                Tomar un nuevo pedido
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {pedidosActivos.map((pedido) => {
                const meta = ESTADO_META[pedido.estado]
                const EstadoIcon = meta.icon
                const siguiente = SIGUIENTE_ESTADO[pedido.estado]
                return (
                  <div key={pedido.id} className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
                    {/* Cabecera */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                        {pedido.tipo === "local" ? (
                          <span className="text-sm font-bold text-foreground">{pedido.mesa}</span>
                        ) : (
                          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-none">{pedido.numero}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {pedido.tipo === "local" ? `Mesa ${pedido.mesa}` : TIPO_LABEL[pedido.tipo]} · {timeAgo(pedido.created_at)}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("gap-1 text-xs shrink-0", meta.className)}>
                        <EstadoIcon className="w-3 h-3" />
                        {meta.label}
                      </Badge>
                    </div>

                    {/* Items */}
                    <div className="px-4 py-3 flex-1 space-y-1.5">
                      {pedido.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground">
                            <span className="text-muted-foreground font-medium">{it.cantidad}×</span> {it.producto_nombre}
                          </span>
                          <span className="text-muted-foreground tabular-nums">{formatCOP(it.subtotal)}</span>
                        </div>
                      ))}
                      {pedido.notas && (
                        <p className="text-xs text-muted-foreground italic pt-1.5 border-t border-border/50 mt-2">
                          “{pedido.notas}”
                        </p>
                      )}
                    </div>

                    {/* Total + acciones */}
                    <div className="px-4 py-3 border-t border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total</span>
                        <span className="text-base font-bold text-foreground tabular-nums">{formatCOP(pedido.total)}</span>
                      </div>
                      <div className="flex gap-2">
                        {siguiente && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => avanzarEstado(pedido)}
                            className="flex-1 gap-1.5 text-xs"
                          >
                            {ESTADO_META[siguiente].label}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" onClick={() => abrirFactura(pedido)} className="flex-1 gap-1.5 text-xs">
                          <Receipt className="w-3.5 h-3.5" />
                          Facturar
                        </Button>
                      </div>
                      <button
                        onClick={() => cancelarPedido(pedido)}
                        className="w-full text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Cancelar pedido
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modal de facturación ── */}
      <Dialog open={!!facturaModal} onOpenChange={(o) => !o && setFacturaModal(null)}>
        <DialogContent className="max-w-md">
          {facturaEmitida ? (
            /* Factura emitida — recibo */
            <div>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Factura emitida
                </DialogTitle>
              </DialogHeader>
              <div id="recibo" className="mt-4 rounded-xl border border-border bg-background p-5 font-mono text-sm">
                <div className="text-center mb-4">
                  <div className="inline-flex w-10 h-10 rounded-lg bg-primary items-center justify-center mb-2">
                    <Coffee className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <p className="font-sans font-bold text-foreground">Grano & Aroma</p>
                  <p className="text-xs text-muted-foreground font-sans">Factura de venta</p>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Factura</span>
                  <span className="text-foreground font-semibold">{facturaEmitida.numero}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mb-3">
                  <span>Pedido</span>
                  <span className="text-foreground">{facturaModal?.numero}</span>
                </div>
                <div className="border-t border-dashed border-border pt-3 space-y-1.5">
                  {facturaModal?.items.map((it) => (
                    <div key={it.id} className="flex justify-between text-xs">
                      <span className="text-foreground">{it.cantidad}× {it.producto_nombre}</span>
                      <span className="text-foreground tabular-nums">{formatCOP(it.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dashed border-border mt-3 pt-3 space-y-1 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCOP(facturaModal?.subtotal ?? 0)}</span>
                  </div>
                  {(facturaModal?.descuento ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Descuento</span>
                      <span className="tabular-nums">−{formatCOP(facturaModal?.descuento ?? 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Impoconsumo (8%)</span>
                    <span className="tabular-nums">{formatCOP(facturaEmitida.impuesto)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-foreground pt-1.5 border-t border-border mt-1.5 font-sans">
                    <span>Total</span>
                    <span className="tabular-nums text-primary">{formatCOP(facturaEmitida.total)}</span>
                  </div>
                </div>
                <p className="text-center text-[10px] text-muted-foreground mt-4 font-sans">¡Gracias por tu compra!</p>
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setFacturaModal(null)}>Cerrar</Button>
                <Button onClick={() => window.print()} className="gap-2">
                  <Printer className="w-4 h-4" />
                  Imprimir
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* Formulario previo a facturar */
            <div>
              <DialogHeader>
                <DialogTitle>Facturar pedido {facturaModal?.numero}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted/30 p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatCOP(facturaModal?.subtotal ?? 0)}</span>
                  </div>
                  {(facturaModal?.descuento ?? 0) > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Descuento</span>
                      <span className="tabular-nums">−{formatCOP(facturaModal?.descuento ?? 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Impoconsumo (8%)</span>
                    <span className="tabular-nums">
                      {formatCOP(Math.round(((facturaModal?.subtotal ?? 0) - (facturaModal?.descuento ?? 0)) * 0.08))}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-foreground pt-1.5 border-t border-border/60 mt-1.5">
                    <span>Total a pagar</span>
                    <span className="tabular-nums text-primary">
                      {formatCOP(
                        Math.round(((facturaModal?.subtotal ?? 0) - (facturaModal?.descuento ?? 0)) * 1.08)
                      )}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Cliente (opcional)</Label>
                  <Input placeholder="Nombre del cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Método de pago</Label>
                  <Select value={metodoPago} onValueChange={(value) => setMetodoPago(value ?? "efectivo")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="nequi">Nequi</SelectItem>
                      <SelectItem value="daviplata">Daviplata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFacturaModal(null)}>Cancelar</Button>
                <Button onClick={generarFactura} disabled={facturando} className="gap-2">
                  {facturando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                  Generar factura
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
