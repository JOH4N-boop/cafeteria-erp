"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Plus, Search, BookOpen, ChevronDown, ChevronRight, Pencil, Trash2, RefreshCw, X, DollarSign, TrendingUp, FlaskConical } from "lucide-react"
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

interface RecetaIngrediente {
  id: number
  ingrediente_id: number
  ingrediente_nombre: string
  unidad: string
  cantidad: number
  merma_porcentaje: number
  costo_linea: number
}

interface Receta {
  id: number
  producto_id: number
  producto_nombre: string
  precio_venta: number
  categoria_nombre: string
  instrucciones: string | null
  porciones: number
  costo_total: number
  margen: number
  ingredientes: RecetaIngrediente[]
}

interface Producto {
  id: number
  nombre: string
  precio_venta: number
  categoria_nombre: string
}

interface Ingrediente {
  id: number
  nombre: string
  unidad_abrev: string
  costo_unitario: number
}

interface IngredienteForm {
  ingrediente_id: string
  cantidad: string
  merma_porcentaje: string
}

function getMargenColor(margen: number) {
  if (margen >= 65) return "text-emerald-400"
  if (margen >= 40) return "text-amber-400"
  return "text-destructive"
}

function getMargenBadge(margen: number) {
  if (margen >= 65) return "border-emerald-400/30 text-emerald-400"
  if (margen >= 40) return "border-amber-400/30 text-amber-400"
  return "border-destructive/30 text-destructive"
}

