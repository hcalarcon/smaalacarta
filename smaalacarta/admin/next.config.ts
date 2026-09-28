import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El panel vive en smaalacarta.com.ar/admin (rewrite externo en
  // landing/vercel.json hacia este proyecto): "admin" es un nombre reservado
  // en RESERVED_SUBDOMAINS/RESERVED_SLUGS, no un negocio.
  basePath: "/admin",
};

export default nextConfig;
