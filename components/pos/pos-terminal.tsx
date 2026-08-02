"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR, { mutate } from "swr"
import {
  Home,
  Search,
  ShoppingCart,
  ShoppingBag,
  Truck,
  Utensils,
  Plus,
  Minus,
  X,
  Percent,
  StickyNote,
  Users,
  Printer,
  SplitSquareHorizontal,
  Wifi,
  Network,
  ChevronLeft,
  ArrowLeft,
  Flame,
  Check,
  Trash2,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
}

interface Producto {
  id: number
  nombre: string
  descripcion: string | null
  precio_venta: number
  categoria_nombre: string | null
  disponible: number
}

interface Pedido {
  id: number
  tipo: string
  mesa: string | null
  estado: string
  total: number
}

interface Linea {
  producto_id: number
  nombre: string
  precio: number
  cantidad: number
}

interface Mesa {
  id: string
  nombre: string
  tipo: "local" | "para_llevar" | "delivery"
}

// Mesa física del salón, tal como está guardada en la base de datos (tabla `mesas`)
interface MesaFisica {
  id: number
  numero: number
  capacidad: number
  activa: number
}

const TIPO_LABEL: Record<Mesa["tipo"], string> = {
  local: "En mesa",
  para_llevar: "Para llevar",
  delivery: "Domicilio",
}

const METODOS = [
  { id: "efectivo", label: "Efectivo", emoji: "💵" },
  { id: "tarjeta", label: "Tarjeta", emoji: "💳" },
  { id: "nequi", label: "Nequi", emoji: "📲" },
  { id: "daviplata", label: "Daviplata", emoji: "📱" },
  { id: "transferencia", label: "Transferencia", emoji: "🏦" },
]

