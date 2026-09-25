# SMA a la Carta — contrato de trabajo

Este archivo lo leen los dos Claude del proyecto (el de Herni y el de Fede). Herni
es el dueño del proyecto. Los Claude no se hablan entre sí: lo que acá está escrito es lo que los mantiene de acuerdo. Si
una instrucción de una sesión lo contradice, **frená y preguntá al humano**.

Los detalles y el porqué de cada regla están en
[docs/BRANCHING.md](docs/BRANCHING.md). La documentación y los mensajes de commit
van en español.

## Ramas

```
main        producción (Vercel). Protegida: solo entra por pull request.
dev-herni   espacio de Herni (usuario git `hcalarcon`).
dev-fede    espacio de Fede (usuario git `FedeAtadia`).
```

## Al empezar cada sesión

1. `git branch --show-current` y `git config user.name`. La rama tiene que ser la
   `dev-*` de quien está trabajando. **Si estás en `main` o en la rama del otro,
   no cambies nada: avisá.**
2. `git status`. Si hay cambios sin commitear que no reconocés, preguntá antes de
   tocarlos.
3. `git fetch` y `git merge origin/main` (traé lo nuevo antes de escribir código).
4. Leé [docs/PLAN.md](docs/PLAN.md): qué tarea toma esta sesión y de quién es.

## Reglas

**Quién toca qué**

1. Cada persona y su Claude **pushean solo a su rama** `dev-*`. Nunca a la del otro
   ni a `main`.
2. Las tareas de [docs/PLAN.md](docs/PLAN.md) llevan dueño (`[herni]` o `[fede]`).
   No tomes una tarea de otro; si necesitás algo suyo, dejalo anotado ahí.

**Cómo entra algo a `main`**

3. Solo por pull request desde una `dev-*`. **Lo mergea Herni**, el dueño. Claude
   puede abrir el PR y redactar su descripción, pero nunca lo aprueba ni lo mergea.
4. El PR de Fede necesita la **aprobación de Herni** y CI en verde. El de Herni
   necesita CI en verde; Fede puede mirarlo y comentar, pero no lo bloquea. Como
   trabajan juntos, quien abre un PR se lo avisa al otro en persona.
5. Antes de abrir el PR: `main` adentro de tu rama, y `npm test`, lint y build.
   Los conflictos se resuelven en tu rama, nunca en `main`.
6. Un PR, una funcionalidad. Cuando algo entra a `main`, los dos traen `main` a su
   rama ese mismo día.

**Cómo se escribe el código**

7. Antes de cambiar comportamiento, seguí [docs/WORKFLOW.md](docs/WORKFLOW.md):
   requisito en [docs/SPEC.md](docs/SPEC.md) → test que falla → código → suite,
   lint y build. Spec, test y código van en el mismo commit.
8. Commits chicos, en español, que digan qué cambió y por qué.

**Base de datos**

9. **Cada uno tiene su propio proyecto de Supabase.** Lo que se comparte son las
   migraciones en git, no la base.
   - Una migración que ya llegó a `main` **no se edita**: se agrega otra.
   - Toda tabla nueva lleva RLS filtrando por `business_id`, en la misma migración.
   - Después de una migración: `npm run db:types` y commitear `src/types/database.ts`.
   - Avisá antes de crear una migración si otra tarea del plan también toca el esquema.

**Prohibido sin el OK explícito del humano**

10. `git push --force`, `git reset --hard`, borrar ramas, reescribir historia ya
    pusheada, `db reset` o `db push` contra una base que no sea la propia, y
    cualquier cambio directo en `main`.
11. Leer, mostrar o copiar `.env*`, tokens o claves. Nunca se commitea un `.env`:
    solo las plantillas `.env*.example`. Si necesitás una clave, pedísela al humano.

## Comandos

Solo `smaalacarta/admin/` tiene toolchain (correr desde ahí):

