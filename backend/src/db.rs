//! Capa de base de datos SQLite (rusqlite). Esquema idéntico al de lib/db.ts,
//! helpers para convertir filas a JSON (replicando el comportamiento de better-sqlite3)
//! y la lógica de descuento/reposición de inventario por receta.

use rusqlite::{types::ValueRef, Connection, Row};
use serde_json::{Map, Number, Value};
use std::path::Path;

/// Convierte un f64 a JSON coercionando los valores enteros a entero,
/// igual que hace JavaScript (y por tanto better-sqlite3 + JSON.stringify).
pub fn jnum(f: f64) -> Value {
    if f.is_finite() && f.fract() == 0.0 && f.abs() < 9_007_199_254_740_992.0 {
        Value::Number((f as i64).into())
    } else {
        Number::from_f64(f).map(Value::Number).unwrap_or(Value::Null)
    }
}

/// Convierte un valor SQLite al equivalente JSON que devolvía better-sqlite3.
pub fn jval(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => jnum(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(String::from_utf8_lossy(b).into_owned()),
    }
}

fn row_to_object(row: &Row, cols: &[String]) -> rusqlite::Result<Value> {
    let mut m = Map::new();
    for (i, name) in cols.iter().enumerate() {
        m.insert(name.clone(), jval(row.get_ref(i)?));
    }
    Ok(Value::Object(m))
}

/// Ejecuta una consulta y devuelve todas las filas como arreglo de objetos JSON.
pub fn query_all<P: rusqlite::Params>(
    conn: &Connection,
    sql: &str,
    params: P,
) -> rusqlite::Result<Vec<Value>> {
    let mut stmt = conn.prepare(sql)?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let rows = stmt.query_map(params, |row| row_to_object(row, &cols))?;
    rows.collect()
}

/// Ejecuta una consulta que devuelve a lo sumo una fila.
pub fn query_opt<P: rusqlite::Params>(
    conn: &Connection,
    sql: &str,
    params: P,
) -> rusqlite::Result<Option<Value>> {
    Ok(query_all(conn, sql, params)?.into_iter().next())
}

