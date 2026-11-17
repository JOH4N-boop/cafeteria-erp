//! Handlers HTTP: replican uno a uno los Route Handlers de app/api/** del frontend.

use axum::{
    extract::{Path, Query, State},
    http::{header::SET_COOKIE, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Json, Router,
};
use chrono::{Duration, Utc};
use rusqlite::{params, params_from_iter, Connection};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::auth;
use crate::db::{self, jnum, query_all, query_opt};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/dashboard", get(dashboard))
        .route("/api/pedidos", get(pedidos_get).post(pedidos_post))
        .route("/api/pedidos/{id}", patch(pedido_patch).delete(pedido_delete))
        .route("/api/facturas", get(facturas_get).post(facturas_post))
        .route("/api/inventario", get(inventario_get).post(inventario_post))
        .route(
            "/api/inventario/movimientos",
            get(movimientos_get).post(movimientos_post),
        )
        .route(
            "/api/inventario/{id}",
            get(inventario_id_get).put(inventario_put).delete(inventario_delete),
        )
        .route("/api/productos", get(productos_get))
        .route("/api/recetas", get(recetas_get).post(recetas_post))
        .route("/api/reportes", get(reportes_get))
        .route("/api/ventas", get(ventas_get))
        .route("/api/mesas", get(mesas_get))
        .route("/api/unidades", get(unidades_get))
        .with_state(state)
}

// ── Utilidades ──────────────────────────────────────────────
pub struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}
fn err(status: StatusCode, msg: &str) -> ApiError {
    ApiError(status, msg.to_string())
}
fn ise<E: std::fmt::Display>(e: E) -> ApiError {
    ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
type R = Result<Response, ApiError>;

fn parse_digits(s: &str) -> i64 {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().unwrap_or(0)
}
fn vstr(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}
fn vf64(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| x.as_f64())
}
fn vi64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64())
}
fn json_array(rows: Vec<Value>) -> Response {
    Json(Value::Array(rows)).into_response()
}

// ── Autenticación ───────────────────────────────────────────
async fn login(State(st): State<AppState>, Json(body): Json<Value>) -> R {
    let username = vstr(&body, "username").unwrap_or_default();
    let password = vstr(&body, "password").unwrap_or_default();
    if username.is_empty() || password.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Usuario y contraseña son requeridos"));
    }
    let conn = st.db.lock().unwrap();
    let uname = username.trim().to_lowercase();
    let user = conn
        .query_row(
            "SELECT id, username, nombre, rol, salt, password_hash FROM usuarios WHERE username = ? AND activo = 1",
            params![uname],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, String>(5)?,
                ))
            },
        )
        .ok();

    let Some((id, uname2, nombre, rol, salt, hash)) = user else {
        return Err(err(StatusCode::UNAUTHORIZED, "Usuario o contraseña incorrectos"));
    };
    if !auth::verify_password(&password, &salt, &hash) {
        return Err(err(StatusCode::UNAUTHORIZED, "Usuario o contraseña incorrectos"));
    }

    let session = auth::Session {
        user_id: id,
        username: uname2,
        nombre: nombre.clone(),
        rol: rol.clone(),
    };
    let token = auth::sign_session(&session);
    let redirect = auth::role_home(&rol);
    let payload = json!({ "ok": true, "rol": rol, "nombre": nombre, "redirect": redirect });
    let mut resp = Json(payload).into_response();
    resp.headers_mut()
        .insert(SET_COOKIE, auth::session_cookie(&token).parse().unwrap());
    Ok(resp)
}

async fn logout() -> R {
    let mut resp = Json(json!({ "ok": true })).into_response();
    resp.headers_mut()
        .insert(SET_COOKIE, auth::clear_cookie().parse().unwrap());
    Ok(resp)
}