```bash
npm run dev       # next dev en localhost:3000
npm test          # vitest
npm run lint
npm run build
npm run db:link   # -- --project-ref <REF>, una sola vez
npm run db:push   # aplica migraciones a tu proyecto (usa .env.supabase)
npm run db:types  # regenera src/types/database.ts
```

`web/` y `landing/` no tienen build: `web/` se sirve con cualquier servidor
estático, porque pide `/data/...` y `/templates/...` con rutas absolutas.
`npm test` en la raíz corre los tests de `web/` y `landing/`.

## Arquitectura

Todo el código vive bajo `smaalacarta/`, en tres proyectos sin build compartido:

- `landing/` — sitio de venta estático (HTML/CSS/JS).
- `web/` — menús públicos estáticos, dirigidos por JSON; Vercel publica con
  `web/` como raíz (`vercel.json` define las rutas).
- `admin/` — panel Next.js 16 + Supabase donde cada negocio gestiona categorías,
  productos, promociones y pedidos. Todavía no está conectado a los menús de `web/`.

### web/

- **Rutas (`web/vercel.json`)**: `/moderno`, `/clasico`, `/minimal` son demos HTML
  fijas en `apps/menu-html/*`. `/:cliente/pdf` y `demo.*/pdf` van a `apps/pdf`.
  Cualquier otra ruta sin extensión va a `apps/menu-app/index.html`.
- **`apps/menu-app/app.js`** es el menú dinámico con carrito. `resolveAppConfig()`
  elige el negocio: primero `?demo=<slug>` / `?cliente=<slug>` (para desarrollo
  local), después un mapa de hostnames escrito a mano (`DOMAINS`). Un cliente
  nuevo con subdominio propio necesita una entrada ahí.
- **Datos**: `data/clientes/<slug>/` o `data/demos/<slug>/` con `config.json`
  (nombre, `template`, `telefono` de WhatsApp, `colores`, `horarios` que pueden
  cruzar medianoche, `pdf.file` opcional) y `menu.json`.
- **Pedidos**: el carrito vive en localStorage y el checkout abre un link de
  WhatsApp con el mensaje armado. No hay backend.

### admin/

- **Antes de escribir código de Next.js**, leé la guía en
  `admin/node_modules/next/dist/docs/`: esta versión (16) cambió convenciones. Por
  ejemplo, `middleware` se llama `proxy.ts`. Ver `admin/AGENTS.md`.
- App Router en `admin/app/`, código compartido en `admin/src/` (alias `@/` →
  `src/`). Tailwind v4. La paleta de la marca (`brand`, `accent`, `cream`, `line`)
  está en `app/globals.css` y sale de `landing/landing.css`.
- **Clientes de Supabase**: `src/lib/supabase-server.ts` (SSR, con cookies: server
  components, server actions y `src/lib/db/*`), `src/lib/supabase-browser.ts`
  (componentes cliente) y `src/lib/supabase.ts` (cliente anónimo simple). Variables
  en `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  La CLI lee `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` de `.env.supabase`.
- **Autenticación**: `proxy.ts` refresca la sesión y redirige según
  `src/lib/auth/access.ts`. Las pantallas están en `app/(auth)/` (login, registro,
  recuperar, restablecer) y sus Server Actions en `app/(auth)/actions.ts`. Un
  usuario sin negocio va a `/sin-negocio`, nunca en bucle a `/login`.
- **Multi-negocio**: `getCurrentBusiness()` resuelve usuario → `business_users`
  (con `role`) → `businesses`; las páginas del panel usan `requireBusiness()`.
  Toda tabla de recursos (`categories`, `products`, `promotions`, `orders`) se filtra
  por `business_id`, en las consultas **y** en el RLS de `supabase/migrations/`.
- **Flujo de datos**: el `page.tsx` (servidor) lee con `src/lib/db/<recurso>.ts`
  (helpers genéricos en `db/resources.ts`) y pasa los datos a un `*Client.tsx`. Las
  mutaciones son Server Actions en `app/dashboard/<sección>/actions/` que reciben
  `businessId` explícito y delegan en `src/lib/db/*`.
