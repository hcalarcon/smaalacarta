# Plan de trabajo — SMA a la Carta

> Plan compartido de Herni y Fede para llegar a una primera versión que funcione.
> Al empezar una sesión: _"Leé docs/PLAN.md y seguimos desde la primera tarea sin tildar de mi nombre."_

Última actualización: 25/09/2026

**Dueños.** Cada tarea lleva `[herni]`, `[fede]` o `[por asignar]`. Antes de tomar
una `[por asignar]`, cambiá la etiqueta por tu nombre y pusheala a tu rama. No
tomes una tarea de otro (ver [`CLAUDE.md`](../CLAUDE.md)).

---

## Contexto

- **Repo público**, tres proyectos bajo `smaalacarta/`: `landing/` (estático), `web/` (menús públicos en JSON, en Vercel) y `admin/` (Next.js 16 + Supabase, todavía no conectado a `web/`).
- **Ramas**: `main` es producción; cada uno trabaja en la suya, `dev-herni` y `dev-fede`, y entra a `main` por pull request. Herni, el dueño, mergea; lo de Fede además necesita su aprobación. Las reglas están en [`CLAUDE.md`](../CLAUDE.md) (para los dos Claude) y el porqué en [`BRANCHING.md`](BRANCHING.md).
- **Supabase**: cada uno con su **propio proyecto**. Lo compartido son las migraciones en git. La conexión va por `.env`: la app lee `admin/.env.local` y la CLI lee `admin/.env.supabase` (token y contraseña) a través de los scripts `db:*`, así nadie cambia de cuenta en su CLI. Plantillas en `admin/.env.example` y `admin/.env.supabase.example`.
- **Sin Docker**: no se puede correr `supabase db reset` en local. La base propia sirve de entorno de prueba y se puede vaciar mientras no tenga datos que importen.

---

## Decisiones tomadas

1. **Migraciones consolidadas en 2** (base y recursos). Sin `available` ni `visible`: se usa `active` en `products` y `categories`. Si más adelante hace falta "agotado", se agrega con una migración nueva.
2. **Mejoras incluidas desde el inicio**: FK compuesta `(category_id, business_id)` en `products`, y `(select auth.uid())` en todas las políticas.
3. **Variable de entorno**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` reemplaza a `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Ramas**: `main` + `dev-herni` + `dev-fede`, sin rama `development` intermedia. Se agrega una integración solo si el equipo crece.
5. **CLAUDE.md** unificado: contrato de trabajo de los dos Claude más la arquitectura.

---

## Etapa 1 — Migraciones

- [x] Consolidar las migraciones según las decisiones 1 y 2
- [x] Anotar en `docs/SPEC.md` los pendientes técnicos (Etapa 7)
- [x] Scripts `db:link`, `db:push` y `db:types` que cargan `.env.supabase` (con `dotenv-cli`)
- [ ] [herni] Avisar a Fede que las migraciones cambiaron y que ahora cada uno usa su propio proyecto de Supabase

## Etapa 2 — Base propia y pruebas manuales

Desde `smaalacarta/admin/`. Cada uno lo hace con su proyecto de Supabase.

- [x] [herni] `npm install`, `.env.supabase`, `npm run db:link -- --project-ref <REF>`, `db:push -- --dry-run`, `db:push`
- [x] [herni] `npm run db:types` y commitear `src/types/database.ts`
- [x] [herni] `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys)
- [x] [herni] Registrarse, iniciar sesión y crear una categoría desde el panel
- [ ] [fede] Crear su proyecto de Supabase y repetir: `.env.supabase`, `db:link`, `db:push`, `db:types`, `.env.local`
- [ ] [herni] En Supabase, **Authentication → URL Configuration**: Site URL `http://localhost:3000` y en Redirect URLs `http://localhost:3000/auth/callback` (sin esto los links de los mails de confirmación y de recuperación no vuelven a la app). Al publicar el admin, agregar también su dominio
- [ ] [herni] Revisar el envío de mails de recuperación: el servicio de mail por defecto de Supabase tiene un límite muy bajo por hora; si no alcanza, configurar un SMTP propio (**Authentication → Emails → SMTP Settings**)
- [ ] [herni] Un usuario sin negocio (creado desde **Authentication → Users**) ve `/sin-negocio` y puede cerrar sesión
- [ ] [herni] Recuperar la contraseña desde `/recuperar`: llega el mail, el link abre `/restablecer` y la contraseña nueva funciona
- [ ] [herni] Con un segundo usuario de otro negocio: confirmar que no ve ni puede modificar datos del primero
- [ ] [herni] Probar el CRUD de productos (hoy tiene errores conocidos, ver Etapa 5)

Si algo falla al aplicar una migración: vaciar la base propia, corregir la migración y repetir.

## Etapa 3 — Ordenar las ramas y activar las reglas

