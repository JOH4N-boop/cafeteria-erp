import crypto from "crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

const SECRET = process.env.AUTH_SECRET || "cafeteria-erp-dev-secret-cambiar-en-produccion"
export const COOKIE_NAME = "cafe_sesion"
const MAX_AGE = 60 * 60 * 12 // 12 horas

export type Rol = "admin" | "mesero"

export interface Session {
  userId: number
  username: string
  nombre: string
  rol: Rol
}

// ── Hash de contraseñas (scrypt) ──
export function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const s = salt ?? crypto.randomBytes(16).toString("hex")
  const hash = crypto.scryptSync(password, s, 64).toString("hex")
  return { salt: s, hash }
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  const calc = crypto.scryptSync(password, salt, 64)
  const stored = Buffer.from(hash, "hex")
  return calc.length === stored.length && crypto.timingSafeEqual(calc, stored)
}

// ── Cookie de sesión firmada ──
function firmar(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url")
}

export function signSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
  return `${payload}.${firmar(payload)}`
}

export function verifySession(token: string): Session | null {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  const esperado = firmar(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session
  } catch {
    return null
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE,
}

// ── Utilidades de sesión (server-side) ──
export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySession(token)
}

export function roleHome(rol: Rol): string {
  return rol === "admin" ? "/" : "/mesero"
}

/** Exige una sesión con alguno de los roles indicados; redirige si no cumple. */
export async function requireRole(...roles: Rol[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect("/login")
  if (!roles.includes(session.rol)) redirect(roleHome(session.rol))
  return session
}
