# Arranca el stack completo en desarrollo:
#   - Backend Rust (Axum + SQLite) en http://127.0.0.1:8080
#   - Frontend Next.js en http://localhost:3000  (proxy de /api -> backend)
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==> Arrancando backend Rust (Axum + SQLite) en :8080 (ventana aparte)..." -ForegroundColor Cyan
Start-Process -FilePath "cargo" `
  -ArgumentList "run", "--manifest-path", "backend/Cargo.toml" `
  -WorkingDirectory $root

Write-Host "==> Arrancando frontend Next.js en :3000..." -ForegroundColor Cyan
Write-Host "    Abre http://localhost:3000  (admin/admin123  o  mesero/mesero123)" -ForegroundColor Yellow
Set-Location $root
npm run dev
