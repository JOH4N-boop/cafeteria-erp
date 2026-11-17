//! Semillas idempotentes del catálogo, mesas, usuarios y datos de demostración.
//! Portado fielmente de lib/db.ts.

use crate::auth::hash_password;
use chrono::{Duration, Utc};
use rand::Rng;
use rusqlite::{params, Connection};
use std::collections::HashMap;

pub fn seed_all(conn: &Connection) -> rusqlite::Result<()> {
    // Se ejecuta en una transacción, como en getDb() del frontend.
    conn.execute_batch("BEGIN")?;
    let r = (|| {
        seed_catalogo(conn)?;
        seed_mesas(conn)?;
        seed_demo(conn)?;
        seed_usuarios(conn)?;
        Ok::<(), rusqlite::Error>(())
    })();
    match r {
        Ok(()) => {
            conn.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

// ── Datos base ──────────────────────────────────────────────
const UNIDADES: &[(&str, &str, &str)] = &[
    ("Kilogramo", "kg", "peso"),
    ("Gramo", "g", "peso"),
    ("Litro", "L", "volumen"),
    ("Mililitro", "ml", "volumen"),
    ("Unidad", "und", "unidad"),
    ("Onza", "oz", "volumen"),
];

const CATEGORIAS: &[(&str, &str)] = &[
    ("Café", "Tintos, espressos y bebidas de café con leche"),
    ("Chocolate", "Chocolate caliente tradicional"),
    ("Café Frío", "Café frío y frappé"),
    ("Jugos y Limonadas", "Jugos naturales y limonadas"),
    ("Otras Bebidas", "Té frío, aguas y gaseosas"),
    ("Panadería", "Croissants, pan de queso y masas típicas"),
    ("Pastelería y Repostería", "Tortas, postres y galletas"),
    ("Desayunos", "Sándwiches, huevos, arepas y más"),
    ("Almuerzos Ligeros y Snacks", "Paninis, wraps, ensaladas y pasabocas"),
    ("Combos", "Combinaciones de bebida y algo para comer"),
];

// (nombre, unidad_abrev, stock, minimo, costo)
const INGREDIENTES: &[(&str, &str, f64, f64, f64)] = &[
    ("Café Molido", "g", 3000.0, 500.0, 18.0),
    ("Café Espresso Blend", "g", 5000.0, 1000.0, 28.0),
    ("Leche Entera", "ml", 15000.0, 3000.0, 4.2),
    ("Azúcar Blanca", "g", 8000.0, 500.0, 2.8),
    ("Cacao en Polvo", "g", 2000.0, 300.0, 22.0),
    ("Queso Campesino", "g", 2000.0, 400.0, 20.0),
    ("Hielo", "g", 10000.0, 2000.0, 0.5),
    ("Crema de Leche", "ml", 4000.0, 1000.0, 8.5),
    ("Limón (jugo)", "ml", 5000.0, 1000.0, 6.0),
    ("Crema de Coco", "ml", 3000.0, 500.0, 15.0),
    ("Pulpa de Mora", "g", 3000.0, 500.0, 12.0),
    ("Pulpa de Mango", "g", 3000.0, 500.0, 12.0),
    ("Pulpa de Lulo", "g", 3000.0, 500.0, 13.0),
    ("Pulpa de Maracuyá", "g", 3000.0, 500.0, 14.0),
    ("Té Negro (bolsitas)", "und", 100.0, 20.0, 300.0),
    ("Agua Embotellada", "und", 60.0, 12.0, 1800.0),
    ("Agua con Gas", "und", 60.0, 12.0, 2000.0),
    ("Gaseosa", "und", 60.0, 12.0, 2200.0),
    ("Croissant", "und", 40.0, 8.0, 2200.0),
    ("Jamón", "g", 2000.0, 300.0, 26.0),
    ("Queso Mozzarella", "g", 3000.0, 500.0, 32.0),
    ("Pan de Queso", "und", 40.0, 8.0, 1400.0),
    ("Almojábana", "und", 40.0, 8.0, 1300.0),
    ("Pandebono", "und", 40.0, 8.0, 1300.0),
    ("Buñuelo", "und", 40.0, 8.0, 1000.0),
    ("Pan Integral", "und", 30.0, 6.0, 1200.0),
    ("Pan Artesanal", "und", 30.0, 6.0, 1600.0),
    ("Torta de Chocolate (porción)", "und", 20.0, 4.0, 3800.0),
    ("Torta de Zanahoria (porción)", "und", 20.0, 4.0, 3600.0),
    ("Cheesecake (porción)", "und", 20.0, 4.0, 4200.0),
    ("Brownie", "und", 30.0, 6.0, 2400.0),
    ("Galletas Artesanales", "und", 40.0, 8.0, 1600.0),
    ("Muffin", "und", 30.0, 6.0, 2600.0),
    ("Milhoja", "und", 20.0, 4.0, 3400.0),
    ("Tarta de Frutas (porción)", "und", 20.0, 4.0, 3800.0),
    ("Pan Ciabatta", "und", 30.0, 5.0, 1800.0),
    ("Pechuga de Pollo", "g", 3000.0, 500.0, 22.0),
    ("Lechuga", "g", 1000.0, 200.0, 4.5),
    ("Tomate", "g", 2000.0, 300.0, 3.2),
    ("Huevo", "und", 60.0, 12.0, 500.0),
    ("Calentado (porción)", "und", 20.0, 4.0, 6500.0),
    ("Arepa", "und", 40.0, 8.0, 900.0),
    ("Tamal", "und", 20.0, 4.0, 6000.0),
    ("Empanada", "und", 50.0, 10.0, 1400.0),
    ("Pan Panini", "und", 30.0, 6.0, 1600.0),
    ("Tortilla de Trigo", "und", 40.0, 8.0, 900.0),
    ("Aderezo", "ml", 1500.0, 300.0, 12.0),
    ("Masa de Quiche (porción)", "und", 20.0, 4.0, 3200.0),
    ("Dedos de Queso", "und", 120.0, 24.0, 350.0),
    ("Mini Pizza (base)", "und", 30.0, 6.0, 2800.0),
    ("Pastel de Pollo", "und", 30.0, 6.0, 1600.0),
    ("Pastel de Carne", "und", 30.0, 6.0, 1600.0),
];

// (nombre, descripcion, categoria, precio)
const PRODUCTOS: &[(&str, &str, &str, f64)] = &[
    ("Tinto", "Café negro tradicional colombiano", "Café", 3500.0),
    ("Café Americano", "Espresso alargado con agua caliente", "Café", 5500.0),
    ("Espresso", "Shot de espresso intenso", "Café", 5000.0),
    ("Café con Leche", "Café tradicional con leche caliente", "Café", 6000.0),
    ("Capuchino", "Espresso con leche vaporizada y espuma", "Café", 8500.0),
    ("Latte", "Espresso con abundante leche vaporizada", "Café", 9000.0),
    ("Mocaccino", "Espresso, cacao y leche vaporizada", "Café", 10000.0),
    ("Chocolate Caliente", "Chocolate tradicional con leche", "Chocolate", 7000.0),
    ("Chocolate con Queso", "Chocolate caliente con queso campesino", "Chocolate", 9500.0),
    ("Café Frío (Iced Coffee)", "Espresso, leche fría y hielo", "Café Frío", 10000.0),
    ("Frappé de Café", "Café frappé con crema y hielo", "Café Frío", 13000.0),
    ("Limonada Natural", "Limonada natural bien fría", "Jugos y Limonadas", 7000.0),
    ("Limonada de Coco", "Limonada con crema de coco", "Jugos y Limonadas", 10000.0),
    ("Jugo de Mora", "Jugo natural de mora", "Jugos y Limonadas", 8000.0),
    ("Jugo de Mango", "Jugo natural de mango", "Jugos y Limonadas", 8000.0),
    ("Jugo de Lulo", "Jugo natural de lulo", "Jugos y Limonadas", 8500.0),
    ("Jugo de Maracuyá", "Jugo natural de maracuyá", "Jugos y Limonadas", 8500.0),
    ("Té Frío", "Té negro frío endulzado", "Otras Bebidas", 6500.0),
    ("Agua Embotellada", "Agua sin gas 500ml", "Otras Bebidas", 4000.0),
    ("Agua con Gas", "Agua con gas 500ml", "Otras Bebidas", 4500.0),
    ("Gaseosas", "Gaseosa surtida", "Otras Bebidas", 5000.0),
    ("Croissant de Mantequilla", "Croissant horneado clásico", "Panadería", 5500.0),
    ("Croissant de Jamón y Queso", "Croissant relleno de jamón y queso mozzarella", "Panadería", 8500.0),
    ("Pan de Queso", "Pan de queso recién horneado", "Panadería", 3500.0),
    ("Almojábana", "Almojábana tradicional", "Panadería", 3800.0),
    ("Pandebono", "Pandebono tradicional", "Panadería", 3800.0),
    ("Buñuelo", "Buñuelo tradicional", "Panadería", 3000.0),
    ("Pan Integral", "Porción de pan integral", "Panadería", 3500.0),
    ("Pan Artesanal", "Porción de pan artesanal", "Panadería", 4500.0),
    ("Torta de Chocolate", "Porción de torta húmeda de chocolate", "Pastelería y Repostería", 9500.0),
    ("Torta de Zanahoria", "Porción de torta de zanahoria", "Pastelería y Repostería", 9000.0),
    ("Cheesecake", "Porción de cheesecake", "Pastelería y Repostería", 10500.0),
    ("Brownie", "Brownie de chocolate", "Pastelería y Repostería", 6000.0),
    ("Galletas Artesanales", "Galletas artesanales", "Pastelería y Repostería", 4500.0),
    ("Muffins", "Muffin artesanal", "Pastelería y Repostería", 6500.0),
    ("Milhoja", "Milhoja rellena", "Pastelería y Repostería", 8500.0),
    ("Tarta de Frutas", "Porción de tarta de frutas", "Pastelería y Repostería", 9500.0),
    ("Sándwich de Jamón y Queso", "Pan ciabatta con jamón y queso mozzarella", "Desayunos", 11000.0),
    ("Sándwich de Pollo", "Pan ciabatta con pollo, lechuga y tomate", "Desayunos", 13500.0),
    ("Huevos al Gusto con Pan", "Dos huevos al gusto con pan artesanal", "Desayunos", 12000.0),
    ("Calentado Sencillo", "Calentado tradicional con huevo", "Desayunos", 16000.0),
    ("Arepa con Queso", "Arepa asada rellena de queso mozzarella", "Desayunos", 7000.0),
    ("Arepa con Jamón y Queso", "Arepa asada con jamón y queso mozzarella", "Desayunos", 9500.0),
    ("Tamal", "Tamal tradicional", "Desayunos", 12000.0),
    ("Empanadas", "Empanada tradicional", "Desayunos", 3500.0),
    ("Panini de Pollo", "Panini de pollo, queso mozzarella y tomate", "Almuerzos Ligeros y Snacks", 16000.0),
    ("Panini de Jamón y Queso", "Panini de jamón y queso mozzarella", "Almuerzos Ligeros y Snacks", 14500.0),
    ("Wrap de Pollo", "Wrap con pollo, lechuga y tomate", "Almuerzos Ligeros y Snacks", 15000.0),
    ("Ensalada de Pollo", "Lechuga, pollo, tomate y aderezo", "Almuerzos Ligeros y Snacks", 18000.0),
    ("Ensalada Mixta", "Lechuga, tomate, queso mozzarella y aderezo", "Almuerzos Ligeros y Snacks", 14000.0),
    ("Quiche", "Porción de quiche del día", "Almuerzos Ligeros y Snacks", 10500.0),
    ("Dedos de Queso", "Porción de dedos de queso", "Almuerzos Ligeros y Snacks", 8000.0),
    ("Mini Pizza", "Mini pizza de queso mozzarella y tomate", "Almuerzos Ligeros y Snacks", 11000.0),
    ("Pastel de Pollo", "Pastel horneado de pollo", "Almuerzos Ligeros y Snacks", 6500.0),
    ("Pastel de Carne", "Pastel horneado de carne", "Almuerzos Ligeros y Snacks", 6500.0),
    ("Combo Desayuno", "Café con leche + croissant de jamón y queso", "Combos", 13500.0),
    ("Combo Café + Panadería", "Tinto + pandebono", "Combos", 6500.0),
    ("Combo Tarde", "Capuchino + brownie", "Combos", 13000.0),
    ("Combo Ejecutivo", "Panini de pollo + limonada natural", "Combos", 21000.0),
];

// Imágenes conocidas por nombre de producto (mapeo de IMAGENES_PRODUCTOS)
const IMAGENES: &[(&str, &str)] = &[
    ("Cappuccino", "/Cappuccino.png"),
    ("Latte Vainilla", "/Latte.jpg"),
    ("Latte de Almendras", "/Latte.jpg"),
    ("Cold Brew", "/Cold%20Brew.jpg"),
    ("Frappé Caramelo", "/Frappe.jpeg"),
    ("Chocolate Caliente", "/Chocolate.jpg"),
    ("Sándwich Mozzarella", "/Sandwich.jpg"),
    ("Wrap de Pavo", "/Sandwich.jpg"),
];

// (producto, instrucciones, [(ingrediente, cantidad, merma)])
fn recetas() -> Vec<(&'static str, &'static str, Vec<(&'static str, f64, f64)>)> {
    vec![
        ("Tinto", "Preparar café filtrado tradicional.", vec![("Café Molido", 15.0, 5.0)]),
        ("Café Americano", "1 shot de espresso alargado con agua caliente.", vec![("Café Espresso Blend", 16.0, 3.0)]),
        ("Espresso", "1 shot de espresso.", vec![("Café Espresso Blend", 14.0, 3.0)]),
        ("Café con Leche", "Café filtrado con leche caliente.", vec![("Café Molido", 15.0, 5.0), ("Leche Entera", 100.0, 2.0)]),
        ("Capuchino", "1 shot espresso + 150ml leche vaporizada y espuma.", vec![("Café Espresso Blend", 16.0, 3.0), ("Leche Entera", 150.0, 2.0)]),
        ("Latte", "1 shot espresso + 200ml leche vaporizada.", vec![("Café Espresso Blend", 16.0, 3.0), ("Leche Entera", 200.0, 2.0)]),
        ("Mocaccino", "Espresso + cacao + leche vaporizada.", vec![("Café Espresso Blend", 16.0, 3.0), ("Cacao en Polvo", 15.0, 2.0), ("Leche Entera", 150.0, 2.0)]),
        ("Chocolate Caliente", "Cacao y azúcar disueltos en leche caliente.", vec![("Cacao en Polvo", 25.0, 2.0), ("Leche Entera", 200.0, 2.0), ("Azúcar Blanca", 10.0, 0.0)]),
        ("Chocolate con Queso", "Chocolate caliente servido con trozos de queso campesino.", vec![("Cacao en Polvo", 25.0, 2.0), ("Leche Entera", 200.0, 2.0), ("Azúcar Blanca", 10.0, 0.0), ("Queso Campesino", 40.0, 3.0)]),
        ("Café Frío (Iced Coffee)", "Espresso, leche fría y hielo.", vec![("Café Espresso Blend", 18.0, 3.0), ("Leche Entera", 150.0, 2.0), ("Hielo", 150.0, 0.0)]),
        ("Frappé de Café", "Café, leche, crema y hielo licuados.", vec![("Café Espresso Blend", 18.0, 3.0), ("Leche Entera", 100.0, 2.0), ("Crema de Leche", 50.0, 5.0), ("Azúcar Blanca", 15.0, 0.0), ("Hielo", 200.0, 10.0)]),
        ("Limonada Natural", "Limón, azúcar y agua bien fría con hielo.", vec![("Limón (jugo)", 120.0, 5.0), ("Azúcar Blanca", 20.0, 0.0), ("Hielo", 150.0, 0.0)]),
        ("Limonada de Coco", "Limonada natural con crema de coco.", vec![("Limón (jugo)", 100.0, 5.0), ("Crema de Coco", 80.0, 5.0), ("Azúcar Blanca", 15.0, 0.0), ("Hielo", 100.0, 0.0)]),
        ("Jugo de Mora", "Pulpa de mora licuada con azúcar y hielo.", vec![("Pulpa de Mora", 150.0, 5.0), ("Azúcar Blanca", 20.0, 0.0), ("Hielo", 100.0, 0.0)]),
        ("Jugo de Mango", "Pulpa de mango licuada con azúcar y hielo.", vec![("Pulpa de Mango", 150.0, 5.0), ("Azúcar Blanca", 15.0, 0.0), ("Hielo", 100.0, 0.0)]),
        ("Jugo de Lulo", "Pulpa de lulo licuada con azúcar y hielo.", vec![("Pulpa de Lulo", 150.0, 5.0), ("Azúcar Blanca", 20.0, 0.0), ("Hielo", 100.0, 0.0)]),
        ("Jugo de Maracuyá", "Pulpa de maracuyá licuada con azúcar y hielo.", vec![("Pulpa de Maracuyá", 120.0, 5.0), ("Azúcar Blanca", 25.0, 0.0), ("Hielo", 100.0, 0.0)]),
        ("Té Frío", "Infusionar el té negro, endulzar y enfriar con hielo.", vec![("Té Negro (bolsitas)", 1.0, 0.0), ("Azúcar Blanca", 15.0, 0.0), ("Hielo", 150.0, 0.0)]),
        ("Agua Embotellada", "Servir agua embotellada fría.", vec![("Agua Embotellada", 1.0, 0.0)]),
        ("Agua con Gas", "Servir agua con gas fría.", vec![("Agua con Gas", 1.0, 0.0)]),
        ("Gaseosas", "Servir gaseosa fría.", vec![("Gaseosa", 1.0, 0.0)]),
        ("Croissant de Mantequilla", "Hornear y servir el croissant.", vec![("Croissant", 1.0, 5.0)]),
        ("Croissant de Jamón y Queso", "Hornear el croissant relleno de jamón y queso.", vec![("Croissant", 1.0, 5.0), ("Jamón", 50.0, 3.0), ("Queso Mozzarella", 40.0, 3.0)]),
        ("Pan de Queso", "Hornear y servir el pan de queso.", vec![("Pan de Queso", 1.0, 5.0)]),
        ("Almojábana", "Hornear y servir la almojábana.", vec![("Almojábana", 1.0, 5.0)]),
        ("Pandebono", "Hornear y servir el pandebono.", vec![("Pandebono", 1.0, 5.0)]),
        ("Buñuelo", "Freír y servir el buñuelo.", vec![("Buñuelo", 1.0, 5.0)]),
        ("Pan Integral", "Servir la porción de pan integral.", vec![("Pan Integral", 1.0, 5.0)]),
        ("Pan Artesanal", "Servir la porción de pan artesanal.", vec![("Pan Artesanal", 1.0, 5.0)]),
        ("Torta de Chocolate", "Servir la porción de torta refrigerada.", vec![("Torta de Chocolate (porción)", 1.0, 3.0)]),
        ("Torta de Zanahoria", "Servir la porción de torta refrigerada.", vec![("Torta de Zanahoria (porción)", 1.0, 3.0)]),
        ("Cheesecake", "Servir la porción de cheesecake refrigerada.", vec![("Cheesecake (porción)", 1.0, 3.0)]),
        ("Brownie", "Servir el brownie, calentar si se pide.", vec![("Brownie", 1.0, 3.0)]),
        ("Galletas Artesanales", "Servir la porción de galletas.", vec![("Galletas Artesanales", 1.0, 3.0)]),
        ("Muffins", "Servir el muffin, calentar si se pide.", vec![("Muffin", 1.0, 5.0)]),
        ("Milhoja", "Servir la milhoja refrigerada.", vec![("Milhoja", 1.0, 3.0)]),
        ("Tarta de Frutas", "Servir la porción de tarta refrigerada.", vec![("Tarta de Frutas (porción)", 1.0, 3.0)]),
        ("Sándwich de Jamón y Queso", "Tostar el pan y armar con jamón y queso.", vec![("Pan Ciabatta", 1.0, 5.0), ("Jamón", 90.0, 3.0), ("Queso Mozzarella", 60.0, 3.0)]),
        ("Sándwich de Pollo", "Tostar el pan y armar con pollo, lechuga y tomate.", vec![("Pan Ciabatta", 1.0, 5.0), ("Pechuga de Pollo", 100.0, 5.0), ("Lechuga", 20.0, 10.0), ("Tomate", 30.0, 10.0)]),
        ("Huevos al Gusto con Pan", "Preparar 2 huevos al gusto y servir con pan artesanal.", vec![("Huevo", 2.0, 0.0), ("Pan Artesanal", 1.0, 5.0)]),
        ("Calentado Sencillo", "Calentar la porción tradicional y servir con huevo.", vec![("Calentado (porción)", 1.0, 5.0), ("Huevo", 1.0, 0.0)]),
        ("Arepa con Queso", "Asar la arepa y rellenar con queso mozzarella.", vec![("Arepa", 1.0, 5.0), ("Queso Mozzarella", 50.0, 3.0)]),
        ("Arepa con Jamón y Queso", "Asar la arepa y rellenar con jamón y queso mozzarella.", vec![("Arepa", 1.0, 5.0), ("Jamón", 50.0, 3.0), ("Queso Mozzarella", 50.0, 3.0)]),
        ("Tamal", "Calentar y servir el tamal.", vec![("Tamal", 1.0, 5.0)]),
        ("Empanadas", "Freír y servir la empanada.", vec![("Empanada", 1.0, 5.0)]),
        ("Panini de Pollo", "Armar el panini con pollo, queso y tomate, y prensar.", vec![("Pan Panini", 1.0, 5.0), ("Pechuga de Pollo", 120.0, 5.0), ("Queso Mozzarella", 40.0, 3.0), ("Tomate", 30.0, 10.0)]),
        ("Panini de Jamón y Queso", "Armar el panini con jamón y queso, y prensar.", vec![("Pan Panini", 1.0, 5.0), ("Jamón", 90.0, 3.0), ("Queso Mozzarella", 60.0, 3.0)]),
        ("Wrap de Pollo", "Rellenar la tortilla con pollo, lechuga y tomate y enrollar.", vec![("Tortilla de Trigo", 1.0, 5.0), ("Pechuga de Pollo", 120.0, 5.0), ("Lechuga", 30.0, 10.0), ("Tomate", 40.0, 10.0)]),
        ("Ensalada de Pollo", "Mezclar lechuga, pollo, tomate y aderezo.", vec![("Lechuga", 150.0, 10.0), ("Pechuga de Pollo", 150.0, 5.0), ("Tomate", 60.0, 10.0), ("Aderezo", 40.0, 0.0)]),
        ("Ensalada Mixta", "Mezclar lechuga, tomate, queso y aderezo.", vec![("Lechuga", 180.0, 10.0), ("Tomate", 80.0, 10.0), ("Queso Mozzarella", 40.0, 3.0), ("Aderezo", 40.0, 0.0)]),
        ("Quiche", "Hornear y servir la porción de quiche.", vec![("Masa de Quiche (porción)", 1.0, 5.0)]),
        ("Dedos de Queso", "Freír y servir 6 unidades de dedos de queso.", vec![("Dedos de Queso", 6.0, 5.0)]),
        ("Mini Pizza", "Hornear la base con queso mozzarella y tomate.", vec![("Mini Pizza (base)", 1.0, 5.0), ("Queso Mozzarella", 40.0, 3.0), ("Tomate", 30.0, 10.0)]),
        ("Pastel de Pollo", "Hornear y servir el pastel de pollo.", vec![("Pastel de Pollo", 1.0, 5.0)]),
        ("Pastel de Carne", "Hornear y servir el pastel de carne.", vec![("Pastel de Carne", 1.0, 5.0)]),
        ("Combo Desayuno", "Café con leche + croissant de jamón y queso.", vec![("Café Molido", 15.0, 5.0), ("Leche Entera", 100.0, 2.0), ("Croissant", 1.0, 5.0), ("Jamón", 50.0, 3.0), ("Queso Mozzarella", 40.0, 3.0)]),
        ("Combo Café + Panadería", "Tinto + pandebono.", vec![("Café Molido", 15.0, 5.0), ("Pandebono", 1.0, 5.0)]),
        ("Combo Tarde", "Capuchino + brownie.", vec![("Café Espresso Blend", 16.0, 3.0), ("Leche Entera", 150.0, 2.0), ("Brownie", 1.0, 3.0)]),
        ("Combo Ejecutivo", "Panini de pollo + limonada natural.", vec![("Pan Panini", 1.0, 5.0), ("Pechuga de Pollo", 120.0, 5.0), ("Queso Mozzarella", 40.0, 3.0), ("Tomate", 30.0, 10.0), ("Limón (jugo)", 120.0, 5.0), ("Azúcar Blanca", 20.0, 0.0), ("Hielo", 150.0, 0.0)]),
    ]
}

fn count(conn: &Connection, sql: &str) -> rusqlite::Result<i64> {
    conn.query_row(sql, [], |r| r.get(0))
}

fn seed_catalogo(conn: &Connection) -> rusqlite::Result<()> {
    for (nombre, abrev, tipo) in UNIDADES {
        conn.execute(
            "INSERT OR IGNORE INTO unidades (nombre, abreviatura, tipo) VALUES (?, ?, ?)",
            params![nombre, abrev, tipo],
        )?;
    }
    for (nombre, desc) in CATEGORIAS {
        conn.execute(
            "INSERT OR IGNORE INTO categorias (nombre, descripcion) VALUES (?, ?)",
            params![nombre, desc],
        )?;
    }

    let mut unidad_id: HashMap<String, i64> = HashMap::new();
    {
        let mut s = conn.prepare("SELECT id, abreviatura FROM unidades")?;
        let rows = s.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (id, abrev) = row?;
            unidad_id.insert(abrev, id);
        }
    }
    let mut categoria_id: HashMap<String, i64> = HashMap::new();
    {
        let mut s = conn.prepare("SELECT id, nombre FROM categorias")?;
        let rows = s.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (id, nombre) = row?;
            categoria_id.insert(nombre, id);
        }
    }

    // Ingredientes
    let mut ingrediente_id: HashMap<String, i64> = HashMap::new();
    for (nombre, unidad, stock, minimo, costo) in INGREDIENTES {
        let existente: Option<i64> = conn
            .query_row("SELECT id FROM ingredientes WHERE nombre = ?", params![nombre], |r| r.get(0))
            .ok();
        if let Some(id) = existente {
            ingrediente_id.insert((*nombre).to_string(), id);
            continue;
        }
        let Some(uid) = unidad_id.get(*unidad) else { continue };
        conn.execute(
            "INSERT INTO ingredientes (nombre, unidad_id, stock_actual, stock_minimo, costo_unitario) VALUES (?, ?, ?, ?, ?)",
            params![nombre, uid, stock, minimo, costo],
        )?;
        ingrediente_id.insert((*nombre).to_string(), conn.last_insert_rowid());
    }

    // Productos
    let mut producto_id: HashMap<String, i64> = HashMap::new();
    for (nombre, desc, categoria, precio) in PRODUCTOS {
        let existente: Option<i64> = conn
            .query_row("SELECT id FROM productos WHERE nombre = ?", params![nombre], |r| r.get(0))
            .ok();
        if let Some(id) = existente {
            producto_id.insert((*nombre).to_string(), id);
            continue;
        }
        let Some(cid) = categoria_id.get(*categoria) else { continue };
        conn.execute(
            "INSERT INTO productos (nombre, descripcion, categoria_id, precio_venta, costo_receta) VALUES (?, ?, ?, ?, 0)",
            params![nombre, desc, cid, precio],
        )?;
        producto_id.insert((*nombre).to_string(), conn.last_insert_rowid());
    }

    // Imágenes conocidas
    for (nombre, url) in IMAGENES {
        conn.execute(
            "UPDATE productos SET imagen_url = ? WHERE nombre = ? AND (imagen_url IS NULL OR imagen_url = '')",
            params![url, nombre],
        )?;
    }

    // Recetas (solo si el producto aún no tiene una)
    for (producto, instrucciones, ingredientes) in recetas() {
        let Some(&pid) = producto_id.get(producto) else { continue };
        let tiene: Option<i64> = conn
            .query_row("SELECT id FROM recetas WHERE producto_id = ?", params![pid], |r| r.get(0))
            .ok();
        if tiene.is_some() {
            continue;
        }
        conn.execute(
            "INSERT INTO recetas (producto_id, instrucciones) VALUES (?, ?)",
            params![pid, instrucciones],
        )?;
        let receta_id = conn.last_insert_rowid();
        for (ing_nombre, cantidad, merma) in ingredientes {
            let Some(&iid) = ingrediente_id.get(ing_nombre) else { continue };
            conn.execute(
                "INSERT INTO receta_ingredientes (receta_id, ingrediente_id, cantidad, merma_porcentaje) VALUES (?, ?, ?, ?)",
                params![receta_id, iid, cantidad, merma],
            )?;
        }
        let costo: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(ri.cantidad * i.costo_unitario * (1 + ri.merma_porcentaje / 100.0)), 0) \
                 FROM receta_ingredientes ri JOIN ingredientes i ON ri.ingrediente_id = i.id WHERE ri.receta_id = ?",
                params![receta_id],
                |r| r.get(0),
            )
            .unwrap_or(0.0);
        conn.execute(
            "UPDATE productos SET costo_receta = ? WHERE id = ?",
            params![costo, pid],
        )?;
    }
    Ok(())
}

