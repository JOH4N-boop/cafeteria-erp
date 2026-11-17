mod auth;
mod db;
mod routes;
mod seed;

use std::sync::{Arc, Mutex};

#[tokio::main]
async fn main() {
    let db_path = std::env::var("CAFE_DB_PATH").unwrap_or_else(|_| ".data/cafeteria.db".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("127.0.0.1:{port}");

    let conn = db::open(&db_path).expect("no se pudo abrir/crear la base de datos SQLite");
    println!("Base de datos SQLite lista en {db_path}");

    let state = routes::AppState {
        db: Arc::new(Mutex::new(conn)),
    };
    let app = routes::router(state);

    let listener = tokio::net::TcpListener::bind(&addr).await.expect("no se pudo enlazar el puerto");
    println!("cafeteria-backend (Rust + Axum + SQLite) escuchando en http://{addr}");
    axum::serve(listener, app).await.expect("fallo del servidor");
}
