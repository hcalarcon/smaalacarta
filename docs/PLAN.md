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

**Modelo.** No hay registro público: las cuentas y los negocios los crea el equipo de SMA a la Carta (el superadmin) desde `/superadmin`, y el resto de los usuarios solo puede entrar y recuperar su contraseña.

**Diseño elegido.** Tabla `super_admins` (un usuario que no pertenece a ningún negocio) y sección `/superadmin` dentro de este admin. **Sin mails**: como el mail por defecto de Supabase solo entrega a miembros del equipo del proyecto y permite 2 por hora, las cuentas se crean con una **contraseña temporal** que el superadmin ve una sola vez y le pasa a la persona; en su primer ingreso solo puede llegar a "Cambiar contraseña" y elige una propia. Si la olvida, el superadmin le restablece una temporal nueva. El superadmin usa RLS para ver y gestionar miembros; crear un negocio solo se puede con la función atómica `create_business_with_owner`. La clave de servicio se usa solo para crear cuentas y cambiar contraseñas, después de comprobar quién pide la acción. Requisitos en `docs/SPEC.md` (ADMIN-SUPER-1 a 11).

Hecho en el código:

- [x] [herni] Sacar el registro público del admin (`/registro`)
- [x] [herni] Decidir el diseño del superadmin (ver arriba)
- [x] [herni] Requisitos `ADMIN-SUPER-*` en `docs/SPEC.md`
- [x] [herni] Migración `20260925120000_superadmin.sql`, aplicada y probada en Postgres real (PGlite) con `src/lib/db/superadmin.test.ts`
- [x] [herni] Pantallas: listado de negocios, alta de negocio con su cuenta dueña, y detalle con alta, baja y restablecimiento de contraseña de miembros (`/superadmin`)
- [x] [herni] Contraseña temporal y cambio obligatorio en el primer ingreso (`/cambiar-contrasena`)

Pasos de Supabase:

- [x] [herni] Apagar el registro público (**Authentication → Sign In / Providers → "Allow new users to sign up"**)
- [x] [herni] Redirect URL `http://localhost:3000/auth/callback`
- [x] [herni] Cargar el primer superadmin (SQL en el encabezado de la migración)
- [x] [herni] `SUPABASE_SERVICE_ROLE_KEY` en `admin/.env.local`
- [x] [herni] **Probar a mano** (hecho: alta con contraseña temporal, ingreso y cambio de contraseña): entrar como superadmin (debe llevarte a `/superadmin` o mostrar el botón "Superadmin"), crear un negocio con un email alternativo, copiar la contraseña temporal, entrar en una ventana privada con esa cuenta (debe llevarte a "Elegí tu contraseña"), elegir una propia y ver su panel; restablecer su contraseña desde el detalle del negocio; y con un usuario común comprobar que `/superadmin` lo manda a `/dashboard`
- [ ] [herni] Cuando haya un SMTP propio (plan pago o proveedor externo): reevaluar `/recuperar` para clientes y las plantillas de mail. Hasta entonces, la recuperación la hace el superadmin

## Etapa 5 — Que el admin compile

- [x] [herni] Terminar lo de `category_id` en productos (eran 7 errores de TypeScript y 2 de lint). De paso se borró `/dashboard/products`, una pantalla vieja fuera del menú que creaba productos sin categoría
- [x] [herni] Tipar `Product.category_id` como nullable (se pone en null al borrar la categoría)
- [x] [herni] `npm run lint` y `npm run build` en verde
- [x] [herni] Quitar los `continue-on-error` del CI para lint y build del admin
- [ ] [herni] PR hacia `main`

## Etapa 5b — Menú y promociones

Hecho en el código (migración `20260926000000_orden_y_promociones.sql`, ya aplicada a la base de Herni):

- [x] [herni] Borrar productos, activar/desactivar con un clic y sin recargar la página
- [x] [herni] Ordenar categorías y productos arrastrando (`sort_order`), y guardar el orden
- [x] [herni] Promociones: tipo **descuento %** o **combo a precio fijo**, armadas arrastrando productos del menú (`/dashboard/promotions`), con precio final y ahorro en vivo
- [ ] [herni] **Probar a mano en el navegador** el arrastrar y soltar (categorías, productos y armado de promociones, con mouse y en el celular) y el borrado
- [ ] [por asignar] Imagen de producto (Supabase Storage entra en el plan gratuito) y `featured`
- [ ] [por asignar] Vigencia de las promociones (fechas o días de la semana) y otros tipos (2x1)

## Etapa 6 — Menú público desde el admin