export function PosTerminal({ asesor = "Asesor 1" }: { asesor?: string }) {
  const router = useRouter()
  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)
  const { data: pedidos = [] } = useSWR<Pedido[]>("/api/pedidos", fetcher, { refreshInterval: 20000 })
  const { data: mesasFisicas = [] } = useSWR<MesaFisica[]>("/api/mesas", fetcher)

  // Mesas abiertas — cada una con su propio carrito en memoria
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [activa, setActiva] = useState<string | null>(null)
  const [carts, setCarts] = useState<Record<string, Linea[]>>({})
  const [descuentos, setDescuentos] = useState<Record<string, number>>({})
  const [notas, setNotas] = useState<Record<string, string>>({})

  const [search, setSearch] = useState("")
  const [buscando, setBuscando] = useState(false)
  const [categoria, setCategoria] = useState<string>("Todas")

  const [selPid, setSelPid] = useState<number | null>(null)

  // Modales
  const [notaOpen, setNotaOpen] = useState(false)
  const [dividirOpen, setDividirOpen] = useState(false)
  const [pagoOpen, setPagoOpen] = useState(false)
  const [metodo, setMetodo] = useState("efectivo")
  const [cliente, setCliente] = useState("")
  const [procesando, setProcesando] = useState(false)
  const [recibo, setRecibo] = useState<{ numero: string; total: number; impuesto: number; lineas: Linea[]; desc: number; sub: number } | null>(null)

  const mesaActiva = mesas.find((m) => m.id === activa) ?? null
  const cart = (activa && carts[activa]) || []
  const descuento = (activa && descuentos[activa]) || 0

  // Pedidos activos ya enviados a cocina, agrupados por mesa (para ver el estado real del salón)
  const pedidosPorMesa = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>()
    pedidos.forEach((p) => {
      if (p.tipo === "local" && p.mesa) {
        const prev = map.get(p.mesa) ?? { count: 0, total: 0 }
        map.set(p.mesa, { count: prev.count + 1, total: prev.total + (p.total ?? 0) })
      }
    })
    return map
  }, [pedidos])

  const paraLlevarActivos = useMemo(() => pedidos.filter((p) => p.tipo === "para_llevar").length, [pedidos])
  const domicilioActivos = useMemo(() => pedidos.filter((p) => p.tipo === "delivery").length, [pedidos])

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

  const subtotal = cart.reduce((s, l) => s + l.precio * l.cantidad, 0)
  const desc = Math.min(subtotal, descuento)
  const total = subtotal - desc
  const totalItems = cart.reduce((s, l) => s + l.cantidad, 0)

  // ── Helpers de estado ──
  function setCart(nuevo: Linea[]) {
    if (!activa) return
    setCarts((prev) => ({ ...prev, [activa]: nuevo }))
  }

  function cantidadEnCarrito(pid: number) {
    return cart.find((l) => l.producto_id === pid)?.cantidad ?? 0
  }

  // ── Productos ──
  function addProducto(p: Producto) {
    if (p.disponible !== 1) return
    const existe = cart.find((l) => l.producto_id === p.id)
    if (existe) {
      setCart(cart.map((l) => (l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)))
    } else {
      setCart([...cart, { producto_id: p.id, nombre: p.nombre, precio: p.precio_venta, cantidad: 1 }])
    }
    setSelPid(p.id)
  }

  function cambiarQty(pid: number, delta: number) {
    setCart(
      cart
        .map((l) => (l.producto_id === pid ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0)
    )
  }

  function quitar(pid: number) {
    setCart(cart.filter((l) => l.producto_id !== pid))
    if (selPid === pid) setSelPid(null)
  }

  // ── Descuento ──
  function abrirDescuento() {
    if (!activa) return
    const valor = window.prompt("Descuento (COP):", descuento ? String(descuento) : "")
    if (valor === null) return
    const monto = Math.max(0, Math.round(Number(valor) || 0))
    setDescuentos((prev) => ({ ...prev, [activa]: monto }))
  }

  // ── Navegación entre mesas ──
  function abrirMesa(tipo: Mesa["tipo"], numero?: string) {
    const id = tipo === "local" ? `T${numero}` : tipo === "para_llevar" ? "TL" : "DOM"
    const nombre = tipo === "local" ? `Mesa ${numero}` : TIPO_LABEL[tipo]
    setMesas((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, { id, nombre, tipo }]))
    setActiva(id)
  }

  function volverAMesas() {
    // Si no se agregó ningún producto, liberamos la mesa para que vuelva a verse disponible
    if (activa && (carts[activa]?.length ?? 0) === 0) {
      setMesas((prev) => prev.filter((m) => m.id !== activa))
    }
    setActiva(null)
  }

  // ── Enviar a cocina (Cuenta) ──
  async function enviarCuenta() {
    if (cart.length === 0 || !mesaActiva || !activa) return
    await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo: mesaActiva.tipo,
        mesa: mesaActiva.tipo === "local" ? mesaActiva.id.replace(/\D/g, "") : null,
        descuento: desc,
        notas: notas[activa] || null,
        items: cart.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
      }),
    })
    mutate("/api/pedidos")
  }

  // ── Cobrar (Pago) ──
  async function cobrar() {
    if (cart.length === 0 || !mesaActiva || !activa) return
    setProcesando(true)
    try {
      const rp = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: mesaActiva.tipo,
          mesa: mesaActiva.tipo === "local" ? mesaActiva.id.replace(/\D/g, "") : null,
          descuento: desc,
          notas: notas[activa] || null,
          items: cart.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
        }),
      })
      const ped = await rp.json()

      const rf = await fetch("/api/facturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido_id: ped.id, cliente: cliente || null, metodo_pago: metodo }),
      })
      const fac = await rf.json()

      setRecibo({
        numero: fac.numero,
        total: fac.total,
        impuesto: fac.impuesto,
        lineas: cart,
        desc,
        sub: subtotal,
      })
      mutate("/api/pedidos")
      // Limpiar la mesa cobrada
      setCarts((prev) => ({ ...prev, [activa]: [] }))
      setDescuentos((prev) => ({ ...prev, [activa]: 0 }))
      setNotas((prev) => ({ ...prev, [activa]: "" }))
      setCliente("")
    } finally {
      setProcesando(false)
    }
  }

  const [dividirEntre, setDividirEntre] = useState(2)

  async function cerrarSesion() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-100 text-slate-800 font-sans">
      {/* ══ Barra superior ══ */}
      <header className="h-14 shrink-0 bg-slate-800 flex items-stretch text-slate-200 select-none">
        {/* Logo + asesor */}
        <div className="flex items-center gap-2.5 px-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
            <Flame className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-semibold text-white">Grano & Aroma</p>
            <p className="text-[11px] text-slate-400">{asesor}</p>
          </div>
        </div>

        {/* Mesa activa */}
        {mesaActiva && (
          <button
            onClick={volverAMesas}
            className="flex items-center gap-2 px-4 border-x border-slate-700 hover:bg-slate-700 transition-colors"
            title="Volver a las mesas"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">{mesaActiva.nombre}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700">{TIPO_LABEL[mesaActiva.tipo]}</span>
          </button>
        )}

        <div className="flex-1" />

        {/* Iconos derecha */}
        <div className="flex items-center gap-4 px-4 text-slate-400">
          <Network className="w-4 h-4 text-emerald-400" />
          <Wifi className="w-4 h-4 text-emerald-400" />
          <button onClick={cerrarSesion} className="text-sm font-medium text-slate-200 hover:text-white flex items-center gap-1.5">
            <X className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </header>

      {!mesaActiva ? (
        /* ══ Pantalla de selección de mesa ══ */
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Encabezado */}
            <div className="rounded-2xl bg-slate-800 px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-white text-lg sm:text-xl font-bold">Selecciona una mesa</p>
              <p className="text-white/60 text-xs sm:text-sm mt-0.5">Ingresa a la mesa para registrar el pedido</p>
            </div>

            {/* Accesos rápidos */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => abrirMesa("para_llevar")}
                className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Para llevar</p>
                  <p className="text-xs text-slate-400">
                    {paraLlevarActivos > 0 ? `${paraLlevarActivos} en cocina` : "Nuevo pedido"}
                  </p>
                </div>
              </button>
              <button
                onClick={() => abrirMesa("delivery")}
                className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 hover:border-emerald-400 hover:bg-emerald-50 transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Domicilio</p>
                  <p className="text-xs text-slate-400">
                    {domicilioActivos > 0 ? `${domicilioActivos} en camino` : "Nuevo pedido"}
                  </p>
                </div>
              </button>
            </div>

            {/* Grid de mesas físicas */}
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-3">Mesas del salón</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {mesasFisicas.map((mesaFisica) => {
                  const n = String(mesaFisica.numero)
                  const localItems = carts[`T${n}`] ?? []
                  const localTotal = localItems.reduce((s, l) => s + l.precio * l.cantidad, 0)
                  const servidor = pedidosPorMesa.get(n)
                  const ocupada = localItems.length > 0 || !!servidor
                  const montoMostrado = servidor?.total ?? localTotal
                  return (
                    <button
                      key={mesaFisica.id}
                      onClick={() => abrirMesa("local", n)}
                      className={`group aspect-square rounded-2xl border-2 shadow-sm flex flex-col items-center justify-center gap-1.5 transition-all ${
                        ocupada
                          ? "border-amber-400 bg-amber-50 hover:bg-amber-100 hover:shadow-md"
                          : "border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-md"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                          ocupada ? "bg-amber-400/20" : "bg-slate-100 group-hover:bg-emerald-100"
                        }`}
                      >
                        <Utensils className={`w-5 h-5 ${ocupada ? "text-amber-600" : "text-slate-400 group-hover:text-emerald-600"}`} />
                      </div>
                      <span className={`text-2xl font-extrabold leading-none ${ocupada ? "text-amber-700" : "text-slate-700"}`}>{n}</span>
                      <span className="text-[11px] text-slate-400 leading-none">{mesaFisica.capacidad} pers.</span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          ocupada ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {ocupada ? "Ocupada" : "Libre"}
                      </span>
                      {ocupada && montoMostrado > 0 && (
                        <span className="text-[10px] text-amber-700 font-medium tabular-nums">{formatCOP(montoMostrado)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* ══ Panel izquierdo: carrito + teclado ══ */}
          <aside className="w-[340px] shrink-0 bg-white border-r border-slate-200 flex flex-col">
            {/* Carrito */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 px-6 text-center">
                  <ShoppingCart className="w-16 h-16 mb-3" strokeWidth={1.2} />
                  <p className="text-sm text-slate-400">El pedido de {mesaActiva.nombre} está vacío</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {cart.map((l) => {
                    const sel = selPid === l.producto_id
                    return (
                      <div
                        key={l.producto_id}
                        onClick={() => setSelPid(l.producto_id)}
                        className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                          sel ? "bg-emerald-50 border-l-4 border-emerald-500 pl-2" : "hover:bg-slate-50 border-l-4 border-transparent pl-2"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{l.nombre}</p>
                          <p className="text-xs text-slate-400">{formatCOP(l.precio)} × {l.cantidad}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); cambiarQty(l.producto_id, -1) }}
                            className="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.cantidad}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); cambiarQty(l.producto_id, 1) }}
                            className="w-6 h-6 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="w-16 text-right text-sm font-bold text-slate-800 tabular-nums">
                          {formatCOP(l.precio * l.cantidad)}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); quitar(l.producto_id) }}
                          className="text-slate-300 hover:text-rose-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Totales */}
            <div className="px-4 py-2.5 border-t-2 border-emerald-500 bg-slate-50 space-y-0.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCOP(subtotal)}</span>
              </div>
              {desc > 0 && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Descuento</span>
                  <span className="tabular-nums">−{formatCOP(desc)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-slate-700">Total</span>
                <span className="text-xl font-extrabold text-emerald-600 tabular-nums">{formatCOP(total)}</span>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="grid grid-cols-3 gap-px bg-slate-200 border-y border-slate-200">
              <ActionBtn icon={StickyNote} label="Nota" onClick={() => setNotaOpen(true)} active={!!(activa && notas[activa])} />
              <ActionBtn icon={Users} label="Cliente" onClick={abrirCliente} />
              <ActionBtn icon={Printer} label="Cuenta" onClick={enviarCuenta} disabled={cart.length === 0} />
              <ActionBtn icon={SplitSquareHorizontal} label="Dividir" onClick={() => setDividirOpen(true)} disabled={cart.length === 0} />
              <ActionBtn
                icon={Trash2}
                label="Vaciar"
                onClick={() => { setCart([]); if (activa) setDescuentos((p) => ({ ...p, [activa]: 0 })) }}
                disabled={cart.length === 0}
              />
              <ActionBtn icon={Percent} label="Descuento" onClick={abrirDescuento} active={desc > 0} />
            </div>

            {/* Cliente + Pago */}
            <div className="bg-white">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 truncate">{cliente || "Cliente"}</span>
              </div>
              <button
                onClick={() => cart.length > 0 && setPagoOpen(true)}
                disabled={cart.length === 0}
                className="w-full flex items-center justify-center gap-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white py-4 transition-colors"
              >
                <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <ChevronLeft className="w-4.5 h-4.5 rotate-180" />
                </span>
                <span className="text-sm font-semibold">Pago</span>
              </button>
            </div>
          </aside>

          {/* ══ Panel derecho: productos ══ */}
          <main className="flex-1 flex flex-col min-w-0 bg-slate-100">
            {/* Breadcrumb + búsqueda */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
              <button onClick={volverAMesas} className="text-slate-400 hover:text-emerald-500" title="Volver a las mesas">
                <Home className="w-5 h-5" />
              </button>
              <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180" />
              <span className="text-sm font-medium text-slate-600">{categoria === "Todas" ? "Grano & Aroma" : categoria}</span>
              <div className="flex-1" />
              {buscando ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => !search && setBuscando(false)}
                    placeholder="Buscar productos..."
                    className="pl-9 pr-3 h-9 rounded-full border border-slate-200 text-sm outline-none focus:border-emerald-400 w-56"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setBuscando(true)}
                  className="flex items-center gap-2 h-9 px-4 rounded-full border border-slate-200 bg-white text-sm text-slate-500 hover:border-emerald-400"
                >
                  <Search className="w-4 h-4" />
                  Buscar Productos
                </button>
              )}
            </div>

            {/* Chips de categorías */}
            <div className="flex gap-2 px-4 py-2.5 overflow-x-auto border-b border-slate-200">
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoria(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    categoria === c ? "bg-emerald-500 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-emerald-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Grilla de productos */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {productosFiltrados.map((p) => {
                  const enCarrito = cantidadEnCarrito(p.id)
                  const agotado = p.disponible !== 1
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProducto(p)}
                      disabled={agotado}
                      className={`group relative flex flex-col items-center justify-center gap-1.5 min-h-[108px] bg-white rounded-2xl border border-slate-200 p-4 text-center transition-all ${
                        agotado ? "opacity-50 cursor-not-allowed" : "hover:border-emerald-400 hover:shadow-md active:scale-[0.97]"
                      }`}
                    >
                      {/* Badge cantidad */}
                      {enCarrito > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-[24px] h-[24px] px-1 rounded-full text-xs font-bold flex items-center justify-center ring-2 ring-white bg-emerald-500 text-white">
                          {enCarrito}
                        </span>
                      )}
                      {/* Nombre + precio */}
                      <p className="text-base sm:text-lg font-bold text-slate-800 leading-tight line-clamp-3">{p.nombre}</p>
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatCOP(p.precio_venta)}</p>
                      {agotado && <p className="text-[11px] text-rose-500 font-medium">Agotado</p>}
                    </button>
                  )
                })}
              </div>
              {productosFiltrados.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <Search className="w-10 h-10 mb-2" />
                  <p className="text-sm text-slate-400">Sin productos que coincidan</p>
                </div>
              )}
            </div>
          </main>
        </div>
      )}

      {/* ══ Modal Nota ══ */}
      {notaOpen && mesaActiva && activa && (
        <Overlay onClose={() => setNotaOpen(false)}>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Nota del pedido</h3>
          <p className="text-sm text-slate-500 mb-4">{mesaActiva.nombre}</p>
          <textarea
            rows={4}
            value={notas[activa] ?? ""}
            onChange={(e) => setNotas((prev) => ({ ...prev, [activa]: e.target.value }))}
            placeholder="Ej: sin azúcar, leche deslactosada, para llevar..."
            className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-emerald-400 resize-none"
          />
          <div className="flex justify-end gap-2 mt-4">
            <BtnSec onClick={() => setNotaOpen(false)}>Cerrar</BtnSec>
            <BtnPri onClick={() => setNotaOpen(false)}>Guardar</BtnPri>
          </div>
        </Overlay>
      )}

      {/* ══ Modal Dividir ══ */}
      {dividirOpen && mesaActiva && (
        <Overlay onClose={() => setDividirOpen(false)}>
          <h3 className="text-lg font-bold text-slate-800 mb-1">Dividir cuenta</h3>
          <p className="text-sm text-slate-500 mb-4">Total {formatCOP(total)} de {mesaActiva.nombre}</p>
          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => setDividirEntre((n) => Math.max(1, n - 1))} className="w-10 h-10 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center">
              <Minus className="w-4 h-4" />
            </button>
            <div className="text-center">
              <p className="text-3xl font-extrabold text-slate-800 tabular-nums">{dividirEntre}</p>
              <p className="text-xs text-slate-400">personas</p>
            </div>
            <button onClick={() => setDividirEntre((n) => Math.min(20, n + 1))} className="w-10 h-10 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="rounded-lg bg-emerald-50 p-4 text-center">
            <p className="text-xs text-emerald-700">Cada persona paga</p>
            <p className="text-2xl font-extrabold text-emerald-600 tabular-nums">{formatCOP(Math.ceil(total / dividirEntre))}</p>
          </div>
          <div className="flex justify-end mt-4">
            <BtnPri onClick={() => setDividirOpen(false)}>Entendido</BtnPri>
          </div>
        </Overlay>
      )}

      {/* ══ Modal Pago / Recibo ══ */}
      {pagoOpen && mesaActiva && (
        <Overlay onClose={() => { if (!procesando) { setPagoOpen(false); setRecibo(null) } }}>
          {recibo ? (
            <div>
              <div className="text-center mb-4">
                <div className="inline-flex w-12 h-12 rounded-full bg-emerald-100 items-center justify-center mb-2">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Pago registrado</h3>
                <p className="text-sm text-slate-500">Factura {recibo.numero}</p>
              </div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 font-mono text-sm space-y-1">
                {recibo.lineas.map((l) => (
                  <div key={l.producto_id} className="flex justify-between">
                    <span className="text-slate-600">{l.cantidad}× {l.nombre}</span>
                    <span className="text-slate-700 tabular-nums">{formatCOP(l.precio * l.cantidad)}</span>
                  </div>
                ))}
                <div className="border-t border-dashed border-slate-300 pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="tabular-nums">{formatCOP(recibo.sub)}</span></div>
                  {recibo.desc > 0 && <div className="flex justify-between text-slate-500"><span>Descuento</span><span className="tabular-nums">−{formatCOP(recibo.desc)}</span></div>}
                  <div className="flex justify-between text-slate-500"><span>Impoconsumo 8%</span><span className="tabular-nums">{formatCOP(recibo.impuesto)}</span></div>
                  <div className="flex justify-between font-bold text-slate-800 text-base pt-1 border-t border-slate-300 font-sans"><span>Total</span><span className="tabular-nums text-emerald-600">{formatCOP(recibo.total)}</span></div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <BtnSec onClick={() => window.print()}><Printer className="w-4 h-4" /> Imprimir</BtnSec>
                <BtnPri onClick={() => { setPagoOpen(false); setRecibo(null) }}>Nuevo pedido</BtnPri>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Cobrar {mesaActiva.nombre}</h3>
              <p className="text-sm text-slate-500 mb-4">Total a pagar</p>
              <div className="rounded-lg bg-slate-800 text-white p-4 text-center mb-4">
                <p className="text-3xl font-extrabold tabular-nums">{formatCOP(subtotal - desc + Math.round((subtotal - desc) * 0.08))}</p>
                <p className="text-xs text-slate-400 mt-1">Incluye impoconsumo 8% ({formatCOP(Math.round((subtotal - desc) * 0.08))})</p>
              </div>
              <p className="text-xs font-medium text-slate-500 mb-2">Método de pago</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {METODOS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMetodo(m.id)}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-medium transition-colors ${
                      metodo === m.id ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-lg">{m.emoji}</span>
                    {m.label}
                  </button>
                ))}
              </div>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nombre del cliente (opcional)"
                className="w-full rounded-lg border border-slate-200 px-3 h-10 text-sm outline-none focus:border-emerald-400 mb-4"
              />
              <div className="flex justify-end gap-2">
                <BtnSec onClick={() => setPagoOpen(false)} disabled={procesando}>Cancelar</BtnSec>
                <BtnPri onClick={cobrar} disabled={procesando}>
                  {procesando ? "Procesando..." : "Confirmar pago"}
                </BtnPri>
              </div>
            </div>
          )}
        </Overlay>
      )}
    </div>
  )

  function abrirCliente() {
    const nombre = window.prompt("Nombre del cliente:", cliente)
    if (nombre !== null) setCliente(nombre)
  }
}

// ── Subcomponentes ──
function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: typeof StickyNote
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 bg-white transition-colors disabled:opacity-40 ${
        active ? "text-emerald-600" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function BtnPri({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-300 text-white text-sm font-semibold transition-colors"
    >
      {children}
    </button>
  )
}

function BtnSec({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 transition-colors"
    >
      {children}
    </button>
  )
}
