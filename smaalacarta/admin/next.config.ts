import type { NextConfig } from "next";

import { BASE_PATH } from "./src/lib/base-path";

const nextConfig: NextConfig = {
  // El panel vive en smaalacarta.com.ar/admin (rewrite externo en
  // landing/vercel.json hacia este proyecto): "admin" es un nombre reservado
  // en RESERVED_SUBDOMAINS/RESERVED_SLUGS, no un negocio.
  basePath: BASE_PATH,
  // Los términos para repartidores se leen del disco (`lib/courier/terms-file.ts`): nada los importa, así que
  // hay que pedir que viajen con las funciones que los leen.
  outputFileTracingIncludes: {
    "/repartidor": ["./src/content/terminos-repartidores.md"],
    "/repartidor/*": ["./src/content/terminos-repartidores.md"],
  },
};

export default nextConfig;
