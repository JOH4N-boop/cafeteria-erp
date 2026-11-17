-- ============================================================
--  ERP Cafetería I.POS — Modelo Relacional (MySQL)
--  Equivalente MySQL del esquema real que usa el backend
--  (Rust + SQLite). Pensado para visualizar el diagrama ER
--  en MySQL Workbench (Reverse Engineer).
-- ============================================================

DROP DATABASE IF EXISTS cafeteria_erp;
CREATE DATABASE cafeteria_erp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE cafeteria_erp;

-- ── Tablas maestras / catálogo ──────────────────────────────

CREATE TABLE categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE unidades (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(50) NOT NULL UNIQUE,
  abreviatura VARCHAR(10) NOT NULL UNIQUE,
  tipo        ENUM('peso','volumen','unidad') NOT NULL
) ENGINE=InnoDB;

CREATE TABLE proveedores (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre     VARCHAR(150) NOT NULL,
  contacto   VARCHAR(150),
  telefono   VARCHAR(30),
  email      VARCHAR(150),
  activo     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE mesas (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero     INT NOT NULL UNIQUE,
  capacidad  INT NOT NULL DEFAULT 4,
  activa     TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,          -- scrypt (hex)
  salt          VARCHAR(64) NOT NULL,           -- salt (hex)
  rol           ENUM('admin','mesero') NOT NULL,
  nombre        VARCHAR(150) NOT NULL,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── Inventario (ingredientes, movimientos) ──────────────────

CREATE TABLE ingredientes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(150) NOT NULL,
  descripcion    VARCHAR(255),
  unidad_id      INT UNSIGNED NOT NULL,
  stock_actual   DECIMAL(14,4) NOT NULL DEFAULT 0,
  stock_minimo   DECIMAL(14,4) NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(14,4) NOT NULL DEFAULT 0,
  activo         TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ingredientes_unidad FOREIGN KEY (unidad_id) REFERENCES unidades(id),
  INDEX idx_ingredientes_activo (activo)
) ENGINE=InnoDB;

CREATE TABLE movimientos_inventario (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ingrediente_id INT UNSIGNED NOT NULL,
  tipo           ENUM('entrada','salida','ajuste','merma') NOT NULL,
  cantidad       DECIMAL(14,4) NOT NULL,
  costo_unitario DECIMAL(14,4),
  motivo         VARCHAR(255),
  referencia     VARCHAR(50),                   -- id de pedido u otra referencia
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_ingrediente FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id),
  INDEX idx_mov_ingrediente (ingrediente_id),
  INDEX idx_mov_fecha (created_at)
) ENGINE=InnoDB;

-- ── Menú (productos, recetas / escandallos) ─────────────────

CREATE TABLE productos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(150) NOT NULL,
  descripcion  VARCHAR(255),
  categoria_id INT UNSIGNED,
  precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_receta DECIMAL(12,2) NOT NULL DEFAULT 0,
  imagen_url   VARCHAR(255),
  disponible   TINYINT(1) NOT NULL DEFAULT 1,
  activo       TINYINT(1) NOT NULL DEFAULT 1,    -- soft delete
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  INDEX idx_productos_categoria (categoria_id)
) ENGINE=InnoDB;

CREATE TABLE recetas (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id   INT UNSIGNED NOT NULL UNIQUE,    -- 1 receta por producto
  porciones     INT NOT NULL DEFAULT 1,
  instrucciones TEXT,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recetas_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
) ENGINE=InnoDB;

CREATE TABLE receta_ingredientes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  receta_id        INT UNSIGNED NOT NULL,
  ingrediente_id   INT UNSIGNED NOT NULL,
  cantidad         DECIMAL(14,4) NOT NULL,
  merma_porcentaje DECIMAL(6,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_ri_receta     FOREIGN KEY (receta_id)     REFERENCES recetas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ri_ingrediente FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id),
  INDEX idx_ri_receta (receta_id),
  INDEX idx_ri_ingrediente (ingrediente_id)
) ENGINE=InnoDB;

-- ── Compras (órdenes a proveedores) ─────────────────────────

CREATE TABLE ordenes_compra (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  proveedor_id INT UNSIGNED,
  estado       ENUM('pendiente','recibida','cancelada') NOT NULL DEFAULT 'pendiente',
  total        DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas        TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oc_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
) ENGINE=InnoDB;

CREATE TABLE ordenes_compra_detalle (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  orden_id       INT UNSIGNED NOT NULL,
  ingrediente_id INT UNSIGNED NOT NULL,
  cantidad       DECIMAL(14,4) NOT NULL,
  costo_unitario DECIMAL(14,4) NOT NULL,
  subtotal       DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_ocd_orden      FOREIGN KEY (orden_id)      REFERENCES ordenes_compra(id) ON DELETE CASCADE,
  CONSTRAINT fk_ocd_ingrediente FOREIGN KEY (ingrediente_id) REFERENCES ingredientes(id),
  INDEX idx_ocd_orden (orden_id)
) ENGINE=InnoDB;

-- ── Ventas (pedidos, detalle, facturas) ─────────────────────

CREATE TABLE pedidos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero     VARCHAR(30) NOT NULL UNIQUE,         -- correlativo P-#####
  estado     ENUM('pendiente','en_preparacion','listo','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  tipo       ENUM('local','para_llevar','delivery') NOT NULL DEFAULT 'local',
  mesa       VARCHAR(30),                          -- número de mesa (texto; sin FK)
  subtotal   DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total      DECIMAL(12,2) NOT NULL DEFAULT 0,
  notas      TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pedidos_fecha (created_at),
  INDEX idx_pedidos_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE pedidos_detalle (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id       INT UNSIGNED NOT NULL,
  producto_id     INT UNSIGNED NOT NULL,
  cantidad        INT NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal        DECIMAL(12,2) NOT NULL,
  notas           TEXT,
  CONSTRAINT fk_pd_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pd_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
  INDEX idx_pd_pedido (pedido_id)
) ENGINE=InnoDB;

CREATE TABLE facturas (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero      VARCHAR(30) NOT NULL UNIQUE,         -- correlativo FAC-#####
  pedido_id   INT UNSIGNED NOT NULL,               -- 1 factura por pedido (idempotente en la lógica)
  cliente     VARCHAR(150),
  subtotal    DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento   DECIMAL(12,2) NOT NULL DEFAULT 0,
  impuesto    DECIMAL(12,2) NOT NULL DEFAULT 0,    -- impoconsumo 8%
  total       DECIMAL(12,2) NOT NULL DEFAULT 0,
  metodo_pago ENUM('efectivo','tarjeta','transferencia','nequi','daviplata') NOT NULL DEFAULT 'efectivo',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_facturas_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  INDEX idx_facturas_pedido (pedido_id),
  INDEX idx_facturas_fecha (created_at)
) ENGINE=InnoDB;
