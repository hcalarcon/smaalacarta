# Plan de trabajo — SMA a la Carta

> Plan compartido del proyecto (con Fede) para llegar a una primera versión que funcione.
> Al empezar una sesión: _"Leé docs/PLAN.md y seguimos desde la primera tarea sin tildar."_

Última actualización: 25/09/2026

---

## Contexto

- **Repo**: tres proyectos bajo `smaalacarta/`: `landing/` (estático), `web/` (menús públicos en JSON, en Vercel) y `admin/` (Next.js 16 + Supabase, en desarrollo y todavía no conectado a `web/`).
- **Ramas** (una sola línea, sin conflictos entre sí):
  `main` → `development` (PR #1: docs, CI, Vitest) → `feat/supabase-esquema` (migraciones y cambio de key).
- **Flujo adoptado** (`docs/BRANCHING.md`): rama de trabajo → PR a `development` → PR a `main` con merge commit (sin squash).
- **Supabase**: proyecto **nuevo y vacío**, dedicado a este repo, en otra cuenta de Supabase. El proyecto viejo queda descartado.
- **Conexión por `.env`**: la app lee `admin/.env.local` y la CLI lee `admin/.env.supabase` (token y contraseña de esa cuenta) a través de los scripts `db:*`, así nadie tiene que cambiar de cuenta en su CLI. Plantillas en `admin/.env.example` y `admin/.env.supabase.example`.
- **Sin Docker**: no se puede correr `supabase db reset` en local. El proyecto nuevo funciona como entorno de prueba y se puede vaciar sin riesgo mientras no tenga datos.

## Decisiones tomadas

1. **Migraciones consolidadas en 2** (base y recursos). La 20260512 se corrige directamente (usar `<tabla>.business_id` en todos los `WITH CHECK`). Se borran la 20260514000100 (el arreglo de RLS) y la 20260513 (no hace nada), y las columnas de la 20260514000000 pasan a los `CREATE TABLE`.
2. **Columnas**: se usa `active` en `products` y `categories`. Se eliminan `available` y `visible`. Si más adelante hace falta "agotado", se agrega con una migración nueva.
3. **Mejoras incluidas desde el inicio**: FK compuesta `(category_id, business_id)` en `products`, y `(select auth.uid())` en todas las políticas.
4. **Variable de entorno**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reemplaza a `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. **CLAUDE.md**: se unifica en uno solo, con la arquitectura de `CLAUDE.mio.md` más las reglas de trabajo del `CLAUDE.md` del repo.

---

## Etapa 1 — Migraciones en `feat/supabase-esquema`

- [x] Renombrar el `CLAUDE.md` local a `CLAUDE.mio.md` (sin commitear)
- [x] Corregir la 20260512 y consolidar las migraciones según las decisiones 1 a 3
- [x] Anotar en `docs/SPEC.md` los pendientes de la Etapa 6
- [x] Revisar el diff y commitear en `feat/supabase-esquema` (sin push todavía)
- [ ] Avisar a Fede que las migraciones cambiaron y que el proyecto de Supabase nuevo es el oficial
- [ ] Invitar a Fede a la organización de Supabase del proyecto nuevo (cada uno usa su propio access token)

## Etapa 2 — Crear la base en el proyecto nuevo

Desde `smaalacarta/admin/`:

- [x] Scripts `db:link`, `db:push` y `db:types` que cargan `.env.supabase` (con `dotenv-cli`)
- [ ] `npm install`
- [ ] Copiar `.env.supabase.example` a `.env.supabase` y completar `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens, en la cuenta del proyecto) y `SUPABASE_DB_PASSWORD`
- [ ] `npm run db:link -- --project-ref <REF>` (el ref está en la URL del proyecto en el panel)
- [ ] `npm run db:push -- --dry-run` y revisar la salida
- [ ] `npm run db:push`
- [ ] `npm run db:types` y revisar el diff de `src/types/database.ts`. Commitear en la misma rama
- [ ] Copiar `.env.example` a `.env.local` y completar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys)
- [ ] Script SQL para el primer negocio y su membresía (el admin todavía no puede crearlos)
      **Pruebas manuales:**
- [ ] Registrar un usuario y verificar que se crea su `profile`
- [ ] Cargar un negocio y una membresía con el script, y después probar el CRUD de categorías y productos
- [ ] Con un segundo usuario de otro negocio: confirmar que no ve ni puede modificar datos del primero
      Si algo falla al aplicar: vaciar el proyecto, corregir la migración y repetir.

## Etapa 3 — Integrar en `main`

- [ ] Push de `feat/supabase-esquema` y PR hacia `development`. Esperar CI en verde y mergear
- [ ] Unificar `CLAUDE.md` (decisión 5) y borrar `CLAUDE.mio.md`
- [ ] PR `development` → `main` con merge commit (con salteo de admin, porque no se puede aprobar el propio PR)
- [ ] Borrar la rama `docs/flujo-de-trabajo` (ya está incluida)
- [ ] `git pull` en `main` local
- [ ] Opcional: instalar GitHub CLI (`winget install GitHub.cli` y `gh auth login`) para que Claude Code maneje los PRs

## Etapa 4 — Que el admin compile

Rama `fix/admin-productos` (desde `development`):

- [ ] Terminar lo de `category_id` en productos (hoy hay 7 errores de TypeScript y 2 de lint)
- [ ] Tipar `Product.category_id` como nullable (se pone en null al borrar la categoría)
- [ ] `npm run lint` y `npm run build` en verde
- [ ] Quitar los `continue-on-error` del CI para lint y build del admin
- [ ] PR hacia `development`

## Etapa 5 — Roadmap del producto

- [ ] Revisar las "brechas conocidas" de `docs/SPEC.md` y priorizarlas
- [ ] **Diseñar la conexión admin ↔ menús públicos** (`web/` hoy lee JSON estáticos). Es una decisión de arquitectura: diseñarla antes de escribir código. Incluye las políticas `anon` de lectura
- [ ] Plan de migración de los clientes actuales (`data/clientes/*`) a Supabase

## Etapa 6 — Pendientes técnicos (backlog)

- [ ] Permisos por `role` en `businesses`: hoy cualquier miembro puede editar el negocio, incluido el `slug`
- [ ] Políticas RLS para `anon` (lectura del menú público), junto con la Etapa 5
- [ ] `getCurrentBusiness()` con varios negocios por usuario: hoy `.maybeSingle()` falla y redirige a `/login`
- [ ] Flujo de alta de negocios y membresías desde el admin (hoy se hace a mano con SQL)

