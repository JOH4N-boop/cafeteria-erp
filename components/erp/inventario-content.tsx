"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Plus, Search, AlertTriangle, ArrowUpCircle, ArrowDownCircle, RefreshCw, Pencil, Trash2, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function formatCOP(value: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
}

interface Ingrediente {
  id: number
  nombre: string
  descripcion: string | null
  unidad_id: number
  unidad_nombre: string
  unidad_abrev: string
  stock_actual: number
  stock_minimo: number
  costo_unitario: number
  bajo_stock: number
  activo: number
}

interface Unidad {
  id: number
  nombre: string
  abreviatura: string
  tipo: string
}

type MovTipo = "entrada" | "salida" | "ajuste" | "merma"

const MOV_LABELS: Record<MovTipo, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  merma: "Merma",
}

export function InventarioContent() {
  const [search, setSearch] = useState("")
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [modalIngrediente, setModalIngrediente] = useState(false)
  const [modalMovimiento, setModalMovimiento] = useState(false)
  const [editando, setEditando] = useState<Ingrediente | null>(null)
  const [ingSelected, setIngSelected] = useState<Ingrediente | null>(null)
  const [saving, setSaving] = useState(false)

  // Form ingrediente
  const [form, setForm] = useState({ nombre: "", descripcion: "", unidad_id: "", stock_actual: "0", stock_minimo: "0", costo_unitario: "0" })
  // Form movimiento
  const [movForm, setMovForm] = useState({ tipo: "entrada" as MovTipo, cantidad: "", costo_unitario: "", motivo: "" })

  const url = `/api/inventario?search=${encodeURIComponent(search)}${soloAlertas ? "&alertas=true" : ""}`
  const { data: ingredientes = [], isLoading } = useSWR<Ingrediente[]>(url, fetcher)
  const { data: unidades = [] } = useSWR<Unidad[]>("/api/unidades", fetcher)

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre: "", descripcion: "", unidad_id: "", stock_actual: "0", stock_minimo: "0", costo_unitario: "0" })
    setModalIngrediente(true)
  }

  function abrirEditar(ing: Ingrediente) {
    setEditando(ing)
    setForm({
      nombre: ing.nombre,
      descripcion: ing.descripcion || "",
      unidad_id: String(ing.unidad_id),
      stock_actual: String(ing.stock_actual),
      stock_minimo: String(ing.stock_minimo),
      costo_unitario: String(ing.costo_unitario),
    })
    setModalIngrediente(true)
  }

  function abrirMovimiento(ing: Ingrediente) {
    setIngSelected(ing)
    setMovForm({ tipo: "entrada", cantidad: "", costo_unitario: "", motivo: "" })
    setModalMovimiento(true)
  }

  async function guardarIngrediente() {
    if (!form.nombre || !form.unidad_id) return
    setSaving(true)
    try {
      if (editando) {
        await fetch(`/api/inventario/${editando.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, unidad_id: Number(form.unidad_id), stock_actual: Number(form.stock_actual), stock_minimo: Number(form.stock_minimo), costo_unitario: Number(form.costo_unitario) }),
        })
      } else {
        await fetch("/api/inventario", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, unidad_id: Number(form.unidad_id), stock_minimo: Number(form.stock_minimo), costo_unitario: Number(form.costo_unitario) }),
        })
      }
      mutate(url)
      setModalIngrediente(false)
    } finally {
      setSaving(false)
    }
  }

  async function eliminarIngrediente(id: number) {
    if (!confirm("¿Eliminar ingrediente?")) return
    await fetch(`/api/inventario/${id}`, { method: "DELETE" })
    mutate(url)
  }

  async function registrarMovimiento() {
    if (!ingSelected || !movForm.cantidad) return
    setSaving(true)
    try {
      await fetch("/api/inventario/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingrediente_id: ingSelected.id,
          tipo: movForm.tipo,
          cantidad: Number(movForm.cantidad),
          costo_unitario: movForm.costo_unitario ? Number(movForm.costo_unitario) : undefined,
          motivo: movForm.motivo || undefined,
        }),
      })
      mutate(url)
      setModalMovimiento(false)
    } finally {
      setSaving(false)
    }
  }

  const totalValor = ingredientes.reduce((s, i) => s + i.stock_actual * i.costo_unitario, 0)
  const alertasCount = ingredientes.filter((i) => i.bajo_stock).length

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Inventario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {ingredientes.length} ingredientes · Valor total: {formatCOP(totalValor)}
          </p>
        </div>
        <Button onClick={abrirNuevo} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Nuevo ingrediente
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar ingrediente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={soloAlertas ? "destructive" : "outline"}
          className="gap-2 shrink-0"
          onClick={() => setSoloAlertas((v) => !v)}
        >
          <AlertTriangle className="w-4 h-4" />
          {alertasCount > 0 && !soloAlertas ? `${alertasCount} alertas` : "Solo alertas"}
        </Button>
      </div>

      {/* Tabla */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Ingrediente</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Stock actual</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Stock mínimo</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Costo unit.</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Valor total</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Estado</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ingredientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-muted-foreground">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No se encontraron ingredientes</p>
                  </td>
                </tr>
              ) : (
                ingredientes.map((ing) => (
                  <tr key={ing.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{ing.nombre}</p>
                      {ing.descripcion && <p className="text-xs text-muted-foreground">{ing.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      <span className={cn(ing.bajo_stock ? "text-destructive font-semibold" : "text-foreground")}>
                        {ing.stock_actual.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground text-xs ml-1">{ing.unidad_abrev}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {ing.stock_minimo.toFixed(2)} {ing.unidad_abrev}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{formatCOP(ing.costo_unitario)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {formatCOP(ing.stock_actual * ing.costo_unitario)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {ing.bajo_stock ? (
                        <Badge variant="destructive" className="text-xs">Bajo stock</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30">OK</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 text-emerald-400 hover:bg-emerald-400/10"
                          title="Registrar entrada/salida"
                          onClick={() => abrirMovimiento(ing)}
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 text-muted-foreground hover:text-foreground"
                          title="Editar"
                          onClick={() => abrirEditar(ing)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="w-7 h-7 text-destructive hover:bg-destructive/10"
                          title="Eliminar"
                          onClick={() => eliminarIngrediente(ing.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Ingrediente */}
      <Dialog open={modalIngrediente} onOpenChange={setModalIngrediente}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar ingrediente" : "Nuevo ingrediente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Café Espresso" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Unidad de medida *</Label>
              <Select value={form.unidad_id} onValueChange={(v) => setForm((f) => ({ ...f, unidad_id: v ?? "" }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar unidad" />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.nombre} ({u.abreviatura})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editando && (
                <div className="space-y-1.5">
                  <Label>Stock actual</Label>
                  <Input type="number" value={form.stock_actual} onChange={(e) => setForm((f) => ({ ...f, stock_actual: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Stock mínimo</Label>
                <Input type="number" value={form.stock_minimo} onChange={(e) => setForm((f) => ({ ...f, stock_minimo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Costo unitario (COP)</Label>
                <Input type="number" value={form.costo_unitario} onChange={(e) => setForm((f) => ({ ...f, costo_unitario: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalIngrediente(false)}>Cancelar</Button>
            <Button onClick={guardarIngrediente} disabled={saving || !form.nombre || !form.unidad_id}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              {editando ? "Guardar cambios" : "Crear ingrediente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Movimiento */}
      <Dialog open={modalMovimiento} onOpenChange={setModalMovimiento}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
          </DialogHeader>
          {ingSelected && (
            <div className="bg-muted/40 rounded-lg px-4 py-3 mb-2">
              <p className="font-semibold text-foreground text-sm">{ingSelected.nombre}</p>
              <p className="text-xs text-muted-foreground">
                Stock actual: {ingSelected.stock_actual} {ingSelected.unidad_abrev}
              </p>
            </div>
          )}
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Tipo de movimiento</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MOV_LABELS) as MovTipo[]).map((tipo) => (
                  <button
                    key={tipo}
                    onClick={() => setMovForm((f) => ({ ...f, tipo }))}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors",
                      movForm.tipo === tipo
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80"
                    )}
                  >
                    {tipo === "entrada" && <ArrowUpCircle className="w-4 h-4 text-emerald-400" />}
                    {tipo === "salida" && <ArrowDownCircle className="w-4 h-4 text-destructive" />}
                    {tipo === "ajuste" && <RefreshCw className="w-4 h-4 text-blue-400" />}
                    {tipo === "merma" && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    {MOV_LABELS[tipo]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={movForm.cantidad}
                  onChange={(e) => setMovForm((f) => ({ ...f, cantidad: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Costo unitario</Label>
                <Input
                  type="number"
                  placeholder="Opcional"
                  value={movForm.costo_unitario}
                  onChange={(e) => setMovForm((f) => ({ ...f, costo_unitario: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo / Referencia</Label>
              <Input
                placeholder="Ej: Compra proveedor, Cierre de día..."
                value={movForm.motivo}
                onChange={(e) => setMovForm((f) => ({ ...f, motivo: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMovimiento(false)}>Cancelar</Button>
            <Button onClick={registrarMovimiento} disabled={saving || !movForm.cantidad}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
