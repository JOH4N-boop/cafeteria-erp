//! Autenticación: hash de contraseñas (scrypt, compatible con Node crypto.scryptSync)
//! y cookie de sesión firmada con HMAC-SHA256 (compatible con lib/auth.ts del frontend).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use rand::RngCore;
use scrypt::{scrypt, Params};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

pub const COOKIE_NAME: &str = "cafe_sesion";
const MAX_AGE: i64 = 60 * 60 * 12; // 12 horas

fn secret() -> String {
    std::env::var("AUTH_SECRET")
        .unwrap_or_else(|_| "cafeteria-erp-dev-secret-cambiar-en-produccion".to_string())
}

/// Sesión serializada dentro de la cookie. El orden de los campos replica
/// exactamente el de lib/auth.ts para que el token coincida byte a byte.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    #[serde(rename = "userId")]
    pub user_id: i64,
    pub username: String,
    pub nombre: String,
    pub rol: String,
}

// ── Hash de contraseñas (scrypt) ──
// Node: crypto.scryptSync(password, saltStr, 64) → N=16384 (log2=14), r=8, p=1.
// El "salt" se pasa como la cadena hexadecimal (sus bytes UTF-8), igual que en Node.
pub fn hash_password_with_salt(password: &str, salt: &str) -> String {
    let params = Params::new(14, 8, 1, 64).expect("params scrypt válidos");
    let mut out = [0u8; 64];
    scrypt(password.as_bytes(), salt.as_bytes(), &params, &mut out).expect("scrypt ok");
    hex::encode(out)
}

pub fn random_salt() -> String {
    let mut b = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut b);
    hex::encode(b)
}

/// Genera salt nuevo y devuelve (salt, hash) como en hashPassword() de lib/auth.ts.
pub fn hash_password(password: &str) -> (String, String) {
    let salt = random_salt();
    let hash = hash_password_with_salt(password, &salt);
    (salt, hash)
}

pub fn verify_password(password: &str, salt: &str, hash_hex: &str) -> bool {
    let calc = hash_password_with_salt(password, salt);
    // Comparación en tiempo constante sobre los bytes del hex.
    let a = calc.as_bytes();
    let b = hash_hex.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

// ── Cookie de sesión firmada (HMAC-SHA256, base64url) ──
fn firmar(payload: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(secret().as_bytes()).expect("clave HMAC");
    mac.update(payload.as_bytes());
    URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
}

pub fn sign_session(session: &Session) -> String {
    let json = serde_json::to_string(session).expect("serializa sesión");
    let payload = URL_SAFE_NO_PAD.encode(json.as_bytes());
    let sig = firmar(&payload);
    format!("{payload}.{sig}")
}

#[allow(dead_code)]
pub fn verify_session(token: &str) -> Option<Session> {
    let (payload, sig) = token.split_once('.')?;
    let esperado = firmar(payload);
    if sig.as_bytes().len() != esperado.as_bytes().len() {
        return None;
    }
    // comparación simple (no sensible en local)
    if sig != esperado {
        return None;
    }
    let raw = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice(&raw).ok()
}

pub fn role_home(rol: &str) -> &'static str {
    if rol == "admin" {
        "/"
    } else {
        "/mesero"
    }
}

pub fn session_cookie(token: &str) -> String {
    format!("{COOKIE_NAME}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={MAX_AGE}")
}

pub fn clear_cookie() -> String {
    format!("{COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrypt_coincide_con_node() {
        // Referencia generada con Node crypto.scryptSync("admin123", salt, 64)
        let salt = "aabbccddeeff00112233445566778899";
        let esperado = "53033a5c8d1aec3c0e0150159b242b8485d8b4d072d6f8dbd6cdc969234136eedf6103857c094001d439f2d483796c76c2c30dcea56e8a4e92038b3dec5f7c13";
        assert_eq!(hash_password_with_salt("admin123", salt), esperado);
        assert!(verify_password("admin123", salt, esperado));
        assert!(!verify_password("otra", salt, esperado));
    }

    #[test]
    fn cookie_coincide_con_node() {
        let s = Session {
            user_id: 1,
            username: "admin".into(),
            nombre: "Administrador".into(),
            rol: "admin".into(),
        };
        let esperado = "eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJub21icmUiOiJBZG1pbmlzdHJhZG9yIiwicm9sIjoiYWRtaW4ifQ.1dxVAdJZN0LFva6of6Mg89uNWuIxUf7ZXSO9cnxkkRM";
        assert_eq!(sign_session(&s), esperado);
        assert!(verify_session(esperado).is_some());
    }
}