export function RecetasContent() {
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [modal, setModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [formProducto, setFormProducto] = useState("")
  const [formInstrucciones, setFormInstrucciones] = useState("")
  const [formPorciones, setFormPorciones] = useState("1")
  const [formIngredientes, setFormIngredientes] = useState<IngredienteForm[]>([
    { ingrediente_id: "", cantidad: "", merma_porcentaje: "0" },
  ])

  const { data: recetas = [], isLoading } = useSWR<Receta[]>("/api/recetas", fetcher)
  const { data: productos = [] } = useSWR<Producto[]>("/api/productos", fetcher)
  const { data: ingredientes = [] } = useSWR<Ingrediente[]>("/api/inventario", fetcher)

  const filtradas = recetas.filter((r) =>
    r.producto_nombre.toLowerCase().includes(search.toLowerCase()) ||
    r.categoria_nombre?.toLowerCase().includes(search.toLowerCase())
  )

  function abrirModal() {
    setFormProducto("")
    setFormInstrucciones("")
    setFormPorciones("1")
    setFormIngredientes([{ ingrediente_id: "", cantidad: "", merma_porcentaje: "0" }])
    setModal(true)
  }

  function agregarIngrediente() {
    setFormIngredientes((prev) => [...prev, { ingrediente_id: "", cantidad: "", merma_porcentaje: "0" }])
  }

  function quitarIngrediente(idx: number) {
    setFormIngredientes((prev) => prev.filter((_, i) => i !== idx))
  }

  function actualizarIngrediente(idx: number, field: keyof IngredienteForm, value: string) {
    setFormIngredientes((prev) => prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)))
  }

  // Costo estimado en tiempo real para el formulario
  const costoEstimado = formIngredientes.reduce((sum, fi) => {
    const ing = ingredientes.find((i) => String(i.id) === fi.ingrediente_id)
    if (!ing || !fi.cantidad) return sum
    const merma = parseFloat(fi.merma_porcentaje || "0") / 100
    return sum + parseFloat(fi.cantidad) * ing.costo_unitario * (1 + merma)
  }, 0)

  const productoSeleccionado = productos.find((p) => String(p.id) === formProducto)
  const margenEstimado = productoSeleccionado && costoEstimado > 0
    ? ((productoSeleccionado.precio_venta - costoEstimado) / productoSeleccionado.precio_venta) * 100
    : null

  async function guardarReceta() {
    if (!formProducto) return
    setSaving(true)
    try {
      const ings = formIngredientes
        .filter((fi) => fi.ingrediente_id && fi.cantidad)
        .map((fi) => ({
          ingrediente_id: Number(fi.ingrediente_id),
          cantidad: Number(fi.cantidad),
          merma_porcentaje: Number(fi.merma_porcentaje || 0),
        }))

      await fetch("/api/recetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          producto_id: Number(formProducto),
          instrucciones: formInstrucciones || null,
          porciones: Number(formPorciones),
          ingredientes: ings,
        }),
      })
      mutate("/api/recetas")
      setModal(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Recetas y Escandallos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {recetas.length} recetas · Control de costos y márgenes
          </p>
        </div>
        <Button onClick={abrirModal} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Nueva receta
        </Button>
      </div>

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lista de recetas */}
      <div className="space-y-2">
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-20 animate-pulse" />
          ))
        ) : filtradas.length === 0 ? (
          <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BookOpen className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No hay recetas registradas</p>
            <Button variant="link" onClick={abrirModal} className="mt-2 text-primary">
              Crear la primera receta
            </Button>
          </div>
        ) : (
          filtradas.map((receta) => {
            const expanded = expandedId === receta.id
            return (
              <div key={receta.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Cabecera de receta */}
                <button
                  onClick={() => setExpandedId(expanded ? null : receta.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FlaskConical className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{receta.producto_nombre}</p>
                    <p className="text-xs text-muted-foreground">{receta.categoria_nombre}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 mr-4">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Costo</p>
                      <p className="text-sm font-semibold text-foreground">{formatCOP(receta.costo_total)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Precio</p>
                      <p className="text-sm font-semibold text-foreground">{formatCOP(receta.precio_venta)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Margen</p>
                      <p className={cn("text-sm font-bold", getMargenColor(receta.margen))}>
                        {receta.margen.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("hidden sm:flex text-xs", getMargenBadge(receta.margen))}
                  >
                    {receta.margen >= 65 ? "Rentable" : receta.margen >= 40 ? "Aceptable" : "Bajo margen"}
                  </Badge>
                  {expanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Detalle expandido */}
                {expanded && (
                  <div className="border-t border-border/60 px-5 py-4">
                    {/* KPIs móvil */}
                    <div className="grid grid-cols-3 gap-3 sm:hidden mb-4">
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Costo</p>
                        <p className="text-sm font-semibold">{formatCOP(receta.costo_total)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Precio</p>
                        <p className="text-sm font-semibold">{formatCOP(receta.precio_venta)}</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground">Margen</p>
                        <p className={cn("text-sm font-bold", getMargenColor(receta.margen))}>{receta.margen.toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Instrucciones */}
                    {receta.instrucciones && (
                      <div className="mb-4 p-3 bg-muted/20 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Instrucciones de preparación</p>
                        <p className="text-sm text-foreground leading-relaxed">{receta.instrucciones}</p>
                      </div>
                    )}

                    {/* Tabla ingredientes */}
                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/30 border-b border-border/50">
                            <th className="text-left font-medium text-muted-foreground px-3 py-2">Ingrediente</th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2">Cantidad</th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2">Merma %</th>
                            <th className="text-right font-medium text-muted-foreground px-3 py-2">Costo línea</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receta.ingredientes.map((ri) => (
                            <tr key={ri.id} className="border-b border-border/30 last:border-0">
                              <td className="px-3 py-2 text-foreground font-medium">{ri.ingrediente_nombre}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {ri.cantidad} {ri.unidad}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                                {ri.merma_porcentaje > 0 ? `${ri.merma_porcentaje}%` : "—"}
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-foreground">
                                {formatCOP(ri.costo_linea)}
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-muted/20">
                            <td colSpan={3} className="px-3 py-2 text-right font-semibold text-foreground text-xs">
                              Costo total
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-foreground">
                              {formatCOP(receta.costo_total)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Ganancia por unidad */}
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>
                        Ganancia por venta:{" "}
                        <span className="font-semibold text-emerald-400">
                          {formatCOP(receta.precio_venta - receta.costo_total)}
                        </span>
                      </span>
                      <TrendingUp className="w-3.5 h-3.5 ml-2" />
                      <span>
                        Porciones: <span className="font-semibold text-foreground">{receta.porciones}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modal nueva receta */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva receta / escandallo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Producto */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Producto *</Label>
                <Select value={formProducto} onValueChange={(value) => setFormProducto(value ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.nombre} — {formatCOP(p.precio_venta)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Porciones</Label>
                <Input
                  type="number"
                  min="1"
                  value={formPorciones}
                  onChange={(e) => setFormPorciones(e.target.value)}
                />
              </div>
              {/* Costo estimado en tiempo real */}
              {costoEstimado > 0 && productoSeleccionado && (
                <div className="bg-muted/30 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Costo estimado</p>
                    <p className="font-bold text-foreground">{formatCOP(costoEstimado)}</p>
                  </div>
                  {margenEstimado !== null && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Margen</p>
                      <p className={cn("font-bold", getMargenColor(margenEstimado))}>
                        {margenEstimado.toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Ingredientes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ingredientes</Label>
                <Button type="button" variant="outline" size="sm" onClick={agregarIngrediente} className="gap-1.5 text-xs h-7">
                  <Plus className="w-3.5 h-3.5" />
                  Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {formIngredientes.map((fi, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Select
                        value={fi.ingrediente_id}
                        onValueChange={(value) => actualizarIngrediente(idx, "ingrediente_id", value ?? "")}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Ingrediente" />
                        </SelectTrigger>
                        <SelectContent>
                          {ingredientes.map((i) => (
                            <SelectItem key={i.id} value={String(i.id)}>
                              {i.nombre} ({i.unidad_abrev})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Input
                        className="h-9"
                        type="number"
                        placeholder="Cantidad"
                        value={fi.cantidad}
                        onChange={(e) => actualizarIngrediente(idx, "cantidad", e.target.value)}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        className="h-9"
                        type="number"
                        placeholder="Merma %"
                        value={fi.merma_porcentaje}
                        onChange={(e) => actualizarIngrediente(idx, "merma_porcentaje", e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button
                        onClick={() => quitarIngrediente(idx)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instrucciones */}
            <div className="space-y-1.5">
              <Label>Instrucciones de preparación</Label>
              <Textarea
                placeholder="Describe los pasos de preparación..."
                rows={3}
                value={formInstrucciones}
                onChange={(e) => setFormInstrucciones(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={guardarReceta} disabled={saving || !formProducto}>
              {saving && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              Guardar receta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
