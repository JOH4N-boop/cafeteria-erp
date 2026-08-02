import Database from "better-sqlite3"
import path from "path"
import fs from "fs"
import { hashPassword } from "./auth"

const DB_DIR = path.join(process.cwd(), ".data")
const DB_PATH = path.join(DB_DIR, "cafeteria.db")

let _db: Database.Database | null = null

// Imágenes disponibles en /public para los productos del menú (ya no se muestran en la UI,
// pero se conserva el mapeo por si se vuelven a habilitar más adelante)
const IMAGENES_PRODUCTOS: Record<string, string> = {
  "Cappuccino": "/Cappuccino.png",
  "Latte Vainilla": "/Latte.jpg",
  "Latte de Almendras": "/Latte.jpg",
  "Cold Brew": "/Cold%20Brew.jpg",
  "Frappé Caramelo": "/Frappe.jpeg",
  "Chocolate Caliente": "/Chocolate.jpg",
  "Sándwich Mozzarella": "/Sandwich.jpg",
  "Wrap de Pavo": "/Sandwich.jpg",
}

export function getDb(): Database.Database {
  // Si la DB fue eliminada del disco (p.ej. durante desarrollo), forzar reconexión
  if (_db && !fs.existsSync(DB_PATH)) {
    try { _db.close() } catch { /* ignorar */ }
    _db = null
  }

  if (_db) return _db

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true })
  }

  _db = new Database(DB_PATH)
  _db.pragma("journal_mode = WAL")
  _db.pragma("synchronous = NORMAL")
  _db.pragma("foreign_keys = ON")

  initSchema(_db)
  _db.transaction(() => {
    migrateProductImages(_db)
    seedCatalogo(_db)
    seedMesas(_db)
    seedDemoData(_db)
    seedUsuarios(_db)
  })()

  return _db
}

