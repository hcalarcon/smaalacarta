import type { MetadataRoute } from "next";

import { BASE_PATH } from "@/lib/base-path";

// El panel instalable (ADMIN-PWA-9). `start_url` "/admin/" ya lleva a cada uno a su panel: el proxy y los
// layouts mandan al negocio, al repartidor o al superadmin según quién entró. Los colores son los de la marca
// (`--color-brand` y `--color-cream` en `app/globals.css`).
//
// Next sirve esta ruta como `<basePath>/manifest.webmanifest` y pone el `<link rel="manifest">` solo; lo
// que se escribe a mano (URLs de adentro) lleva el `basePath` explícito, porque el manifest no lo suma.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${BASE_PATH}/`,
    name: "SMA a la Carta",
    short_name: "SMA Panel",
    description: "Panel de administración de SMA a la Carta",
    lang: "es",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    background_color: "#faf8f3",
    theme_color: "#5a4a3a",
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${BASE_PATH}/icons/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
