# Backend Rust (Axum + SQLite) — ERP Cafetería I.POS

Reconstrucción del backend del sistema en **Rust**, tal como lo describe la
propuesta del proyecto (backend de alto rendimiento en Rust con framework **Axum**
y base de datos **SQLite** local). Reemplaza por completo las rutas `app/api/**`
y `lib/db.ts` que antes estaban en TypeScript, **sin cambiar la interfaz** ni
perder funcionalidades.

## Qué hace

- Expone todos los endpoints `/api/*` con los **mismos contratos JSON** que
  consumía el frontend Next.js.
- Base de datos **SQLite** local en `.data/cafeteria.db` (archivo), con el mismo
  esquema, el mismo catálogo (unidades, categorías, ingredientes, productos,
  recetas), mesas, usuarios y datos de demostración. El *seed* es idempotente.
- Autenticación por **roles** (admin / mesero):
  - Contraseñas con **scrypt** (N=16384, r=8, p=1, 64 bytes), compatible con el
    hash que usaba el frontend.
  - Cookie de sesión `cafe_sesion` firmada con **HMAC-SHA256** (base64url),
    **byte a byte idéntica** a la que valida `lib/auth.ts` de Next, de modo que
    el *auth-gating* de las páginas sigue funcionando sin cambios.
- Lógica de negocio autoritativa en el servidor:
  - Cálculo de importes e **impoconsumo del 8 %** (`round(base * 0.08)`).
  - **Descuento y reposición de inventario por receta** (merma y porciones),
    dentro de transacciones atómicas.
  - **Correlativos** `P-#####` y `FAC-#####`, y **facturación idempotente**.

## Requisitos

- Rust estable (toolchain MSVC en Windows). SQLite viene embebido con
  `rusqlite` (feature `bundled`); no requiere instalar SQLite aparte.

## Cómo ejecutarlo

Desde la **raíz del repositorio** (para que `.data/` quede junto al frontend):

```bash
# Opción A (recomendada): vía npm, desde la raíz
npm run backend            # cargo run (debug)
npm run backend:release    # cargo run --release (más rápido)

# Opción B: directo con cargo
cargo run --manifest-path backend/Cargo.toml
```

El servidor queda escuchando en `http://127.0.0.1:8080`.

### Variables de entorno

- `CAFE_DB_PATH` — ruta del archivo SQLite (por defecto `.data/cafeteria.db`).
- `PORT` — puerto del backend (por defecto `8080`).
- `AUTH_SECRET` — clave para firmar la cookie de sesión. **Debe ser la misma**
  en el backend y en el frontend (Next). En desarrollo ambos usan el mismo valor
  por defecto. En producción, defínela en los dos.

## Cómo se conecta con el frontend

`next.config.mjs` redirige (proxy) todas las peticiones `/api/*` del navegador a
este backend (`BACKEND_URL`, por defecto `http://127.0.0.1:8080`). Las páginas
Server Component también leen del backend vía `lib/api.ts`. No hay cambios en la
interfaz.

## Usuarios de demostración

| Rol           | Usuario  | Contraseña  |
|---------------|----------|-------------|
| Administrador | `admin`  | `admin123`  |
| Mesero        | `mesero` | `mesero123` |
