"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Coffee, Lock, User, LoaderCircle, ShieldCheck, ConciergeBell } from "lucide-react"

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar sesión")
        setLoading(false)
        return
      }
      router.push(data.redirect || "/")
      router.refresh()
    } catch {
      setError("Error de conexión")
      setLoading(false)
    }
  }

  function usar(u: string, p: string) {
    setUsername(u)
    setPassword(p)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#2b2320] via-[#231e1a] to-[#141110] p-4">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/40 mb-3">
            <Coffee className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Grano & Aroma</h1>
          <p className="text-sm text-amber-200/60">Gestión integral para cafeterías</p>
        </div>

        {/* Tarjeta */}
        <form
          onSubmit={submit}
          className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-amber-100/70 mb-1.5 block">Usuario</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin o mesero"
                className="w-full h-11 pl-10 pr-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm outline-none focus:border-amber-400/60 focus:bg-white/10 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-amber-100/70 mb-1.5 block">Contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-200/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full h-11 pl-10 pr-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/25 text-sm outline-none focus:border-amber-400/60 focus:bg-white/10 transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full h-11 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-900/30"
          >
            {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : null}
            Ingresar
          </button>

          {/* Accesos demo */}
          <div className="pt-2 border-t border-white/10">
            <p className="text-[11px] text-amber-100/40 text-center mb-2">Cuentas de demostración</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => usar("admin", "admin123")}
                className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-left hover:bg-white/10 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Administrador</p>
                  <p className="text-[10px] text-white/40">admin / admin123</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => usar("mesero", "mesero123")}
                className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-left hover:bg-white/10 transition-colors"
              >
                <ConciergeBell className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white">Mesero</p>
                  <p className="text-[10px] text-white/40">mesero / mesero123</p>
                </div>
              </button>
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-white/20 mt-6">Grano & Aroma · v1.0.0</p>
      </div>
    </div>
  )
}
