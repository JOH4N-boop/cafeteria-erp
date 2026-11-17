// Cliente HTTP para el backend Rust (Axum + SQLite), usado desde los
// Server Components. Las peticiones del navegador pasan por el rewrite de
// next.config.mjs; estas peticiones del servidor van directo al backend.

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8080"

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, { cache: "no-store" })
  if (!res.ok) throw new Error(`Backend ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

/** Conteo de ingredientes bajo stock mínimo (para el badge de alertas del layout). */
export async function contarAlertas(): Promise<number> {
  try {
    const alertas = await apiGet<unknown[]>("/api/inventario?alertas=true")
    return Array.isArray(alertas) ? alertas.length : 0
  } catch {
    return 0
  }
}
