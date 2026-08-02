"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  BookOpen,
  ShoppingCart,
  BarChart3,
  Receipt,
  Coffee,
  ChevronRight,
  Bell,
  Menu,
  X,
  LogOut,
} from "lucide-react"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Historial de Ventas",
    href: "/ventas",
    icon: Receipt,
  },
  {
    label: "Inventario",
    href: "/inventario",
    icon: Package,
  },
  {
    label: "Recetas",
    href: "/recetas",
    icon: BookOpen,
  },
  {
    label: "Productos",
    href: "/productos",
    icon: ShoppingCart,
  },
  {
    label: "Reportes",
    href: "/reportes",
    icon: BarChart3,
  },
]

interface ERPLayoutProps {
  children: React.ReactNode
  alertasCount?: number
  userName?: string
}

export function ERPLayout({ children, alertasCount = 0, userName = "Admin" }: ERPLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function cerrarSesion() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  const iniciales = userName.trim().charAt(0).toUpperCase() || "A"

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar flex flex-col transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
            <Coffee className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sidebar-foreground font-semibold text-sm leading-none">Grano & Aroma</p>
            <p className="text-sidebar-foreground/50 text-xs mt-0.5">Gestión Integral</p>
          </div>
          <button
            className="ml-auto text-sidebar-foreground/60 hover:text-sidebar-foreground lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-sidebar-foreground/40 text-xs font-medium uppercase tracking-wider px-3 mb-3">
            Menú Principal
          </p>
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="w-4.5 h-4.5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
              </Link>
            )
          })}
        </nav>

        {/* Footer sidebar */}
        <div className="px-5 py-4 border-t border-sidebar-border">
          <p className="text-sidebar-foreground/30 text-xs">v1.0.0 · SQLite</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-4 gap-4 bg-card shrink-0">
          <button
            className="text-muted-foreground hover:text-foreground lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          {alertasCount > 0 && (
            <Link href="/inventario?alertas=true" className="relative flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-5 h-5" />
              <Badge
                variant="destructive"
                className="absolute -top-1.5 -right-1.5 h-4 w-4 flex items-center justify-center p-0 text-[10px]"
              >
                {alertasCount}
              </Badge>
              <span className="hidden sm:inline text-xs">Stock bajo</span>
            </Link>
          )}

          <div className="flex items-center gap-2.5 pl-3 border-l border-border">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-xs font-semibold">{iniciales}</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-foreground leading-none">{userName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Administrador</p>
            </div>
            <button
              onClick={cerrarSesion}
              title="Cerrar sesión"
              className="ml-1 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Área de contenido */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
