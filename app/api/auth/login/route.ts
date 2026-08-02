import { NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { verifyPassword, signSession, COOKIE_NAME, cookieOptions, roleHome, type Rol } from "@/lib/auth"

export async function POST(request: Request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña son requeridos" }, { status: 400 })
  }

  const db = getDb()
  const user = db
    .prepare("SELECT * FROM usuarios WHERE username = ? AND activo = 1")
    .get(String(username).trim().toLowerCase()) as
    | { id: number; username: string; nombre: string; rol: Rol; salt: string; password_hash: string }
    | undefined

  if (!user || !verifyPassword(String(password), user.salt, user.password_hash)) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 })
  }

  const token = signSession({ userId: user.id, username: user.username, nombre: user.nombre, rol: user.rol })
  const redirect = roleHome(user.rol)

  const res = NextResponse.json({ ok: true, rol: user.rol, nombre: user.nombre, redirect })
  res.cookies.set(COOKIE_NAME, token, cookieOptions)
  return res
}
