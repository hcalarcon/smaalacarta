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
- **Superadmin** (`/superadmin`): el equipo de SMA a la Carta crea los negocios y sus
  cuentas; no hay registro público ni se envían mails. `super_admins` (tabla sin
  escritura desde la app) + `is_super_admin()` y `create_business_with_owner()` en la
  migración `*_superadmin.sql`. Las reglas de alta y de restablecimiento están en
  `src/lib/superadmin/accounts.ts` con dependencias inyectadas, y
  `src/lib/superadmin/deps.ts` las conecta a Supabase. Cada cuenta nace con una
  contraseña temporal (`password.ts`) que se muestra **una sola vez**; la marca
  `must_change_password` vive en `app_metadata` (solo la escribe el servidor) y
  `proxy.ts` deja a esa cuenta solo en `/cambiar-contrasena` hasta que elija una
  propia (`src/lib/auth/change-password.ts`). `SUPABASE_SERVICE_ROLE_KEY` (solo
  servidor, `src/lib/supabase-admin.ts` con `server-only`) se usa **únicamente** para
  crear cuentas, restablecer contraseñas y borrar la marca de temporal, y siempre
  después de comprobar quién pide la acción.
- **Tests contra Postgres real**: `src/test/db.ts` levanta PGlite con los stubs de
  Supabase y aplica las migraciones; `src/lib/db/*.test.ts` prueban el RLS. Toda
  migración con políticas nuevas se prueba ahí.
- **Orden y promociones**: `sort_order` en categorías y productos
  (`src/lib/menu/ordering.ts`, lectura ordenada en `db/categories.ts`, guardado en
  `db/ordering.ts`). Las promociones (`src/lib/promotions/`, `db/promotions.ts`) son
  `percent` o `combo`, con sus productos en `promotion_items`; se guardan con
  `save_promotion()` (atómica, con los permisos de quien la llama). El arrastrar y
  soltar usa `@dnd-kit` (`components/menu/Sortable.tsx` y el editor de promociones).
  Las acciones nuevas toman el negocio de `requireBusiness()`, no del navegador.
- **Configuración y menú público**: `business_settings` (una fila por negocio; se
  guarda con `save_business_settings()`, atómica junto con el WhatsApp) y
  `public_menu(slug)`, que cualquiera puede llamar sin sesión y solo entrega lo
  publicado y activo. Reglas puras de horarios y datos en `src/lib/settings/`. En
  `web/`, `apps/menu-app/lib/public-menu.js` la consume con fallback a los JSON, y
  `supabase-config.js` lleva la dirección y la publishable key (públicas; la clave de
  servicio nunca va en `web/`).
- **Extras del negocio e imágenes**: dirección, Instagram, Facebook y cierre temporal
  viven en `business_settings` (`src/lib/settings/social.ts` normaliza `@usuario` a
  dirección https). Las imágenes van al bucket `business-images`, en la carpeta
  `<business_id>/` (`src/lib/storage/images.ts`, `components/ui/ImageUploader.tsx`, que
  sube con la sesión del usuario: lo limita el RLS de Storage). En `web/`, los textos de
  cada negocio se **escapan siempre** antes de armar HTML (`lib/html.js`), y el negocio
  sale del subdominio (`lib/hostname.js`). La lista de slugs reservados está en tres
  lugares que deben coincidir (migración, `superadmin/validation.ts` y `hostname.js`),
  con tests que lo comprueban.
- **Multi-negocio**: `getCurrentBusiness()` resuelve usuario → `business_users`
  (con `role`) → `businesses`; las páginas del panel usan `requireBusiness()`.
  Toda tabla de recursos (`categories`, `products`, `promotions`, `orders`) se filtra
  por `business_id`, en las consultas **y** en el RLS de `supabase/migrations/`.
- **Flujo de datos**: el `page.tsx` (servidor) lee con `src/lib/db/<recurso>.ts`
  (helpers genéricos en `db/resources.ts`) y pasa los datos a un `*Client.tsx`. Las
  mutaciones son Server Actions en `app/dashboard/<sección>/actions/` que reciben
  `businessId` explícito y delegan en `src/lib/db/*`.
