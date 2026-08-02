import { redirect } from "next/navigation"
import { getSession, roleHome } from "@/lib/auth"
import { LoginForm } from "./login-form"

export const metadata = {
  title: "Iniciar sesión — Grano & Aroma",
}

export default async function LoginPage() {
  // Si ya hay sesión, ir directo a su panel
  const session = await getSession()
  if (session) redirect(roleHome(session.rol))

  return <LoginForm />
}