// ── Dashboard ───────────────────────────────────────────────
async fn dashboard(State(st): State<AppState>) -> R {
    let conn = st.db.lock().unwrap();
    let hoy = Utc::now().format("%Y-%m-%d").to_string();
    let ayer = (Utc::now() - Duration::days(1)).format("%Y-%m-%d").to_string();

    let (ped_hoy, tot_hoy): (i64, f64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(total),0) FROM pedidos WHERE estado = 'entregado' AND date(created_at) = ?",
            params![hoy],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(ise)?;
    let (ped_ayer, tot_ayer): (i64, f64) = conn
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(total),0) FROM pedidos WHERE estado = 'entregado' AND date(created_at) = ?",
            params![ayer],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(ise)?;

    let ventas_diarias = query_all(
        &conn,
        "SELECT date(created_at) as fecha, COUNT(*) as pedidos, COALESCE(SUM(total),0) as total \
         FROM pedidos WHERE estado = 'entregado' AND created_at >= datetime('now', '-30 days') \
         GROUP BY date(created_at) ORDER BY fecha",
        [],
    )
    .map_err(ise)?;

    let top_productos = query_all(
        &conn,
        "SELECT p.nombre, SUM(pd.cantidad) as unidades, SUM(pd.subtotal) as revenue \
         FROM pedidos_detalle pd JOIN productos p ON pd.producto_id = p.id JOIN pedidos pe ON pd.pedido_id = pe.id \
         WHERE pe.estado = 'entregado' AND pe.created_at >= datetime('now', '-30 days') \
         GROUP BY pd.producto_id ORDER BY unidades DESC LIMIT 8",
        [],
    )
    .map_err(ise)?;

    let ventas_categorias = query_all(
        &conn,
        "SELECT c.nombre as categoria, SUM(pd.subtotal) as total \
         FROM pedidos_detalle pd JOIN productos p ON pd.producto_id = p.id JOIN categorias c ON p.categoria_id = c.id \
         JOIN pedidos pe ON pd.pedido_id = pe.id WHERE pe.estado = 'entregado' AND pe.created_at >= datetime('now', '-30 days') \
         GROUP BY c.id ORDER BY total DESC",
        [],
    )
    .map_err(ise)?;

    let alertas_stock = query_all(
        &conn,
        "SELECT i.nombre, i.stock_actual, i.stock_minimo, u.abreviatura \
         FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id \
         WHERE i.activo = 1 AND i.stock_actual <= i.stock_minimo \
         ORDER BY (i.stock_actual / NULLIF(i.stock_minimo,0))",
        [],
    )
    .map_err(ise)?;

    let pendientes: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pedidos WHERE estado IN ('pendiente','en_preparacion')",
            [],
            |r| r.get(0),
        )
        .map_err(ise)?;

    let costo_vs_revenue = query_all(
        &conn,
        "SELECT date(pe.created_at) as fecha, COALESCE(SUM(pe.total),0) as revenue, \
                COALESCE(SUM(p.costo_receta * pd.cantidad),0) as costo \
         FROM pedidos pe JOIN pedidos_detalle pd ON pd.pedido_id = pe.id JOIN productos p ON pd.producto_id = p.id \
         WHERE pe.estado = 'entregado' AND pe.created_at >= datetime('now', '-7 days') \
         GROUP BY date(pe.created_at) ORDER BY fecha",
        [],
    )
    .map_err(ise)?;

    let (valor_inv, total_ing): (f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(stock_actual * costo_unitario),0), COUNT(*) FROM ingredientes WHERE activo=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(ise)?;

    let out = json!({
        "kpis": {
            "ventasHoy": jnum(tot_hoy),
            "pedidosHoy": ped_hoy,
            "ventasAyer": jnum(tot_ayer),
            "pedidosAyer": ped_ayer,
            "pedidosPendientes": pendientes,
            "alertasStock": alertas_stock.len(),
            "valorInventario": jnum(valor_inv),
            "totalIngredientes": total_ing,
        },
        "ventasDiarias": ventas_diarias,
        "topProductos": top_productos,
        "ventasCategorias": ventas_categorias,
        "alertasStock": alertas_stock,
        "costoVsRevenue": costo_vs_revenue,
    });
    Ok(Json(out).into_response())
}

// ── Pedidos ─────────────────────────────────────────────────
async fn pedidos_get(State(st): State<AppState>, Query(q): Query<HashMap<String, String>>) -> R {
    let conn = st.db.lock().unwrap();
    let todos = q.get("todos").map(|v| v == "true").unwrap_or(false);
    let where_ = if todos {
        ""
    } else {
        "WHERE p.estado IN ('pendiente','en_preparacion','listo')"
    };
    let sql = format!(
        "SELECT p.*, (SELECT COUNT(*) FROM facturas f WHERE f.pedido_id = p.id) as facturado \
         FROM pedidos p {where_} ORDER BY p.created_at DESC LIMIT 100"
    );
    let mut pedidos = query_all(&conn, &sql, []).map_err(ise)?;
    for ped in pedidos.iter_mut() {
        let id = ped.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let items = query_all(
            &conn,
            "SELECT pd.*, pr.nombre as producto_nombre FROM pedidos_detalle pd \
             JOIN productos pr ON pd.producto_id = pr.id WHERE pd.pedido_id = ?",
            params![id],
        )
        .map_err(ise)?;
        if let Some(obj) = ped.as_object_mut() {
            obj.insert("items".into(), Value::Array(items));
        }
    }
    Ok(json_array(pedidos))
}