fn seed_mesas(conn: &Connection) -> rusqlite::Result<()> {
    if count(conn, "SELECT COUNT(*) FROM mesas")? > 0 {
        return Ok(());
    }
    let capacidades = [2, 2, 4, 4, 4, 4, 6, 6, 2, 4, 4, 6];
    for (i, cap) in capacidades.iter().enumerate() {
        conn.execute(
            "INSERT INTO mesas (numero, capacidad) VALUES (?, ?)",
            params![(i as i64) + 1, cap],
        )?;
    }
    Ok(())
}

fn seed_usuarios(conn: &Connection) -> rusqlite::Result<()> {
    if count(conn, "SELECT COUNT(*) FROM usuarios")? > 0 {
        return Ok(());
    }
    let (salt_a, hash_a) = hash_password("admin123");
    conn.execute(
        "INSERT INTO usuarios (username, password_hash, salt, rol, nombre) VALUES (?, ?, ?, ?, ?)",
        params!["admin", hash_a, salt_a, "admin", "Administrador"],
    )?;
    let (salt_m, hash_m) = hash_password("mesero123");
    conn.execute(
        "INSERT INTO usuarios (username, password_hash, salt, rol, nombre) VALUES (?, ?, ?, ?, ?)",
        params!["mesero", hash_m, salt_m, "mesero", "Asesor 1"],
    )?;
    Ok(())
}

