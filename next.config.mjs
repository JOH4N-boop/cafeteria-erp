import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    unoptimized: true,
  },
  // El backend ahora es un servicio Rust (Axum + SQLite). Todas las rutas /api/*
  // se redirigen (proxy) a ese backend. Configurable con BACKEND_URL.
  rewrites: async () => ({
    beforeFiles: [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8080"}/api/:path*`,
      },
    ],
  }),
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
}

export default nextConfig