async fn pedidos_post(State(st): State<AppState>, Json(body): Json<Value>) -> R {
    let items = body.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    if items.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "El pedido debe tener al menos un producto"));
    }
    let tipo = vstr(&body, "tipo").unwrap_or_else(|| "local".to_string());
    let mesa = vstr(&body, "mesa");
    let descuento = vf64(&body, "descuento").unwrap_or(0.0);
    let notas = vstr(&body, "notas");

    let mut guard = st.db.lock().unwrap();
    let tx = guard.transaction().map_err(ise)?;

    let last: Option<String> = tx
        .query_row("SELECT numero FROM pedidos ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .ok();
    let last_num = last.map(|s| parse_digits(&s)).unwrap_or(1000);
    let numero = format!("P-{:05}", last_num + 1);

    let mut subtotal = 0.0f64;
    let mut lineas: Vec<(i64, f64, f64, Option<String>)> = Vec::new();
    for it in &items {
        let Some(pid) = vi64(it, "producto_id") else { continue };
        let precio: Option<f64> = tx
            .query_row("SELECT precio_venta FROM productos WHERE id = ?", params![pid], |r| r.get(0))
            .ok();
        let Some(precio) = precio else { continue };
        let cantidad = vf64(it, "cantidad").unwrap_or(1.0).max(1.0);
        subtotal += precio * cantidad;
        lineas.push((pid, cantidad, precio, vstr(it, "notas")));
    }

    let desc = descuento.max(0.0);
    let total = (subtotal - desc).max(0.0);

    tx.execute(
        "INSERT INTO pedidos (numero, estado, tipo, mesa, subtotal, descuento, total, notas) \
         VALUES (?, 'pendiente', ?, ?, ?, ?, ?, ?)",
        params![numero, tipo, mesa, subtotal, desc, total, notas],
    )
    .map_err(ise)?;
    let pedido_id = tx.last_insert_rowid();

    for (pid, cantidad, precio, lnotas) in &lineas {
        tx.execute(
            "INSERT INTO pedidos_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal, notas) \
             VALUES (?, ?, ?, ?, ?, ?)",
            params![pedido_id, pid, cantidad, precio, precio * cantidad, lnotas],
        )
        .map_err(ise)?;
    }

    db::descontar_inventario_por_pedido(&tx, pedido_id, &format!("Venta pedido {numero}")).map_err(ise)?;
    tx.commit().map_err(ise)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "success": true, "id": pedido_id, "numero": numero, "total": jnum(total) })),
    )
        .into_response())
}

const ESTADOS_VALIDOS: &[&str] = &["pendiente", "en_preparacion", "listo", "entregado", "cancelado"];

async fn pedido_patch(State(st): State<AppState>, Path(id): Path<String>, Json(body): Json<Value>) -> R {
    let estado = vstr(&body, "estado").unwrap_or_default();
    if !ESTADOS_VALIDOS.contains(&estado.as_str()) {
        return Err(err(StatusCode::BAD_REQUEST, "Estado inválido"));
    }
    let conn = st.db.lock().unwrap();
    let existe: Option<i64> = conn
        .query_row("SELECT id FROM pedidos WHERE id = ?", params![id], |r| r.get(0))
        .ok();
    if existe.is_none() {
        return Err(err(StatusCode::NOT_FOUND, "Pedido no encontrado"));
    }
    conn.execute(
        "UPDATE pedidos SET estado = ?, updated_at = datetime('now') WHERE id = ?",
        params![estado, id],
    )
    .map_err(ise)?;
    Ok(Json(json!({ "success": true })).into_response())
}