/// Abre (o crea) la base de datos, aplica el esquema y ejecuta el seed idempotente.
pub fn open(db_path: &str) -> rusqlite::Result<Connection> {
    if let Some(dir) = Path::new(db_path).parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    init_schema(&conn)?;
    crate::seed::seed_all(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS unidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      abreviatura TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL CHECK(tipo IN ('peso','volumen','unidad'))
    );

    CREATE TABLE IF NOT EXISTS ingredientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      unidad_id INTEGER NOT NULL REFERENCES unidades(id),
      stock_actual REAL NOT NULL DEFAULT 0,
      stock_minimo REAL NOT NULL DEFAULT 0,
      costo_unitario REAL NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','salida','ajuste','merma')),
      cantidad REAL NOT NULL,
      costo_unitario REAL,
      motivo TEXT,
      referencia TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      categoria_id INTEGER REFERENCES categorias(id),
      precio_venta REAL NOT NULL DEFAULT 0,
      costo_receta REAL NOT NULL DEFAULT 0,
      imagen_url TEXT,
      disponible INTEGER NOT NULL DEFAULT 1,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL UNIQUE REFERENCES productos(id),
      porciones INTEGER NOT NULL DEFAULT 1,
      instrucciones TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS receta_ingredientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receta_id INTEGER NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      cantidad REAL NOT NULL,
      merma_porcentaje REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      telefono TEXT,
      email TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ordenes_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER REFERENCES proveedores(id),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','recibida','cancelada')),
      total REAL NOT NULL DEFAULT 0,
      notas TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ordenes_compra_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      cantidad REAL NOT NULL,
      costo_unitario REAL NOT NULL,
      subtotal REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER NOT NULL UNIQUE,
      capacidad INTEGER NOT NULL DEFAULT 4,
      activa INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','en_preparacion','listo','entregado','cancelado')),
      tipo TEXT NOT NULL DEFAULT 'local' CHECK(tipo IN ('local','para_llevar','delivery')),
      mesa TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      descuento REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notas TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pedidos_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      notas TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('admin','mesero')),
      nombre TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
      cliente TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      descuento REAL NOT NULL DEFAULT 0,
      impuesto REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      metodo_pago TEXT NOT NULL DEFAULT 'efectivo' CHECK(metodo_pago IN ('efectivo','tarjeta','transferencia','nequi','daviplata')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ingredientes_activo ON ingredientes(activo);
    CREATE INDEX IF NOT EXISTS idx_facturas_pedido ON facturas(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(created_at);
    CREATE INDEX IF NOT EXISTS idx_movimientos_ingrediente ON movimientos_inventario(ingrediente_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_inventario(created_at);
    CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(created_at);
    CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
    CREATE INDEX IF NOT EXISTS idx_pedidos_detalle_pedido ON pedidos_detalle(pedido_id);
    CREATE INDEX IF NOT EXISTS idx_receta_ingredientes_receta ON receta_ingredientes(receta_id);
    CREATE INDEX IF NOT EXISTS idx_receta_ingredientes_ingrediente ON receta_ingredientes(ingrediente_id);
    CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
    "#,
    )
}

// ── Descuento / reposición de inventario por receta ──────────────
// Calcula, para cada línea de un pedido, el consumo de cada ingrediente
// (cantidad de la receta × cantidad pedida, ajustado por merma y porciones).
fn calcular_consumos_pedido(
    conn: &Connection,
    pedido_id: i64,
) -> rusqlite::Result<Vec<(i64, f64)>> {
    let mut items_stmt =
        conn.prepare("SELECT producto_id, cantidad FROM pedidos_detalle WHERE pedido_id = ?")?;
    let items: Vec<(i64, i64)> = items_stmt
        .query_map([pedido_id], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut consumos: Vec<(i64, f64)> = Vec::new();
    for (producto_id, cantidad) in items {
        let receta: Option<(i64, i64)> = conn
            .query_row(
                "SELECT id, porciones FROM recetas WHERE producto_id = ?",
                [producto_id],
                |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
            )
            .ok();
        let Some((receta_id, porciones)) = receta else {
            continue; // producto sin receta: no descuenta inventario
        };
        let porciones = if porciones == 0 { 1 } else { porciones } as f64;

        let mut ing_stmt = conn.prepare(
            "SELECT ingrediente_id, cantidad, merma_porcentaje FROM receta_ingredientes WHERE receta_id = ?",
        )?;
        let ings: Vec<(i64, f64, f64)> = ing_stmt
            .query_map([receta_id], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?, r.get::<_, f64>(2)?))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for (ingrediente_id, cant, merma) in ings {
            let consumo = (cant * (1.0 + merma / 100.0) * cantidad as f64) / porciones;
            consumos.push((ingrediente_id, consumo));
        }
    }
    Ok(consumos)
}

/// Descuenta del inventario los ingredientes consumidos por un pedido.
pub fn descontar_inventario_por_pedido(
    conn: &Connection,
    pedido_id: i64,
    motivo: &str,
) -> rusqlite::Result<()> {
    let consumos = calcular_consumos_pedido(conn, pedido_id)?;
    for (ingrediente_id, cantidad) in consumos {
        conn.execute(
            "UPDATE ingredientes SET stock_actual = stock_actual - ?, updated_at = datetime('now') WHERE id = ?",
            rusqlite::params![cantidad, ingrediente_id],
        )?;
        conn.execute(
            "INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, motivo, referencia) VALUES (?, 'salida', ?, ?, ?)",
            rusqlite::params![ingrediente_id, cantidad, motivo, pedido_id.to_string()],
        )?;
    }
    Ok(())
}

/// Repone en el inventario los ingredientes de un pedido (p.ej. al cancelarlo).
pub fn reponer_inventario_por_pedido(
    conn: &Connection,
    pedido_id: i64,
    motivo: &str,
) -> rusqlite::Result<()> {
    let consumos = calcular_consumos_pedido(conn, pedido_id)?;
    for (ingrediente_id, cantidad) in consumos {
        conn.execute(
            "UPDATE ingredientes SET stock_actual = stock_actual + ?, updated_at = datetime('now') WHERE id = ?",
            rusqlite::params![cantidad, ingrediente_id],
        )?;
        conn.execute(
            "INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, motivo, referencia) VALUES (?, 'entrada', ?, ?, ?)",
            rusqlite::params![ingrediente_id, cantidad, motivo, pedido_id.to_string()],
        )?;
    }
    Ok(())
}
