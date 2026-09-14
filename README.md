# SMA a la Carta

Menús digitales con QR y pedidos por WhatsApp para restaurantes y bares de San
Martín de los Andes. Sin apps y sin comisiones: el cliente escanea, arma el
pedido y le llega al negocio por WhatsApp.

## Documentación

- **[docs/SPEC.md](docs/SPEC.md)** — qué tiene que hacer el sistema, como
  requisitos numerados y testeables. La fuente de verdad del comportamiento.
- **[docs/WORKFLOW.md](docs/WORKFLOW.md)** — cómo agregar o cambiar
  comportamiento: primero la spec, después el test que falla, después el código.
- **[docs/BRANCHING.md](docs/BRANCHING.md)** — el modelo de ramas
  (`rama → development → main`) y qué protege a `main`, que es producción.

## Qué hay en el repo

| Carpeta | Qué es | Publicación |
| --- | --- | --- |
| [`smaalacarta/landing`](smaalacarta/landing) | Sitio de venta: planes, demos, contacto | Vercel `smaalacarta` → smaalacarta.com.ar |
| [`smaalacarta/web`](smaalacarta/web) | Menús del cliente final: app con carrito, menús HTML (moderno, clásico, minimal) y visor de PDF | Vercel `democlientes` → subdominios y demo.smaalacarta.com.ar |
| [`smaalacarta/admin`](smaalacarta/admin) | Panel de gestión por negocio: menú, pedidos, promociones. Next.js 16 + Supabase | todavía no |

### Planes

| Plan | Qué entrega | Dónde vive |
| --- | --- | --- |
| Menú QR + PDF | QR que abre la carta en PDF | `web/apps/pdf` |
| Menú Web | Carta web en una de tres plantillas | `web/apps/menu-html` |
| Subdominio Completo | `negocio.smaalacarta…` con carrito y pedido por WhatsApp | `web/apps/menu-app` |

Cada negocio es una carpeta en `web/data/clientes/<slug>/` con `config.json`
(nombre, plantilla, teléfono, colores, horarios) y `menu.json`.

## Correrlo

Tests de `web/` y `landing/`, desde la raíz:

```bash
npm install && npm test
```

Admin, desde `smaalacarta/admin` (necesita `NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`):

```bash
npm install && npm run dev
```

La landing y los menús son archivos estáticos: cualquier servidor estático sirve
para verlos, pero las rutas de los menús dependen de `web/vercel.json`, así que
la forma confiable de probarlos es la preview que Vercel arma para cada pull
request.