async fn pedido_delete(State(st): State<AppState>, Path(id): Path<String>) -> R {
    let mut guard = st.db.lock().unwrap();
    let pedido: Option<(i64, String, String)> = guard
        .query_row(
            "SELECT id, numero, estado FROM pedidos WHERE id = ?",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let Some((pid, numero, estado)) = pedido else {
        return Err(err(StatusCode::NOT_FOUND, "Pedido no encontrado"));
    };

    if estado != "cancelado" {
        let tx = guard.transaction().map_err(ise)?;
        tx.execute(
            "UPDATE pedidos SET estado = 'cancelado', updated_at = datetime('now') WHERE id = ?",
            params![pid],
        )
        .map_err(ise)?;
        db::reponer_inventario_por_pedido(&tx, pid, &format!("Cancelación pedido {numero}")).map_err(ise)?;
        tx.commit().map_err(ise)?;
    }
    Ok(Json(json!({ "success": true })).into_response())
}

// ── Facturas ────────────────────────────────────────────────
const IVA: f64 = 0.08;

async fn facturas_get(State(st): State<AppState>) -> R {
    let conn = st.db.lock().unwrap();
    let facturas = query_all(
        &conn,
        "SELECT f.*, p.numero as pedido_numero, p.mesa, p.tipo FROM facturas f \
         JOIN pedidos p ON f.pedido_id = p.id ORDER BY f.created_at DESC LIMIT 50",
        [],
    )
    .map_err(ise)?;
    Ok(json_array(facturas))
}

async fn facturas_post(State(st): State<AppState>, Json(body): Json<Value>) -> R {
    let pedido_id = vi64(&body, "pedido_id");
    let Some(pedido_id) = pedido_id else {
        return Err(err(StatusCode::BAD_REQUEST, "pedido_id es requerido"));
    };
    let cliente = vstr(&body, "cliente");
    let metodo_pago = vstr(&body, "metodo_pago").unwrap_or_else(|| "efectivo".to_string());

    let mut guard = st.db.lock().unwrap();
    let tx = guard.transaction().map_err(ise)?;

    let pedido: Option<(f64, f64, String)> = tx
        .query_row(
            "SELECT subtotal, descuento, estado FROM pedidos WHERE id = ?",
            params![pedido_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let Some((subtotal, descuento, _estado)) = pedido else {
        return Err(err(StatusCode::NOT_FOUND, "Pedido no encontrado"));
    };

    // Idempotencia: si ya está facturado, devolver la factura existente
    let existente: Option<(i64, String)> = tx
        .query_row(
            "SELECT id, numero FROM facturas WHERE pedido_id = ?",
            params![pedido_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    if let Some((fid, fnum)) = existente {
        tx.commit().map_err(ise)?;
        return Ok((
            StatusCode::CREATED,
            Json(json!({ "success": true, "id": fid, "numero": fnum, "yaFacturado": true })),
        )
            .into_response());
    }

    let last: Option<String> = tx
        .query_row("SELECT numero FROM facturas ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .ok();
    let last_num = last.map(|s| parse_digits(&s)).unwrap_or(0);
    let numero = format!("FAC-{:05}", last_num + 1);

    let base = subtotal - descuento;
    let impuesto = (base * IVA).round();
    let total = base + impuesto;

    tx.execute(
        "INSERT INTO facturas (numero, pedido_id, cliente, subtotal, descuento, impuesto, total, metodo_pago) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![numero, pedido_id, cliente, subtotal, descuento, impuesto, total, metodo_pago],
    )
    .map_err(ise)?;
    let factura_id = tx.last_insert_rowid();

    tx.execute(
        "UPDATE pedidos SET estado = 'entregado', updated_at = datetime('now') WHERE id = ?",
        params![pedido_id],
    )
    .map_err(ise)?;
    tx.commit().map_err(ise)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "id": factura_id,
            "numero": numero,
            "total": jnum(total),
            "impuesto": jnum(impuesto),
        })),
    )
        .into_response())
}

// ── Inventario ──────────────────────────────────────────────
async fn inventario_get(State(st): State<AppState>, Query(q): Query<HashMap<String, String>>) -> R {
    let conn = st.db.lock().unwrap();
    let search = q.get("search").cloned().unwrap_or_default();
    let alertas = q.get("alertas").map(|v| v == "true").unwrap_or(false);

    let mut sql = String::from(
        "SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev, \
         (i.stock_actual <= i.stock_minimo) as bajo_stock \
         FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id WHERE i.activo = 1",
    );
    let mut parms: Vec<String> = Vec::new();
    if !search.is_empty() {
        sql.push_str(" AND i.nombre LIKE ?");
        parms.push(format!("%{search}%"));
    }
    if alertas {
        sql.push_str(" AND i.stock_actual <= i.stock_minimo");
    }
    sql.push_str(" ORDER BY i.nombre");

    let rows = query_all(&conn, &sql, params_from_iter(parms.iter())).map_err(ise)?;
    Ok(json_array(rows))
}

async fn inventario_post(State(st): State<AppState>, Json(body): Json<Value>) -> R {
    let nombre = vstr(&body, "nombre").unwrap_or_default();
    let unidad_id = vi64(&body, "unidad_id");
    if nombre.is_empty() || unidad_id.is_none() {
        return Err(err(StatusCode::BAD_REQUEST, "Nombre y unidad son requeridos"));
    }
    let unidad_id = unidad_id.unwrap();
    let descripcion = vstr(&body, "descripcion");
    let stock_minimo = vf64(&body, "stock_minimo").unwrap_or(0.0);
    let costo_unitario = vf64(&body, "costo_unitario").unwrap_or(0.0);

    let conn = st.db.lock().unwrap();
    conn.execute(
        "INSERT INTO ingredientes (nombre, descripcion, unidad_id, stock_minimo, costo_unitario) VALUES (?, ?, ?, ?, ?)",
        params![nombre, descripcion, unidad_id, stock_minimo, costo_unitario],
    )
    .map_err(ise)?;
    let id = conn.last_insert_rowid();
    let nuevo = query_opt(
        &conn,
        "SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev \
         FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id WHERE i.id = ?",
        params![id],
    )
    .map_err(ise)?
    .unwrap_or(Value::Null);
    Ok((StatusCode::CREATED, Json(nuevo)).into_response())
}

async fn inventario_id_get(State(st): State<AppState>, Path(id): Path<String>) -> R {
    let conn = st.db.lock().unwrap();
    let ing = query_opt(
        &conn,
        "SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev \
         FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id WHERE i.id = ? AND i.activo = 1",
        params![id],
    )
    .map_err(ise)?;
    match ing {
        Some(v) => Ok(Json(v).into_response()),
        None => Err(err(StatusCode::NOT_FOUND, "No encontrado")),
    }
}

async fn inventario_put(State(st): State<AppState>, Path(id): Path<String>, Json(body): Json<Value>) -> R {
    let conn = st.db.lock().unwrap();
    let nombre = vstr(&body, "nombre");
    let descripcion = vstr(&body, "descripcion");
    let unidad_id = vi64(&body, "unidad_id");
    let stock_actual = vf64(&body, "stock_actual");
    let stock_minimo = vf64(&body, "stock_minimo");
    let costo_unitario = vf64(&body, "costo_unitario");

    conn.execute(
        "UPDATE ingredientes SET nombre=?, descripcion=?, unidad_id=?, stock_actual=?, stock_minimo=?, costo_unitario=?, updated_at=datetime('now') WHERE id=?",
        params![nombre, descripcion, unidad_id, stock_actual, stock_minimo, costo_unitario, id],
    )
    .map_err(ise)?;

    let updated = query_opt(
        &conn,
        "SELECT i.*, u.nombre as unidad_nombre, u.abreviatura as unidad_abrev \
         FROM ingredientes i JOIN unidades u ON i.unidad_id = u.id WHERE i.id = ?",
        params![id],
    )
    .map_err(ise)?
    .unwrap_or(Value::Null);
    Ok(Json(updated).into_response())
}

async fn inventario_delete(State(st): State<AppState>, Path(id): Path<String>) -> R {
    let conn = st.db.lock().unwrap();
    conn.execute("UPDATE ingredientes SET activo = 0 WHERE id = ?", params![id])
        .map_err(ise)?;
    Ok(Json(json!({ "success": true })).into_response())
}

// ── Movimientos de inventario ───────────────────────────────
async fn movimientos_get(State(st): State<AppState>, Query(q): Query<HashMap<String, String>>) -> R {
    let conn = st.db.lock().unwrap();
    let ingrediente_id = q.get("ingrediente_id").cloned();
    let limit: i64 = q.get("limit").and_then(|v| v.parse().ok()).unwrap_or(50);

    let mut sql = String::from(
        "SELECT m.*, i.nombre as ingrediente_nombre, u.abreviatura as unidad \
         FROM movimientos_inventario m JOIN ingredientes i ON m.ingrediente_id = i.id JOIN unidades u ON i.unidad_id = u.id",
    );
    let rows = if let Some(ing) = ingrediente_id {
        sql.push_str(" WHERE m.ingrediente_id = ? ORDER BY m.created_at DESC LIMIT ?");
        query_all(&conn, &sql, params![ing, limit]).map_err(ise)?
    } else {
        sql.push_str(" ORDER BY m.created_at DESC LIMIT ?");
        query_all(&conn, &sql, params![limit]).map_err(ise)?
    };
    Ok(json_array(rows))
}

async fn movimientos_post(State(st): State<AppState>, Json(body): Json<Value>) -> R {
    let ingrediente_id = vi64(&body, "ingrediente_id");
    let tipo = vstr(&body, "tipo");
    let cantidad = vf64(&body, "cantidad");
    if ingrediente_id.is_none() || tipo.is_none() || cantidad.is_none() {
        return Err(err(
            StatusCode::BAD_REQUEST,
            "Campos requeridos: ingrediente_id, tipo, cantidad",
        ));
    }
    let ingrediente_id = ingrediente_id.unwrap();
    let tipo = tipo.unwrap();
    let cantidad = cantidad.unwrap();
    let costo_unitario = vf64(&body, "costo_unitario");
    let motivo = vstr(&body, "motivo");

    let ajuste = if tipo == "entrada" { cantidad } else { -cantidad.abs() };

    let mut guard = st.db.lock().unwrap();
    let tx = guard.transaction().map_err(ise)?;
    tx.execute(
        "UPDATE ingredientes SET stock_actual = stock_actual + ?, updated_at = datetime('now') WHERE id = ?",
        params![ajuste, ingrediente_id],
    )
    .map_err(ise)?;
    tx.execute(
        "INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, costo_unitario, motivo) VALUES (?, ?, ?, ?, ?)",
        params![ingrediente_id, tipo, cantidad, costo_unitario, motivo],
    )
    .map_err(ise)?;
    let id = tx.last_insert_rowid();
    tx.commit().map_err(ise)?;

    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": id }))).into_response())
}

// ── Productos ───────────────────────────────────────────────
async fn productos_get(State(st): State<AppState>, Query(q): Query<HashMap<String, String>>) -> R {
    let conn = st.db.lock().unwrap();
    // ?full=1 agrega receta_id y el orden por categoría (lo usa la página SSR de productos).
    let sql = if q.contains_key("full") {
        "SELECT p.*, c.nombre as categoria_nombre, r.id as receta_id \
         FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id \
         LEFT JOIN recetas r ON r.producto_id = p.id \
         WHERE p.activo = 1 ORDER BY c.nombre, p.nombre"
    } else {
        "SELECT p.*, c.nombre as categoria_nombre FROM productos p \
         LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.activo = 1 ORDER BY p.nombre"
    };
    let rows = query_all(&conn, sql, []).map_err(ise)?;
    Ok(json_array(rows))
}

// ── Recetas ─────────────────────────────────────────────────
async fn recetas_get(State(st): State<AppState>) -> R {
    let conn = st.db.lock().unwrap();
    let mut recetas = query_all(
        &conn,
        "SELECT r.*, p.nombre as producto_nombre, p.precio_venta, p.categoria_id, c.nombre as categoria_nombre \
         FROM recetas r JOIN productos p ON r.producto_id = p.id LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.nombre",
        [],
    )
    .map_err(ise)?;

    for rec in recetas.iter_mut() {
        let id = rec.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let ingredientes = query_all(
            &conn,
            "SELECT ri.*, i.nombre as ingrediente_nombre, u.abreviatura as unidad, \
                    (ri.cantidad * i.costo_unitario * (1 + ri.merma_porcentaje / 100.0)) as costo_linea \
             FROM receta_ingredientes ri JOIN ingredientes i ON ri.ingrediente_id = i.id JOIN unidades u ON i.unidad_id = u.id \
             WHERE ri.receta_id = ?",
            params![id],
        )
        .map_err(ise)?;

        let costo_total: f64 = ingredientes
            .iter()
            .map(|i| i.get("costo_linea").and_then(|v| v.as_f64()).unwrap_or(0.0))
            .sum();
        let precio_venta = rec.get("precio_venta").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let margen = if precio_venta > 0.0 {
            (precio_venta - costo_total) / precio_venta * 100.0
        } else {
            0.0
        };
        if let Some(obj) = rec.as_object_mut() {
            obj.insert("ingredientes".into(), Value::Array(ingredientes));
            obj.insert("costo_total".into(), jnum(costo_total));
            obj.insert("margen".into(), jnum(margen));
        }
    }
    Ok(json_array(recetas))
}

async fn recetas_post(State(st): State<AppState>, Json(body): Json<Value>) -> R {
    let producto_id = vi64(&body, "producto_id");
    let Some(producto_id) = producto_id else {
        return Err(err(StatusCode::BAD_REQUEST, "producto_id es requerido"));
    };
    let instrucciones = vstr(&body, "instrucciones");
    let porciones = vi64(&body, "porciones").unwrap_or(1);
    let ingredientes = body.get("ingredientes").and_then(|v| v.as_array()).cloned();

    let mut guard = st.db.lock().unwrap();
    let tx = guard.transaction().map_err(ise)?;

    let existing: Option<i64> = tx
        .query_row("SELECT id FROM recetas WHERE producto_id = ?", params![producto_id], |r| r.get(0))
        .ok();
    if let Some(eid) = existing {
        tx.execute("DELETE FROM receta_ingredientes WHERE receta_id = ?", params![eid]).map_err(ise)?;
        tx.execute("DELETE FROM recetas WHERE id = ?", params![eid]).map_err(ise)?;
    }

    tx.execute(
        "INSERT INTO recetas (producto_id, instrucciones, porciones) VALUES (?, ?, ?)",
        params![producto_id, instrucciones, porciones],
    )
    .map_err(ise)?;
    let receta_id = tx.last_insert_rowid();

    if let Some(ings) = ingredientes {
        for ing in &ings {
            let iid = vi64(ing, "ingrediente_id");
            let cantidad = vf64(ing, "cantidad");
            if let (Some(iid), Some(cantidad)) = (iid, cantidad) {
                let merma = vf64(ing, "merma_porcentaje").unwrap_or(0.0);
                tx.execute(
                    "INSERT INTO receta_ingredientes (receta_id, ingrediente_id, cantidad, merma_porcentaje) VALUES (?, ?, ?, ?)",
                    params![receta_id, iid, cantidad, merma],
                )
                .map_err(ise)?;
            }
        }
        let costo: f64 = tx
            .query_row(
                "SELECT COALESCE(SUM(ri.cantidad * i.costo_unitario * (1 + ri.merma_porcentaje / 100.0)), 0) \
                 FROM receta_ingredientes ri JOIN ingredientes i ON ri.ingrediente_id = i.id WHERE ri.receta_id = ?",
                params![receta_id],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        tx.execute("UPDATE productos SET costo_receta = ? WHERE id = ?", params![costo, producto_id])
            .map_err(ise)?;
    }

    tx.commit().map_err(ise)?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": receta_id }))).into_response())
}

// ── Reportes ────────────────────────────────────────────────
async fn reportes_get(State(st): State<AppState>, Query(q): Query<HashMap<String, String>>) -> R {
    let conn = st.db.lock().unwrap();
    let dias: i64 = q.get("periodo").and_then(|v| v.parse().ok()).unwrap_or(30);
    let rango = format!("-{dias} days");

    let resumen_obj = query_opt(
        &conn,
        "SELECT COUNT(*) as total_pedidos, \
                COUNT(CASE WHEN estado = 'entregado' THEN 1 END) as pedidos_completados, \
                COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as pedidos_cancelados, \
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total END), 0) as revenue_total, \
                COALESCE(AVG(CASE WHEN estado = 'entregado' THEN total END), 0) as ticket_promedio, \
                COALESCE(SUM(CASE WHEN estado = 'entregado' THEN descuento END), 0) as descuentos_total \
         FROM pedidos WHERE created_at >= datetime('now', ?)",
        params![rango],
    )
    .map_err(ise)?
    .unwrap_or_else(|| json!({}));

    let costo: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(p.costo_receta * pd.cantidad), 0) FROM pedidos pe \
             JOIN pedidos_detalle pd ON pd.pedido_id = pe.id JOIN productos p ON pd.producto_id = p.id \
             WHERE pe.estado = 'entregado' AND pe.created_at >= datetime('now', ?)",
            params![rango],
            |r| r.get(0),
        )
        .map_err(ise)?;

    let ventas_por_semana = query_all(
        &conn,
        "SELECT strftime('%Y-W%W', created_at) as semana, COUNT(*) as pedidos, COALESCE(SUM(total), 0) as revenue \
         FROM pedidos WHERE estado = 'entregado' AND created_at >= datetime('now', ?) \
         GROUP BY strftime('%Y-W%W', created_at) ORDER BY semana",
        params![rango],
    )
    .map_err(ise)?;

    let rentabilidad = query_all(
        &conn,
        "SELECT p.nombre, c.nombre as categoria, SUM(pd.cantidad) as unidades, SUM(pd.subtotal) as revenue, \
                SUM(p.costo_receta * pd.cantidad) as costo, \
                SUM(pd.subtotal) - SUM(p.costo_receta * pd.cantidad) as ganancia, \
                CASE WHEN SUM(pd.subtotal) > 0 THEN (SUM(pd.subtotal) - SUM(p.costo_receta * pd.cantidad)) / SUM(pd.subtotal) * 100 ELSE 0 END as margen \
         FROM pedidos_detalle pd JOIN productos p ON pd.producto_id = p.id LEFT JOIN categorias c ON p.categoria_id = c.id \
         JOIN pedidos pe ON pd.pedido_id = pe.id WHERE pe.estado = 'entregado' AND pe.created_at >= datetime('now', ?) \
         GROUP BY pd.producto_id ORDER BY ganancia DESC",
        params![rango],
    )
    .map_err(ise)?;

    let ventas_tipo = query_all(
        &conn,
        "SELECT tipo, COUNT(*) as pedidos, COALESCE(SUM(total), 0) as revenue FROM pedidos \
         WHERE estado = 'entregado' AND created_at >= datetime('now', ?) GROUP BY tipo",
        params![rango],
    )
    .map_err(ise)?;

    let movimientos = query_all(
        &conn,
        "SELECT m.*, i.nombre as ingrediente_nombre, u.abreviatura as unidad FROM movimientos_inventario m \
         JOIN ingredientes i ON m.ingrediente_id = i.id JOIN unidades u ON i.unidad_id = u.id \
         WHERE m.created_at >= datetime('now', ?) ORDER BY m.created_at DESC LIMIT 20",
        params![rango],
    )
    .map_err(ise)?;

    let revenue_total = resumen_obj.get("revenue_total").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mut resumen: Map<String, Value> = resumen_obj.as_object().cloned().unwrap_or_default();
    resumen.insert("costo_total".into(), jnum(costo));
    resumen.insert("ganancia_bruta".into(), jnum(revenue_total - costo));
    resumen.insert(
        "margen_bruto".into(),
        jnum(if revenue_total > 0.0 {
            (revenue_total - costo) / revenue_total * 100.0
        } else {
            0.0
        }),
    );

    let out = json!({
        "periodo": dias,
        "resumen": Value::Object(resumen),
        "ventasPorSemana": ventas_por_semana,
        "rentabilidadProductos": rentabilidad,
        "ventasTipo": ventas_tipo,
        "movimientos": movimientos,
    });
    Ok(Json(out).into_response())
}