- [x] [herni] Commitear el trabajo pendiente (autenticación, estética del admin, contrato y documentos) en una rama y pushearla
- [x] [herni] Crear `dev-herni` y `dev-fede` desde ese mismo punto y pushearlas
- [x] [herni] PR `dev-herni` → `main`, mergeado con merge commit. Como el repo todavía no tiene reglas activas, este es el último PR sin ellas. Fede lo puede mirar, pero no lo bloquea
- [x] [herni] Aplicar los rulesets (`.github/rulesets/main.json` y `dev.json`) y verificar (ver `BRANCHING.md`)
- [ ] [herni] Borrar las ramas viejas: `development`, `feat/supabase-esquema`, `feat/admin-auth-estetica` y `docs/flujo-de-trabajo`
- [ ] [fede] `git fetch`, cambiarse a `dev-fede` y traer `main`
- [x] [herni] Opcional: instalar GitHub CLI (`winget install GitHub.cli` y `gh auth login`) para que Claude Code maneje los PRs

## Etapa 4 — Superadmin y alta de cuentas

**Modelo.** No hay registro público: las cuentas y los negocios los crea el equipo de SMA a la Carta (el superadmin), y el resto de los usuarios solo puede entrar y recuperar su contraseña. Hoy las cuentas se crean a mano en **Authentication → Users** y el negocio con SQL.

- [x] [herni] Sacar el registro público del admin (`/registro`); el login aclara que las cuentas las crea el equipo
- [ ] [herni] **Apagar el registro público en Supabase** (**Authentication → Sign In / Providers → "Allow new users to sign up"**). Es imprescindible: la clave pública del proyecto viaja en el navegador y, con el registro encendido, cualquiera podría crear cuentas llamando a la API aunque el admin no tenga pantalla para eso
- [ ] [herni] **Decidir el diseño del superadmin.** Preguntas abiertas:
  - Dónde se define: una tabla `super_admins` (un usuario que no pertenece a ningún negocio) o un rol dentro de `business_users`.
  - Dónde se usa: una sección `/superadmin` dentro de este admin, o un script de línea de comandos.
  - Cómo se crea una cuenta: la API de administración de Supabase (`auth.admin.createUser` / invitación por mail) exige la clave `service_role`, que da acceso total a la base. Solo puede vivir en el servidor, en una variable de entorno sin el prefijo `NEXT_PUBLIC_`, y nunca se commitea.
- [ ] [por asignar] Requisitos `ADMIN-SUPER-*` en `docs/SPEC.md` (crear negocio, crear la cuenta dueña, asignar miembros, quién puede hacerlo) y su brecha de RLS
- [ ] [por asignar] Migración del superadmin con sus políticas de RLS. Probarla en Postgres real (PGlite) como se hizo con las de los negocios
- [ ] [por asignar] Crear el primer superadmin (paso manual, documentado en `BRANCHING.md` o `CLAUDE.md`)
- [ ] [por asignar] Pantalla para dar de alta un negocio junto con su cuenta dueña, y para asignar o quitar miembros
- [ ] [por asignar] Confirmar que `/recuperar` solo sirve a cuentas ya creadas y no revela si un email existe (ADMIN-AUTH-9)

## Etapa 5 — Que el admin compile

- [ ] [por asignar] Terminar lo de `category_id` en productos (hoy hay 7 errores de TypeScript y 2 de lint)
- [ ] [por asignar] Tipar `Product.category_id` como nullable (se pone en null al borrar la categoría)
- [ ] [por asignar] `npm run lint` y `npm run build` en verde
- [ ] [por asignar] Quitar los `continue-on-error` del CI para lint y build del admin
- [ ] [por asignar] PR hacia `main`

## Etapa 6 — Roadmap del producto

- [ ] [por asignar] Revisar las "brechas conocidas" de `docs/SPEC.md` y priorizarlas
- [ ] [por asignar] **Diseñar la conexión admin ↔ menús públicos** (`web/` hoy lee JSON estáticos). Es una decisión de arquitectura: diseñarla antes de escribir código. Incluye las políticas `anon` de lectura
- [ ] [por asignar] Plan de migración de los clientes actuales (`data/clientes/*`) a Supabase

## Etapa 7 — Pendientes técnicos (backlog)

- [ ] [por asignar] Permisos por `role` en `businesses`: hoy cualquier miembro puede editar el negocio, incluido el `slug`
- [ ] [por asignar] Políticas RLS para `anon` (lectura del menú público), junto con la Etapa 6
- [ ] [por asignar] `getCurrentBusiness()` con varios negocios por usuario: hoy `.maybeSingle()` falla y redirige a `/login`
- [ ] [por asignar] Flujo de alta de negocios y membresías desde el admin: pasa a la Etapa 4 (superadmin)