fn seed_demo(conn: &Connection) -> rusqlite::Result<()> {
    if count(conn, "SELECT COUNT(*) FROM pedidos")? > 0 {
        return Ok(());
    }

    conn.execute_batch(
        "INSERT INTO proveedores (nombre, contacto, telefono, email) VALUES \
          ('Café Origen SAS','Carlos Muñoz','3001234567','carlos@cafeorigen.co'),\
          ('Lácteos del Valle','María López','3007654321','maria@lacteosvalle.co'),\
          ('Distribuidora Pan y Vida','Juan Pérez','3015551234','juan@panvida.co');",
    )?;

    let productos: Vec<(i64, f64)> = {
        let mut s = conn.prepare("SELECT id, precio_venta FROM productos WHERE activo = 1")?;
        let rows = s.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, f64>(1)?)))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    if productos.is_empty() {
        return Ok(());
    }
    let numeros_mesa: Vec<String> = {
        let mut s = conn.prepare("SELECT numero FROM mesas WHERE activa = 1 ORDER BY numero")?;
        let rows = s.query_map([], |r| Ok(r.get::<_, i64>(0)?.to_string()))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };

    let estados = ["entregado", "entregado", "entregado", "cancelado"];
    let tipos = ["local", "local", "para_llevar"];
    let mut rng = rand::thread_rng();
    let now = Utc::now();
    let mut pedido_num: i64 = 1000;

    for days_ago in (0..=29).rev() {
        let orders_count = rng.gen_range(0..18) + 8;
        for _ in 0..orders_count {
            let hour = rng.gen_range(0..12) + 7;
            let minute = rng.gen_range(0..60);
            let fecha = (now - Duration::days(days_ago))
                .date_naive()
                .and_hms_opt(hour, minute, 0)
                .unwrap();
            // ISO con milisegundos y Z, como Date.toISOString()
            let created_at = format!("{}", fecha.format("%Y-%m-%dT%H:%M:%S.000Z"));

            let estado = estados[rng.gen_range(0..estados.len())];
            let tipo = tipos[rng.gen_range(0..tipos.len())];
            let mesa: Option<String> = if tipo == "local" && !numeros_mesa.is_empty() {
                Some(numeros_mesa[rng.gen_range(0..numeros_mesa.len())].clone())
            } else {
                None
            };
            let num_items = rng.gen_range(0..3) + 1;

            let mut subtotal = 0.0f64;
            let mut items: Vec<(i64, i64, f64)> = Vec::new();
            for _ in 0..num_items {
                let (pid, precio) = productos[rng.gen_range(0..productos.len())];
                let cant = (rng.gen_range(0..2) + 1) as i64;
                items.push((pid, cant, precio));
                subtotal += precio * cant as f64;
            }

            let descuento = if rng.gen::<f64>() < 0.1 {
                (subtotal * 0.1).round()
            } else {
                0.0
            };
            let total = subtotal - descuento;

            let numero = format!("P-{:05}", pedido_num);
            pedido_num += 1;

            conn.execute(
                "INSERT INTO pedidos (numero, estado, tipo, mesa, subtotal, descuento, total, created_at) VALUES (?,?,?,?,?,?,?,?)",
                params![numero, estado, tipo, mesa, subtotal, descuento, total, created_at],
            )?;
            let pedido_id = conn.last_insert_rowid();
            for (pid, cant, precio) in items {
                conn.execute(
                    "INSERT INTO pedidos_detalle (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)",
                    params![pedido_id, pid, cant, precio, precio * cant as f64],
                )?;
            }
        }
    }

    // Movimientos de inventario iniciales
    let ingredientes: Vec<i64> = {
        let mut s = conn.prepare("SELECT id FROM ingredientes")?;
        let rows = s.query_map([], |r| r.get::<_, i64>(0))?;
        rows.collect::<rusqlite::Result<Vec<_>>>()?
    };
    for id in ingredientes {
        let d = now - Duration::days(rng.gen_range(0..14));
        let created_at = format!("{}", d.format("%Y-%m-%dT%H:%M:%S.000Z"));
        let cantidad = rng.gen::<f64>() * 5.0 + 1.0;
        let costo = rng.gen::<f64>() * 30000.0 + 1000.0;
        conn.execute(
            "INSERT INTO movimientos_inventario (ingrediente_id, tipo, cantidad, costo_unitario, motivo, created_at) VALUES (?,?,?,?,?,?)",
            params![id, "entrada", cantidad, costo, "Compra inicial", created_at],
        )?;
    }
    Ok(())
}