**Diseño.** La función `public_menu(slug)` de Supabase entrega el menú publicado con el mismo formato que los JSON de `web/`; el menú público la pide sin sesión (`web/apps/menu-app/lib/public-menu.js`) y, si no está o falla, usa los JSON como hasta ahora. La configuración (plantilla, colores, cabecera, horarios, WhatsApp, si es público) vive en `business_settings` y se edita en `/dashboard/settings`. Las promociones salen como la categoría "Ofertas". Requisitos en `docs/SPEC.md` (ADMIN-CONFIG y PUBLICO).

Hecho en el código (migración `20260927000000_configuracion_y_menu_publico.sql`, ya aplicada a la base de Herni):

- [x] [herni] Tabla `business_settings` y pantalla de Configuración (publicar, plantilla, colores, cabecera, descripción, horarios por día con turnos y cierre, WhatsApp)
- [x] [herni] Función `public_menu` y adaptador en `web/`, con fallback a los JSON
- [ ] [herni] En `web/apps/menu-app/supabase-config.js`, completar `url` y `key` (Supabase → Project Settings → API; son públicas por diseño: la publishable key, **nunca** la secret). Vacío, el menú usa solo los JSON
- [ ] [herni] **Probar a mano**: en Configuración, completar y publicar; abrir el menú con `?cliente=<slug>` (servidor estático sobre `web/`) y ver colores, cabecera, horarios, productos en su orden y las promociones en "Ofertas"; despublicar y ver que vuelve a los JSON
- [x] [herni] Dirección, Instagram y Facebook, y **cierre temporal** (con mensaje y fecha de reapertura que termina sola), en Configuración y en el menú público
- [x] [herni] **Imágenes por bucket** de Supabase Storage (`business-images`, 2 MB, JPG/PNG/WebP, cada negocio en su carpeta): cabecera del menú e imagen de cada producto
- [x] [herni] **Subdominio = slug** en el código (`web/apps/menu-app/lib/hostname.js`): `<slug>.smaalacarta.com.ar` abre el negocio sin declararlo en `app.js`; los slugs reservados (`www`, `admin`, `app`, `api`, `demo`, `moderno`…) no se pueden usar
- [x] [herni] Se escapan todos los textos del negocio antes de mostrarlos en el menú público (`lib/html.js`): un nombre con HTML ya no puede ejecutar código en el navegador de los clientes
- [ ] [herni] **Comodín de Vercel** (`*.smaalacarta.com.ar`). El motivo habitual de que no funcione: Vercel solo emite el certificado de un comodín si **el dominio usa sus nameservers** (`ns1.vercel-dns.com` y `ns2.vercel-dns.com`). En orden:
  1. En Vercel → **Domains**, agregar `smaalacarta.com.ar` y, en el proyecto de los menús, `*.smaalacarta.com.ar`. Vercel muestra los nameservers que pide.
  2. **Antes de cambiar nada en NIC**, cargar en Vercel → Domains → **DNS Records** todos los registros que hoy tiene el dominio (apex y `www` hacia la landing, y sobre todo los del **mail**: `MX`, `TXT`/SPF/DKIM). Al delegar, los registros del proveedor actual dejan de valer.
  3. En **nic.ar**, cambiar la delegación del dominio a `ns1.vercel-dns.com` y `ns2.vercel-dns.com`. Puede tardar horas.
  4. Asignar cada dominio a su proyecto: apex y `www` → landing; `*` → menús. Un subdominio puntual (por ejemplo `www`) tiene prioridad sobre el comodín.
  5. Repetir para `smaalacarta.online` si se va a usar.
  6. Probar con un negocio publicado: `https://<slug>.smaalacarta.com.ar`.
- [ ] [por asignar] Dominio propio por negocio (por ejemplo `menu.minegocio.com`): columna en la base y una consulta por host; se evalúa después del comodín
- [ ] [por asignar] Migrar los clientes de `data/clientes/*` a Supabase, uno por uno
- [ ] [por asignar] Limpiar del bucket las imágenes que quedaron sin uso al reemplazarlas (hoy quedan huérfanas, ocupan espacio)
- [ ] [por asignar] Pausa de proyectos gratuitos de Supabase (una semana sin actividad): evaluar un chequeo periódico o el plan pago cuando haya clientes reales

**Decisión:** el envío y el retiro **no** se gestionan en el sistema; se arreglan con cada cliente por WhatsApp.

## Etapa 7 — Pendientes técnicos (backlog)

- [ ] [por asignar] Permisos por `role` en `businesses`: hoy cualquier miembro puede editar el negocio, incluido el `slug`
- [ ] [por asignar] Políticas RLS para `anon` (lectura del menú público), junto con la Etapa 6
- [ ] [por asignar] `getCurrentBusiness()` con varios negocios por usuario: hoy `.maybeSingle()` falla y redirige a `/login`
- [x] Flujo de alta de negocios y membresías desde el admin: resuelto en la Etapa 4 (superadmin)