// ── Ventas (historial de facturas) ──────────────────────────
async fn ventas_get(State(st): State<AppState>, Query(q): Query<HashMap<String, String>>) -> R {
    let conn = st.db.lock().unwrap();
    let qstr = q.get("q").map(|s| s.trim().to_string()).unwrap_or_default();

    let (sql, parms): (String, Vec<String>) = if qstr.is_empty() {
        (
            "SELECT f.*, p.numero as pedido_numero, p.mesa, p.tipo FROM facturas f \
             JOIN pedidos p ON f.pedido_id = p.id ORDER BY f.created_at DESC LIMIT 200"
                .to_string(),
            vec![],
        )
    } else {
        let like = format!("%{qstr}%");
        (
            "SELECT f.*, p.numero as pedido_numero, p.mesa, p.tipo FROM facturas f \
             JOIN pedidos p ON f.pedido_id = p.id \
             WHERE f.numero LIKE ? OR p.numero LIKE ? OR f.cliente LIKE ? ORDER BY f.created_at DESC LIMIT 200"
                .to_string(),
            vec![like.clone(), like.clone(), like],
        )
    };

    let mut facturas = query_all(&conn, &sql, params_from_iter(parms.iter())).map_err(ise)?;
    for fac in facturas.iter_mut() {
        let pedido_id = fac.get("pedido_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let items = query_all(
            &conn,
            "SELECT pd.cantidad, pd.precio_unitario, pd.subtotal, pd.notas, pr.nombre as producto_nombre \
             FROM pedidos_detalle pd JOIN productos pr ON pd.producto_id = pr.id WHERE pd.pedido_id = ? ORDER BY pd.id",
            params![pedido_id],
        )
        .map_err(ise)?;
        if let Some(obj) = fac.as_object_mut() {
            obj.insert("items".into(), Value::Array(items));
        }
    }
    Ok(json_array(facturas))
}

// ── Mesas / Unidades ────────────────────────────────────────
async fn mesas_get(State(st): State<AppState>) -> R {
    let conn = st.db.lock().unwrap();
    let rows = query_all(&conn, "SELECT * FROM mesas WHERE activa = 1 ORDER BY numero", [])
        .map_err(ise)?;
    Ok(json_array(rows))
}

async fn unidades_get(State(st): State<AppState>) -> R {
    let conn = st.db.lock().unwrap();
    let rows = query_all(&conn, "SELECT * FROM unidades ORDER BY nombre", []).map_err(ise)?;
    Ok(json_array(rows))
}