// Agrega la columna imagen_url si falta (bases de datos creadas antes de este cambio)
// y asigna las imágenes conocidas a los productos existentes.
function migrateProductImages(db: Database.Database) {
  const columnas = db.prepare("PRAGMA table_info(productos)").all() as Array<{ name: string }>
  if (!columnas.some((c) => c.name === "imagen_url")) {
    db.exec("ALTER TABLE productos ADD COLUMN imagen_url TEXT")
  }

  const actualizar = db.prepare(
    "UPDATE productos SET imagen_url = ? WHERE nombre = ? AND (imagen_url IS NULL OR imagen_url = '')"
  )
  for (const [nombre, url] of Object.entries(IMAGENES_PRODUCTOS)) {
    actualizar.run(url, nombre)
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Categorías de productos
    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Unidades de medida
    CREATE TABLE IF NOT EXISTS unidades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      abreviatura TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL CHECK(tipo IN ('peso','volumen','unidad'))
    );

    -- Ingredientes / materias primas
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

    -- Movimientos de inventario
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

    -- Productos del menú
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

    -- Recetas (escandallos)
    CREATE TABLE IF NOT EXISTS recetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL UNIQUE REFERENCES productos(id),
      porciones INTEGER NOT NULL DEFAULT 1,
      instrucciones TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Ingredientes de cada receta
    CREATE TABLE IF NOT EXISTS receta_ingredientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receta_id INTEGER NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      cantidad REAL NOT NULL,
      merma_porcentaje REAL NOT NULL DEFAULT 0
    );

    -- Proveedores
    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      contacto TEXT,
      telefono TEXT,
      email TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Órdenes de compra
    CREATE TABLE IF NOT EXISTS ordenes_compra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER REFERENCES proveedores(id),
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','recibida','cancelada')),
      total REAL NOT NULL DEFAULT 0,
      notas TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Detalle de órdenes de compra
    CREATE TABLE IF NOT EXISTS ordenes_compra_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER NOT NULL REFERENCES ordenes_compra(id) ON DELETE CASCADE,
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      cantidad REAL NOT NULL,
      costo_unitario REAL NOT NULL,
      subtotal REAL NOT NULL
    );

    -- Mesas físicas del salón
    CREATE TABLE IF NOT EXISTS mesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero INTEGER NOT NULL UNIQUE,
      capacidad INTEGER NOT NULL DEFAULT 4,
      activa INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pedidos / ventas
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

    -- Detalle de pedidos
    CREATE TABLE IF NOT EXISTS pedidos_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      cantidad INTEGER NOT NULL DEFAULT 1,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      notas TEXT
    );

    -- Usuarios del sistema (login por roles)
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

    -- Facturas (generadas al cerrar un pedido)
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

    -- Índices
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
  `)
}

function seedUsuarios(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as c FROM usuarios").get() as { c: number }).c
  if (count > 0) return

  const insert = db.prepare(
    "INSERT INTO usuarios (username, password_hash, salt, rol, nombre) VALUES (?, ?, ?, ?, ?)"
  )

  const admin = hashPassword("admin123")
  insert.run("admin", admin.hash, admin.salt, "admin", "Administrador")

  const mesero = hashPassword("mesero123")
  insert.run("mesero", mesero.hash, mesero.salt, "mesero", "Asesor 1")
}

// ── Mesas físicas ────────────────────────────────────────────
// Se guardan en la base de datos (tabla `mesas`), no como una lista fija en el código.
function seedMesas(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as c FROM mesas").get() as { c: number }).c
  if (count > 0) return

  const insert = db.prepare("INSERT INTO mesas (numero, capacidad) VALUES (?, ?)")
  // Patrón de capacidades típico de un salón: mesas de 2, 4 y 6 puestos
  const capacidades = [2, 2, 4, 4, 4, 4, 6, 6, 2, 4, 4, 6]
  capacidades.forEach((capacidad, i) => insert.run(i + 1, capacidad))
}

// ── Catálogo (unidades, categorías, ingredientes, productos, recetas) ──
// Idempotente: se ejecuta en cada arranque y solo agrega lo que falte por nombre,
// así que es seguro correrlo tanto en una base de datos nueva como en una existente.
const UNIDADES = [
  { nombre: "Kilogramo", abrev: "kg", tipo: "peso" },
  { nombre: "Gramo", abrev: "g", tipo: "peso" },
  { nombre: "Litro", abrev: "L", tipo: "volumen" },
  { nombre: "Mililitro", abrev: "ml", tipo: "volumen" },
  { nombre: "Unidad", abrev: "und", tipo: "unidad" },
  { nombre: "Onza", abrev: "oz", tipo: "volumen" },
] as const

// Catálogo tomado de menu.md
const CATEGORIAS = [
  { nombre: "Café", descripcion: "Tintos, espressos y bebidas de café con leche" },
  { nombre: "Chocolate", descripcion: "Chocolate caliente tradicional" },
  { nombre: "Café Frío", descripcion: "Café frío y frappé" },
  { nombre: "Jugos y Limonadas", descripcion: "Jugos naturales y limonadas" },
  { nombre: "Otras Bebidas", descripcion: "Té frío, aguas y gaseosas" },
  { nombre: "Panadería", descripcion: "Croissants, pan de queso y masas típicas" },
  { nombre: "Pastelería y Repostería", descripcion: "Tortas, postres y galletas" },
  { nombre: "Desayunos", descripcion: "Sándwiches, huevos, arepas y más" },
  { nombre: "Almuerzos Ligeros y Snacks", descripcion: "Paninis, wraps, ensaladas y pasabocas" },
  { nombre: "Combos", descripcion: "Combinaciones de bebida y algo para comer" },
] as const

interface IngredienteSeed {
  nombre: string
  unidad: (typeof UNIDADES)[number]["abrev"]
  stock: number
  minimo: number
  costo: number
}

// Costo por unidad base (g / ml / und) en COP
const INGREDIENTES: IngredienteSeed[] = [
  { nombre: "Café Molido", unidad: "g", stock: 3000, minimo: 500, costo: 18 },
  { nombre: "Café Espresso Blend", unidad: "g", stock: 5000, minimo: 1000, costo: 28 },
  { nombre: "Leche Entera", unidad: "ml", stock: 15000, minimo: 3000, costo: 4.2 },
  { nombre: "Azúcar Blanca", unidad: "g", stock: 8000, minimo: 500, costo: 2.8 },
  { nombre: "Cacao en Polvo", unidad: "g", stock: 2000, minimo: 300, costo: 22 },
  { nombre: "Queso Campesino", unidad: "g", stock: 2000, minimo: 400, costo: 20 },
  { nombre: "Hielo", unidad: "g", stock: 10000, minimo: 2000, costo: 0.5 },
  { nombre: "Crema de Leche", unidad: "ml", stock: 4000, minimo: 1000, costo: 8.5 },
  { nombre: "Limón (jugo)", unidad: "ml", stock: 5000, minimo: 1000, costo: 6 },
  { nombre: "Crema de Coco", unidad: "ml", stock: 3000, minimo: 500, costo: 15 },
  { nombre: "Pulpa de Mora", unidad: "g", stock: 3000, minimo: 500, costo: 12 },
  { nombre: "Pulpa de Mango", unidad: "g", stock: 3000, minimo: 500, costo: 12 },
  { nombre: "Pulpa de Lulo", unidad: "g", stock: 3000, minimo: 500, costo: 13 },
  { nombre: "Pulpa de Maracuyá", unidad: "g", stock: 3000, minimo: 500, costo: 14 },
  { nombre: "Té Negro (bolsitas)", unidad: "und", stock: 100, minimo: 20, costo: 300 },
  { nombre: "Agua Embotellada", unidad: "und", stock: 60, minimo: 12, costo: 1800 },
  { nombre: "Agua con Gas", unidad: "und", stock: 60, minimo: 12, costo: 2000 },
  { nombre: "Gaseosa", unidad: "und", stock: 60, minimo: 12, costo: 2200 },
  { nombre: "Croissant", unidad: "und", stock: 40, minimo: 8, costo: 2200 },
  { nombre: "Jamón", unidad: "g", stock: 2000, minimo: 300, costo: 26 },
  { nombre: "Queso Mozzarella", unidad: "g", stock: 3000, minimo: 500, costo: 32 },
  { nombre: "Pan de Queso", unidad: "und", stock: 40, minimo: 8, costo: 1400 },
  { nombre: "Almojábana", unidad: "und", stock: 40, minimo: 8, costo: 1300 },
  { nombre: "Pandebono", unidad: "und", stock: 40, minimo: 8, costo: 1300 },
  { nombre: "Buñuelo", unidad: "und", stock: 40, minimo: 8, costo: 1000 },
  { nombre: "Pan Integral", unidad: "und", stock: 30, minimo: 6, costo: 1200 },
  { nombre: "Pan Artesanal", unidad: "und", stock: 30, minimo: 6, costo: 1600 },
  { nombre: "Torta de Chocolate (porción)", unidad: "und", stock: 20, minimo: 4, costo: 3800 },
  { nombre: "Torta de Zanahoria (porción)", unidad: "und", stock: 20, minimo: 4, costo: 3600 },
  { nombre: "Cheesecake (porción)", unidad: "und", stock: 20, minimo: 4, costo: 4200 },
  { nombre: "Brownie", unidad: "und", stock: 30, minimo: 6, costo: 2400 },
  { nombre: "Galletas Artesanales", unidad: "und", stock: 40, minimo: 8, costo: 1600 },
  { nombre: "Muffin", unidad: "und", stock: 30, minimo: 6, costo: 2600 },
  { nombre: "Milhoja", unidad: "und", stock: 20, minimo: 4, costo: 3400 },
  { nombre: "Tarta de Frutas (porción)", unidad: "und", stock: 20, minimo: 4, costo: 3800 },
  { nombre: "Pan Ciabatta", unidad: "und", stock: 30, minimo: 5, costo: 1800 },
  { nombre: "Pechuga de Pollo", unidad: "g", stock: 3000, minimo: 500, costo: 22 },
  { nombre: "Lechuga", unidad: "g", stock: 1000, minimo: 200, costo: 4.5 },
  { nombre: "Tomate", unidad: "g", stock: 2000, minimo: 300, costo: 3.2 },
  { nombre: "Huevo", unidad: "und", stock: 60, minimo: 12, costo: 500 },
  { nombre: "Calentado (porción)", unidad: "und", stock: 20, minimo: 4, costo: 6500 },
  { nombre: "Arepa", unidad: "und", stock: 40, minimo: 8, costo: 900 },
  { nombre: "Tamal", unidad: "und", stock: 20, minimo: 4, costo: 6000 },
  { nombre: "Empanada", unidad: "und", stock: 50, minimo: 10, costo: 1400 },
  { nombre: "Pan Panini", unidad: "und", stock: 30, minimo: 6, costo: 1600 },
  { nombre: "Tortilla de Trigo", unidad: "und", stock: 40, minimo: 8, costo: 900 },
  { nombre: "Aderezo", unidad: "ml", stock: 1500, minimo: 300, costo: 12 },
  { nombre: "Masa de Quiche (porción)", unidad: "und", stock: 20, minimo: 4, costo: 3200 },
  { nombre: "Dedos de Queso", unidad: "und", stock: 120, minimo: 24, costo: 350 },
  { nombre: "Mini Pizza (base)", unidad: "und", stock: 30, minimo: 6, costo: 2800 },
  { nombre: "Pastel de Pollo", unidad: "und", stock: 30, minimo: 6, costo: 1600 },
  { nombre: "Pastel de Carne", unidad: "und", stock: 30, minimo: 6, costo: 1600 },
]

interface ProductoSeed {
  nombre: string
  descripcion: string
  categoria: (typeof CATEGORIAS)[number]["nombre"]
  precio: number
}

const PRODUCTOS: ProductoSeed[] = [
  // Café
  { nombre: "Tinto", descripcion: "Café negro tradicional colombiano", categoria: "Café", precio: 3500 },
  { nombre: "Café Americano", descripcion: "Espresso alargado con agua caliente", categoria: "Café", precio: 5500 },
  { nombre: "Espresso", descripcion: "Shot de espresso intenso", categoria: "Café", precio: 5000 },
  { nombre: "Café con Leche", descripcion: "Café tradicional con leche caliente", categoria: "Café", precio: 6000 },
  { nombre: "Capuchino", descripcion: "Espresso con leche vaporizada y espuma", categoria: "Café", precio: 8500 },
  { nombre: "Latte", descripcion: "Espresso con abundante leche vaporizada", categoria: "Café", precio: 9000 },
  { nombre: "Mocaccino", descripcion: "Espresso, cacao y leche vaporizada", categoria: "Café", precio: 10000 },
  // Chocolate
  { nombre: "Chocolate Caliente", descripcion: "Chocolate tradicional con leche", categoria: "Chocolate", precio: 7000 },
  { nombre: "Chocolate con Queso", descripcion: "Chocolate caliente con queso campesino", categoria: "Chocolate", precio: 9500 },
  // Café Frío
  { nombre: "Café Frío (Iced Coffee)", descripcion: "Espresso, leche fría y hielo", categoria: "Café Frío", precio: 10000 },
  { nombre: "Frappé de Café", descripcion: "Café frappé con crema y hielo", categoria: "Café Frío", precio: 13000 },
  // Jugos y Limonadas
  { nombre: "Limonada Natural", descripcion: "Limonada natural bien fría", categoria: "Jugos y Limonadas", precio: 7000 },
  { nombre: "Limonada de Coco", descripcion: "Limonada con crema de coco", categoria: "Jugos y Limonadas", precio: 10000 },
  { nombre: "Jugo de Mora", descripcion: "Jugo natural de mora", categoria: "Jugos y Limonadas", precio: 8000 },
  { nombre: "Jugo de Mango", descripcion: "Jugo natural de mango", categoria: "Jugos y Limonadas", precio: 8000 },
  { nombre: "Jugo de Lulo", descripcion: "Jugo natural de lulo", categoria: "Jugos y Limonadas", precio: 8500 },
  { nombre: "Jugo de Maracuyá", descripcion: "Jugo natural de maracuyá", categoria: "Jugos y Limonadas", precio: 8500 },
  // Otras Bebidas
  { nombre: "Té Frío", descripcion: "Té negro frío endulzado", categoria: "Otras Bebidas", precio: 6500 },
  { nombre: "Agua Embotellada", descripcion: "Agua sin gas 500ml", categoria: "Otras Bebidas", precio: 4000 },
  { nombre: "Agua con Gas", descripcion: "Agua con gas 500ml", categoria: "Otras Bebidas", precio: 4500 },
  { nombre: "Gaseosas", descripcion: "Gaseosa surtida", categoria: "Otras Bebidas", precio: 5000 },
  // Panadería
  { nombre: "Croissant de Mantequilla", descripcion: "Croissant horneado clásico", categoria: "Panadería", precio: 5500 },
  { nombre: "Croissant de Jamón y Queso", descripcion: "Croissant relleno de jamón y queso mozzarella", categoria: "Panadería", precio: 8500 },
  { nombre: "Pan de Queso", descripcion: "Pan de queso recién horneado", categoria: "Panadería", precio: 3500 },
  { nombre: "Almojábana", descripcion: "Almojábana tradicional", categoria: "Panadería", precio: 3800 },
  { nombre: "Pandebono", descripcion: "Pandebono tradicional", categoria: "Panadería", precio: 3800 },
  { nombre: "Buñuelo", descripcion: "Buñuelo tradicional", categoria: "Panadería", precio: 3000 },
  { nombre: "Pan Integral", descripcion: "Porción de pan integral", categoria: "Panadería", precio: 3500 },
  { nombre: "Pan Artesanal", descripcion: "Porción de pan artesanal", categoria: "Panadería", precio: 4500 },
  // Pastelería y Repostería
  { nombre: "Torta de Chocolate", descripcion: "Porción de torta húmeda de chocolate", categoria: "Pastelería y Repostería", precio: 9500 },
  { nombre: "Torta de Zanahoria", descripcion: "Porción de torta de zanahoria", categoria: "Pastelería y Repostería", precio: 9000 },
  { nombre: "Cheesecake", descripcion: "Porción de cheesecake", categoria: "Pastelería y Repostería", precio: 10500 },
  { nombre: "Brownie", descripcion: "Brownie de chocolate", categoria: "Pastelería y Repostería", precio: 6000 },
  { nombre: "Galletas Artesanales", descripcion: "Galletas artesanales", categoria: "Pastelería y Repostería", precio: 4500 },
  { nombre: "Muffins", descripcion: "Muffin artesanal", categoria: "Pastelería y Repostería", precio: 6500 },
  { nombre: "Milhoja", descripcion: "Milhoja rellena", categoria: "Pastelería y Repostería", precio: 8500 },
  { nombre: "Tarta de Frutas", descripcion: "Porción de tarta de frutas", categoria: "Pastelería y Repostería", precio: 9500 },
  // Desayunos
  { nombre: "Sándwich de Jamón y Queso", descripcion: "Pan ciabatta con jamón y queso mozzarella", categoria: "Desayunos", precio: 11000 },
  { nombre: "Sándwich de Pollo", descripcion: "Pan ciabatta con pollo, lechuga y tomate", categoria: "Desayunos", precio: 13500 },
  { nombre: "Huevos al Gusto con Pan", descripcion: "Dos huevos al gusto con pan artesanal", categoria: "Desayunos", precio: 12000 },
  { nombre: "Calentado Sencillo", descripcion: "Calentado tradicional con huevo", categoria: "Desayunos", precio: 16000 },
  { nombre: "Arepa con Queso", descripcion: "Arepa asada rellena de queso mozzarella", categoria: "Desayunos", precio: 7000 },
  { nombre: "Arepa con Jamón y Queso", descripcion: "Arepa asada con jamón y queso mozzarella", categoria: "Desayunos", precio: 9500 },
  { nombre: "Tamal", descripcion: "Tamal tradicional", categoria: "Desayunos", precio: 12000 },
  { nombre: "Empanadas", descripcion: "Empanada tradicional", categoria: "Desayunos", precio: 3500 },
  // Almuerzos Ligeros y Snacks
  { nombre: "Panini de Pollo", descripcion: "Panini de pollo, queso mozzarella y tomate", categoria: "Almuerzos Ligeros y Snacks", precio: 16000 },
  { nombre: "Panini de Jamón y Queso", descripcion: "Panini de jamón y queso mozzarella", categoria: "Almuerzos Ligeros y Snacks", precio: 14500 },
  { nombre: "Wrap de Pollo", descripcion: "Wrap con pollo, lechuga y tomate", categoria: "Almuerzos Ligeros y Snacks", precio: 15000 },
  { nombre: "Ensalada de Pollo", descripcion: "Lechuga, pollo, tomate y aderezo", categoria: "Almuerzos Ligeros y Snacks", precio: 18000 },
  { nombre: "Ensalada Mixta", descripcion: "Lechuga, tomate, queso mozzarella y aderezo", categoria: "Almuerzos Ligeros y Snacks", precio: 14000 },
  { nombre: "Quiche", descripcion: "Porción de quiche del día", categoria: "Almuerzos Ligeros y Snacks", precio: 10500 },
  { nombre: "Dedos de Queso", descripcion: "Porción de dedos de queso", categoria: "Almuerzos Ligeros y Snacks", precio: 8000 },
  { nombre: "Mini Pizza", descripcion: "Mini pizza de queso mozzarella y tomate", categoria: "Almuerzos Ligeros y Snacks", precio: 11000 },
  { nombre: "Pastel de Pollo", descripcion: "Pastel horneado de pollo", categoria: "Almuerzos Ligeros y Snacks", precio: 6500 },
  { nombre: "Pastel de Carne", descripcion: "Pastel horneado de carne", categoria: "Almuerzos Ligeros y Snacks", precio: 6500 },
  // Combos
  { nombre: "Combo Desayuno", descripcion: "Café con leche + croissant de jamón y queso", categoria: "Combos", precio: 13500 },
  { nombre: "Combo Café + Panadería", descripcion: "Tinto + pandebono", categoria: "Combos", precio: 6500 },
  { nombre: "Combo Tarde", descripcion: "Capuchino + brownie", categoria: "Combos", precio: 13000 },
  { nombre: "Combo Ejecutivo", descripcion: "Panini de pollo + limonada natural", categoria: "Combos", precio: 21000 },
]

interface RecetaSeed {
  producto: string
  instrucciones: string
  ingredientes: Array<{ nombre: string; cantidad: number; merma?: number }>
}

const RECETAS: RecetaSeed[] = [
  { producto: "Tinto", instrucciones: "Preparar café filtrado tradicional.", ingredientes: [
    { nombre: "Café Molido", cantidad: 15, merma: 5 },
  ] },
  { producto: "Café Americano", instrucciones: "1 shot de espresso alargado con agua caliente.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 16, merma: 3 },
  ] },
  { producto: "Espresso", instrucciones: "1 shot de espresso.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 14, merma: 3 },
  ] },
  { producto: "Café con Leche", instrucciones: "Café filtrado con leche caliente.", ingredientes: [
    { nombre: "Café Molido", cantidad: 15, merma: 5 },
    { nombre: "Leche Entera", cantidad: 100, merma: 2 },
  ] },
  { producto: "Capuchino", instrucciones: "1 shot espresso + 150ml leche vaporizada y espuma.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 16, merma: 3 },
    { nombre: "Leche Entera", cantidad: 150, merma: 2 },
  ] },
  { producto: "Latte", instrucciones: "1 shot espresso + 200ml leche vaporizada.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 16, merma: 3 },
    { nombre: "Leche Entera", cantidad: 200, merma: 2 },
  ] },
  { producto: "Mocaccino", instrucciones: "Espresso + cacao + leche vaporizada.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 16, merma: 3 },
    { nombre: "Cacao en Polvo", cantidad: 15, merma: 2 },
    { nombre: "Leche Entera", cantidad: 150, merma: 2 },
  ] },
  { producto: "Chocolate Caliente", instrucciones: "Cacao y azúcar disueltos en leche caliente.", ingredientes: [
    { nombre: "Cacao en Polvo", cantidad: 25, merma: 2 },
    { nombre: "Leche Entera", cantidad: 200, merma: 2 },
    { nombre: "Azúcar Blanca", cantidad: 10 },
  ] },
  { producto: "Chocolate con Queso", instrucciones: "Chocolate caliente servido con trozos de queso campesino.", ingredientes: [
    { nombre: "Cacao en Polvo", cantidad: 25, merma: 2 },
    { nombre: "Leche Entera", cantidad: 200, merma: 2 },
    { nombre: "Azúcar Blanca", cantidad: 10 },
    { nombre: "Queso Campesino", cantidad: 40, merma: 3 },
  ] },
  { producto: "Café Frío (Iced Coffee)", instrucciones: "Espresso, leche fría y hielo.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 18, merma: 3 },
    { nombre: "Leche Entera", cantidad: 150, merma: 2 },
    { nombre: "Hielo", cantidad: 150 },
  ] },
  { producto: "Frappé de Café", instrucciones: "Café, leche, crema y hielo licuados.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 18, merma: 3 },
    { nombre: "Leche Entera", cantidad: 100, merma: 2 },
    { nombre: "Crema de Leche", cantidad: 50, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 15 },
    { nombre: "Hielo", cantidad: 200, merma: 10 },
  ] },
  { producto: "Limonada Natural", instrucciones: "Limón, azúcar y agua bien fría con hielo.", ingredientes: [
    { nombre: "Limón (jugo)", cantidad: 120, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 20 },
    { nombre: "Hielo", cantidad: 150 },
  ] },
  { producto: "Limonada de Coco", instrucciones: "Limonada natural con crema de coco.", ingredientes: [
    { nombre: "Limón (jugo)", cantidad: 100, merma: 5 },
    { nombre: "Crema de Coco", cantidad: 80, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 15 },
    { nombre: "Hielo", cantidad: 100 },
  ] },
  { producto: "Jugo de Mora", instrucciones: "Pulpa de mora licuada con azúcar y hielo.", ingredientes: [
    { nombre: "Pulpa de Mora", cantidad: 150, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 20 },
    { nombre: "Hielo", cantidad: 100 },
  ] },
  { producto: "Jugo de Mango", instrucciones: "Pulpa de mango licuada con azúcar y hielo.", ingredientes: [
    { nombre: "Pulpa de Mango", cantidad: 150, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 15 },
    { nombre: "Hielo", cantidad: 100 },
  ] },
  { producto: "Jugo de Lulo", instrucciones: "Pulpa de lulo licuada con azúcar y hielo.", ingredientes: [
    { nombre: "Pulpa de Lulo", cantidad: 150, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 20 },
    { nombre: "Hielo", cantidad: 100 },
  ] },
  { producto: "Jugo de Maracuyá", instrucciones: "Pulpa de maracuyá licuada con azúcar y hielo.", ingredientes: [
    { nombre: "Pulpa de Maracuyá", cantidad: 120, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 25 },
    { nombre: "Hielo", cantidad: 100 },
  ] },
  { producto: "Té Frío", instrucciones: "Infusionar el té negro, endulzar y enfriar con hielo.", ingredientes: [
    { nombre: "Té Negro (bolsitas)", cantidad: 1 },
    { nombre: "Azúcar Blanca", cantidad: 15 },
    { nombre: "Hielo", cantidad: 150 },
  ] },
  { producto: "Agua Embotellada", instrucciones: "Servir agua embotellada fría.", ingredientes: [
    { nombre: "Agua Embotellada", cantidad: 1 },
  ] },
  { producto: "Agua con Gas", instrucciones: "Servir agua con gas fría.", ingredientes: [
    { nombre: "Agua con Gas", cantidad: 1 },
  ] },
  { producto: "Gaseosas", instrucciones: "Servir gaseosa fría.", ingredientes: [
    { nombre: "Gaseosa", cantidad: 1 },
  ] },
  { producto: "Croissant de Mantequilla", instrucciones: "Hornear y servir el croissant.", ingredientes: [
    { nombre: "Croissant", cantidad: 1, merma: 5 },
  ] },
  { producto: "Croissant de Jamón y Queso", instrucciones: "Hornear el croissant relleno de jamón y queso.", ingredientes: [
    { nombre: "Croissant", cantidad: 1, merma: 5 },
    { nombre: "Jamón", cantidad: 50, merma: 3 },
    { nombre: "Queso Mozzarella", cantidad: 40, merma: 3 },
  ] },
  { producto: "Pan de Queso", instrucciones: "Hornear y servir el pan de queso.", ingredientes: [
    { nombre: "Pan de Queso", cantidad: 1, merma: 5 },
  ] },
  { producto: "Almojábana", instrucciones: "Hornear y servir la almojábana.", ingredientes: [
    { nombre: "Almojábana", cantidad: 1, merma: 5 },
  ] },
  { producto: "Pandebono", instrucciones: "Hornear y servir el pandebono.", ingredientes: [
    { nombre: "Pandebono", cantidad: 1, merma: 5 },
  ] },
  { producto: "Buñuelo", instrucciones: "Freír y servir el buñuelo.", ingredientes: [
    { nombre: "Buñuelo", cantidad: 1, merma: 5 },
  ] },
  { producto: "Pan Integral", instrucciones: "Servir la porción de pan integral.", ingredientes: [
    { nombre: "Pan Integral", cantidad: 1, merma: 5 },
  ] },
  { producto: "Pan Artesanal", instrucciones: "Servir la porción de pan artesanal.", ingredientes: [
    { nombre: "Pan Artesanal", cantidad: 1, merma: 5 },
  ] },
  { producto: "Torta de Chocolate", instrucciones: "Servir la porción de torta refrigerada.", ingredientes: [
    { nombre: "Torta de Chocolate (porción)", cantidad: 1, merma: 3 },
  ] },
  { producto: "Torta de Zanahoria", instrucciones: "Servir la porción de torta refrigerada.", ingredientes: [
    { nombre: "Torta de Zanahoria (porción)", cantidad: 1, merma: 3 },
  ] },
  { producto: "Cheesecake", instrucciones: "Servir la porción de cheesecake refrigerada.", ingredientes: [
    { nombre: "Cheesecake (porción)", cantidad: 1, merma: 3 },
  ] },
  { producto: "Brownie", instrucciones: "Servir el brownie, calentar si se pide.", ingredientes: [
    { nombre: "Brownie", cantidad: 1, merma: 3 },
  ] },
  { producto: "Galletas Artesanales", instrucciones: "Servir la porción de galletas.", ingredientes: [
    { nombre: "Galletas Artesanales", cantidad: 1, merma: 3 },
  ] },
  { producto: "Muffins", instrucciones: "Servir el muffin, calentar si se pide.", ingredientes: [
    { nombre: "Muffin", cantidad: 1, merma: 5 },
  ] },
  { producto: "Milhoja", instrucciones: "Servir la milhoja refrigerada.", ingredientes: [
    { nombre: "Milhoja", cantidad: 1, merma: 3 },
  ] },
  { producto: "Tarta de Frutas", instrucciones: "Servir la porción de tarta refrigerada.", ingredientes: [
    { nombre: "Tarta de Frutas (porción)", cantidad: 1, merma: 3 },
  ] },
  { producto: "Sándwich de Jamón y Queso", instrucciones: "Tostar el pan y armar con jamón y queso.", ingredientes: [
    { nombre: "Pan Ciabatta", cantidad: 1, merma: 5 },
    { nombre: "Jamón", cantidad: 90, merma: 3 },
    { nombre: "Queso Mozzarella", cantidad: 60, merma: 3 },
  ] },
  { producto: "Sándwich de Pollo", instrucciones: "Tostar el pan y armar con pollo, lechuga y tomate.", ingredientes: [
    { nombre: "Pan Ciabatta", cantidad: 1, merma: 5 },
    { nombre: "Pechuga de Pollo", cantidad: 100, merma: 5 },
    { nombre: "Lechuga", cantidad: 20, merma: 10 },
    { nombre: "Tomate", cantidad: 30, merma: 10 },
  ] },
  { producto: "Huevos al Gusto con Pan", instrucciones: "Preparar 2 huevos al gusto y servir con pan artesanal.", ingredientes: [
    { nombre: "Huevo", cantidad: 2 },
    { nombre: "Pan Artesanal", cantidad: 1, merma: 5 },
  ] },
  { producto: "Calentado Sencillo", instrucciones: "Calentar la porción tradicional y servir con huevo.", ingredientes: [
    { nombre: "Calentado (porción)", cantidad: 1, merma: 5 },
    { nombre: "Huevo", cantidad: 1 },
  ] },
  { producto: "Arepa con Queso", instrucciones: "Asar la arepa y rellenar con queso mozzarella.", ingredientes: [
    { nombre: "Arepa", cantidad: 1, merma: 5 },
    { nombre: "Queso Mozzarella", cantidad: 50, merma: 3 },
  ] },
  { producto: "Arepa con Jamón y Queso", instrucciones: "Asar la arepa y rellenar con jamón y queso mozzarella.", ingredientes: [
    { nombre: "Arepa", cantidad: 1, merma: 5 },
    { nombre: "Jamón", cantidad: 50, merma: 3 },
    { nombre: "Queso Mozzarella", cantidad: 50, merma: 3 },
  ] },
  { producto: "Tamal", instrucciones: "Calentar y servir el tamal.", ingredientes: [
    { nombre: "Tamal", cantidad: 1, merma: 5 },
  ] },
  { producto: "Empanadas", instrucciones: "Freír y servir la empanada.", ingredientes: [
    { nombre: "Empanada", cantidad: 1, merma: 5 },
  ] },
  { producto: "Panini de Pollo", instrucciones: "Armar el panini con pollo, queso y tomate, y prensar.", ingredientes: [
    { nombre: "Pan Panini", cantidad: 1, merma: 5 },
    { nombre: "Pechuga de Pollo", cantidad: 120, merma: 5 },
    { nombre: "Queso Mozzarella", cantidad: 40, merma: 3 },
    { nombre: "Tomate", cantidad: 30, merma: 10 },
  ] },
  { producto: "Panini de Jamón y Queso", instrucciones: "Armar el panini con jamón y queso, y prensar.", ingredientes: [
    { nombre: "Pan Panini", cantidad: 1, merma: 5 },
    { nombre: "Jamón", cantidad: 90, merma: 3 },
    { nombre: "Queso Mozzarella", cantidad: 60, merma: 3 },
  ] },
  { producto: "Wrap de Pollo", instrucciones: "Rellenar la tortilla con pollo, lechuga y tomate y enrollar.", ingredientes: [
    { nombre: "Tortilla de Trigo", cantidad: 1, merma: 5 },
    { nombre: "Pechuga de Pollo", cantidad: 120, merma: 5 },
    { nombre: "Lechuga", cantidad: 30, merma: 10 },
    { nombre: "Tomate", cantidad: 40, merma: 10 },
  ] },
  { producto: "Ensalada de Pollo", instrucciones: "Mezclar lechuga, pollo, tomate y aderezo.", ingredientes: [
    { nombre: "Lechuga", cantidad: 150, merma: 10 },
    { nombre: "Pechuga de Pollo", cantidad: 150, merma: 5 },
    { nombre: "Tomate", cantidad: 60, merma: 10 },
    { nombre: "Aderezo", cantidad: 40 },
  ] },
  { producto: "Ensalada Mixta", instrucciones: "Mezclar lechuga, tomate, queso y aderezo.", ingredientes: [
    { nombre: "Lechuga", cantidad: 180, merma: 10 },
    { nombre: "Tomate", cantidad: 80, merma: 10 },
    { nombre: "Queso Mozzarella", cantidad: 40, merma: 3 },
    { nombre: "Aderezo", cantidad: 40 },
  ] },
  { producto: "Quiche", instrucciones: "Hornear y servir la porción de quiche.", ingredientes: [
    { nombre: "Masa de Quiche (porción)", cantidad: 1, merma: 5 },
  ] },
  { producto: "Dedos de Queso", instrucciones: "Freír y servir 6 unidades de dedos de queso.", ingredientes: [
    { nombre: "Dedos de Queso", cantidad: 6, merma: 5 },
  ] },
  { producto: "Mini Pizza", instrucciones: "Hornear la base con queso mozzarella y tomate.", ingredientes: [
    { nombre: "Mini Pizza (base)", cantidad: 1, merma: 5 },
    { nombre: "Queso Mozzarella", cantidad: 40, merma: 3 },
    { nombre: "Tomate", cantidad: 30, merma: 10 },
  ] },
  { producto: "Pastel de Pollo", instrucciones: "Hornear y servir el pastel de pollo.", ingredientes: [
    { nombre: "Pastel de Pollo", cantidad: 1, merma: 5 },
  ] },
  { producto: "Pastel de Carne", instrucciones: "Hornear y servir el pastel de carne.", ingredientes: [
    { nombre: "Pastel de Carne", cantidad: 1, merma: 5 },
  ] },
  { producto: "Combo Desayuno", instrucciones: "Café con leche + croissant de jamón y queso.", ingredientes: [
    { nombre: "Café Molido", cantidad: 15, merma: 5 },
    { nombre: "Leche Entera", cantidad: 100, merma: 2 },
    { nombre: "Croissant", cantidad: 1, merma: 5 },
    { nombre: "Jamón", cantidad: 50, merma: 3 },
    { nombre: "Queso Mozzarella", cantidad: 40, merma: 3 },
  ] },
  { producto: "Combo Café + Panadería", instrucciones: "Tinto + pandebono.", ingredientes: [
    { nombre: "Café Molido", cantidad: 15, merma: 5 },
    { nombre: "Pandebono", cantidad: 1, merma: 5 },
  ] },
  { producto: "Combo Tarde", instrucciones: "Capuchino + brownie.", ingredientes: [
    { nombre: "Café Espresso Blend", cantidad: 16, merma: 3 },
    { nombre: "Leche Entera", cantidad: 150, merma: 2 },
    { nombre: "Brownie", cantidad: 1, merma: 3 },
  ] },
  { producto: "Combo Ejecutivo", instrucciones: "Panini de pollo + limonada natural.", ingredientes: [
    { nombre: "Pan Panini", cantidad: 1, merma: 5 },
    { nombre: "Pechuga de Pollo", cantidad: 120, merma: 5 },
    { nombre: "Queso Mozzarella", cantidad: 40, merma: 3 },
    { nombre: "Tomate", cantidad: 30, merma: 10 },
    { nombre: "Limón (jugo)", cantidad: 120, merma: 5 },
    { nombre: "Azúcar Blanca", cantidad: 20 },
    { nombre: "Hielo", cantidad: 150 },
  ] },
]

function seedCatalogo(db: Database.Database) {
  // Unidades y categorías: sólo agrega las que falten (nombre es UNIQUE)
  const insertUnidad = db.prepare("INSERT OR IGNORE INTO unidades (nombre, abreviatura, tipo) VALUES (?, ?, ?)")
  for (const u of UNIDADES) insertUnidad.run(u.nombre, u.abrev, u.tipo)

  const insertCategoria = db.prepare("INSERT OR IGNORE INTO categorias (nombre, descripcion) VALUES (?, ?)")
  for (const c of CATEGORIAS) insertCategoria.run(c.nombre, c.descripcion)

  const unidadIdPorAbrev = new Map<string, number>()
  for (const row of db.prepare("SELECT id, abreviatura FROM unidades").all() as Array<{ id: number; abreviatura: string }>) {
    unidadIdPorAbrev.set(row.abreviatura, row.id)
  }

  const categoriaIdPorNombre = new Map<string, number>()
  for (const row of db.prepare("SELECT id, nombre FROM categorias").all() as Array<{ id: number; nombre: string }>) {
    categoriaIdPorNombre.set(row.nombre, row.id)
  }

  // Ingredientes: agrega por nombre si no existen
  const buscarIngrediente = db.prepare("SELECT id FROM ingredientes WHERE nombre = ?")
  const insertIngrediente = db.prepare(
    "INSERT INTO ingredientes (nombre, unidad_id, stock_actual, stock_minimo, costo_unitario) VALUES (?, ?, ?, ?, ?)"
  )
  const ingredienteIdPorNombre = new Map<string, number>()
  for (const ing of INGREDIENTES) {
    const existente = buscarIngrediente.get(ing.nombre) as { id: number } | undefined
    if (existente) {
      ingredienteIdPorNombre.set(ing.nombre, existente.id)
      continue
    }
    const unidadId = unidadIdPorAbrev.get(ing.unidad)
    if (!unidadId) continue
    const res = insertIngrediente.run(ing.nombre, unidadId, ing.stock, ing.minimo, ing.costo)
    ingredienteIdPorNombre.set(ing.nombre, Number(res.lastInsertRowid))
  }

  // Productos: agrega por nombre si no existen
  const buscarProducto = db.prepare("SELECT id FROM productos WHERE nombre = ?")
  const insertProducto = db.prepare(
    "INSERT INTO productos (nombre, descripcion, categoria_id, precio_venta, costo_receta) VALUES (?, ?, ?, ?, 0)"
  )
  const productoIdPorNombre = new Map<string, number>()
  for (const p of PRODUCTOS) {
    const existente = buscarProducto.get(p.nombre) as { id: number } | undefined
    if (existente) {
      productoIdPorNombre.set(p.nombre, existente.id)
      continue
    }
    const categoriaId = categoriaIdPorNombre.get(p.categoria)
    if (!categoriaId) continue
    const res = insertProducto.run(p.nombre, p.descripcion, categoriaId, p.precio)
    productoIdPorNombre.set(p.nombre, Number(res.lastInsertRowid))
  }

  // Recetas: agrega solo si el producto todavía no tiene una (no sobreescribe ediciones manuales)
  const buscarReceta = db.prepare("SELECT id FROM recetas WHERE producto_id = ?")
  const insertReceta = db.prepare("INSERT INTO recetas (producto_id, instrucciones) VALUES (?, ?)")
  const insertRI = db.prepare(
    "INSERT INTO receta_ingredientes (receta_id, ingrediente_id, cantidad, merma_porcentaje) VALUES (?, ?, ?, ?)"
  )
  const calcularCosto = db.prepare(`
    SELECT SUM(ri.cantidad * i.costo_unitario * (1 + ri.merma_porcentaje / 100.0)) as costo
    FROM receta_ingredientes ri
    JOIN ingredientes i ON ri.ingrediente_id = i.id
    WHERE ri.receta_id = ?
  `)
  const actualizarCostoProducto = db.prepare("UPDATE productos SET costo_receta = ? WHERE id = ?")

  for (const r of RECETAS) {
    const productoId = productoIdPorNombre.get(r.producto)
    if (!productoId) continue
    if (buscarReceta.get(productoId)) continue // ya tiene receta (creada o editada)

    const res = insertReceta.run(productoId, r.instrucciones)
    const recetaId = Number(res.lastInsertRowid)

    for (const ing of r.ingredientes) {
      const ingredienteId = ingredienteIdPorNombre.get(ing.nombre)
      if (!ingredienteId) continue
      insertRI.run(recetaId, ingredienteId, ing.cantidad, ing.merma ?? 0)
    }

    const costo = calcularCosto.get(recetaId) as { costo: number | null }
    actualizarCostoProducto.run(costo.costo ?? 0, productoId)
  }
}

// ── Datos de demostración (proveedores, pedidos históricos, movimientos) ──
// Solo se generan una vez, la primera vez que la base de datos no tiene pedidos.
function seedDemoData(db: Database.Database) {
  const count = (db.prepare("SELECT COUNT(*) as c FROM pedidos").get() as { c: number }).c
  if (count > 0) return

  // Proveedor
  db.exec(`
    INSERT INTO proveedores (nombre, contacto, telefono, email) VALUES
      ('Café Origen SAS','Carlos Muñoz','3001234567','carlos@cafeorigen.co'),
      ('Lácteos del Valle','María López','3007654321','maria@lacteosvalle.co'),
      ('Distribuidora Pan y Vida','Juan Pérez','3015551234','juan@panvida.co');
  `)

  // Productos y mesas reales para generar los pedidos históricos
  const productos = db.prepare("SELECT id, precio_venta FROM productos WHERE activo = 1").all() as Array<{
    id: number
    precio_venta: number
  }>
  const numerosMesa = (db.prepare("SELECT numero FROM mesas WHERE activa = 1 ORDER BY numero").all() as Array<{ numero: number }>).map(
    (m) => String(m.numero)
  )

  if (productos.length === 0) return

  // Pedidos históricos para el dashboard (últimos 30 días)
  const estados = ["entregado", "entregado", "entregado", "cancelado"]
  const tipos = ["local", "local", "para_llevar"] as const

  const insertPedido = db.prepare(`INSERT INTO pedidos (numero, estado, tipo, mesa, subtotal, descuento, total, created_at) VALUES (?,?,?,?,?,?,?,?)`)
  const insertPD = db.prepare(`INSERT INTO pedidos_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)`)

  const now = new Date()
  let pedidoNum = 1000

  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const ordersCount = Math.floor(Math.random() * 18) + 8
    for (let o = 0; o < ordersCount; o++) {
      const d = new Date(now)
      d.setDate(d.getDate() - daysAgo)
      d.setHours(Math.floor(Math.random() * 12) + 7)
      d.setMinutes(Math.floor(Math.random() * 60))

      const estado = estados[Math.floor(Math.random() * estados.length)]
      const tipo = tipos[Math.floor(Math.random() * tipos.length)]
      const mesa = tipo === "local" ? numerosMesa[Math.floor(Math.random() * numerosMesa.length)] : null
      const numItems = Math.floor(Math.random() * 3) + 1

      let subtotal = 0
      const items: Array<{ producto_id: number; cantidad: number; precio: number }> = []

      for (let i = 0; i < numItems; i++) {
        const prod = productos[Math.floor(Math.random() * productos.length)]
        const cant = Math.floor(Math.random() * 2) + 1
        items.push({ producto_id: prod.id, cantidad: cant, precio: prod.precio_venta })
        subtotal += prod.precio_venta * cant
      }

      const descuento = Math.random() < 0.1 ? Math.round(subtotal * 0.1) : 0
      const total = subtotal - descuento

      const res = insertPedido.run(
        `P-${String(pedidoNum++).padStart(5, "0")}`,
        estado,
        tipo,
        mesa,
        subtotal,
        descuento,
        total,
        d.toISOString()
      )
      const pedidoId = res.lastInsertRowid

      for (const item of items) {
        insertPD.run(pedidoId, item.producto_id, item.cantidad, item.precio, item.precio * item.cantidad)
      }
    }
  }

  // Movimientos de inventario
  const ingredientes = db.prepare("SELECT id FROM ingredientes").all() as Array<{ id: number }>
  const insertMov = db.prepare("INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, costo_unitario, motivo, created_at) VALUES (?,?,?,?,?,?)")
  for (const ing of ingredientes) {
    const d = new Date(now)
    d.setDate(d.getDate() - Math.floor(Math.random() * 14))
    insertMov.run(ing.id, "entrada", Math.random() * 5 + 1, Math.random() * 30000 + 1000, "Compra inicial", d.toISOString())
  }
}

// ── Descuento de inventario por receta ──────────────────────
// Calcula, para cada línea de un pedido, cuánto se consume de cada ingrediente
// según la receta del producto (cantidad de la receta × cantidad pedida, ajustada
// por merma y por el número de porciones que rinde la receta).
function calcularConsumosPedido(
  db: Database.Database,
  pedidoId: number
): Array<{ ingrediente_id: number; cantidad: number }> {
  const items = db.prepare("SELECT producto_id, cantidad FROM pedidos_detalle WHERE pedido_id = ?").all(pedidoId) as Array<{
    producto_id: number
    cantidad: number
  }>

  const getReceta = db.prepare("SELECT id, porciones FROM recetas WHERE producto_id = ?")
  const getIngredientesReceta = db.prepare(
    "SELECT ingrediente_id, cantidad, merma_porcentaje FROM receta_ingredientes WHERE receta_id = ?"
  )

  const consumos: Array<{ ingrediente_id: number; cantidad: number }> = []
  for (const item of items) {
    const receta = getReceta.get(item.producto_id) as { id: number; porciones: number } | undefined
    if (!receta) continue // producto sin receta asociada: no descuenta inventario
    const porciones = receta.porciones || 1
    const ingredientesReceta = getIngredientesReceta.all(receta.id) as Array<{
      ingrediente_id: number
      cantidad: number
      merma_porcentaje: number
    }>
    for (const ing of ingredientesReceta) {
      const consumo = (ing.cantidad * (1 + ing.merma_porcentaje / 100) * item.cantidad) / porciones
      consumos.push({ ingrediente_id: ing.ingrediente_id, cantidad: consumo })
    }
  }
  return consumos
}

/** Descuenta del inventario los ingredientes que consumen los productos de un pedido. */
export function descontarInventarioPorPedido(db: Database.Database, pedidoId: number, motivo: string) {
  const consumos = calcularConsumosPedido(db, pedidoId)
  const restarStock = db.prepare("UPDATE ingredientes SET stock_actual = stock_actual - ?, updated_at = datetime('now') WHERE id = ?")
  const insertMov = db.prepare(
    "INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, motivo, referencia) VALUES (?, 'salida', ?, ?, ?)"
  )
  for (const c of consumos) {
    restarStock.run(c.cantidad, c.ingrediente_id)
    insertMov.run(c.ingrediente_id, c.cantidad, motivo, String(pedidoId))
  }
}

/** Repone en el inventario los ingredientes de un pedido (p.ej. al cancelarlo). */
export function reponerInventarioPorPedido(db: Database.Database, pedidoId: number, motivo: string) {
  const consumos = calcularConsumosPedido(db, pedidoId)
  const sumarStock = db.prepare("UPDATE ingredientes SET stock_actual = stock_actual + ?, updated_at = datetime('now') WHERE id = ?")
  const insertMov = db.prepare(
    "INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, motivo, referencia) VALUES (?, 'entrada', ?, ?, ?)"
  )
  for (const c of consumos) {
    sumarStock.run(c.cantidad, c.ingrediente_id)
    insertMov.run(c.ingrediente_id, c.cantidad, motivo, String(pedidoId))
  }
}
