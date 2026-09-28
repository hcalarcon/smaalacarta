# Plan de trabajo — SMA a la Carta

> Plan compartido de Herni y Fede para llegar a una primera versión que funcione.
> Al empezar una sesión: _"Leé docs/PLAN.md y seguimos desde la primera tarea sin tildar de mi nombre."_

Última actualización: 27/09/2026

**Dueños.** Cada tarea lleva `[herni]`, `[fede]` o `[por asignar]`. Antes de tomar
una `[por asignar]`, cambiá la etiqueta por tu nombre y pusheala a tu rama. No
tomes una tarea de otro (ver [`CLAUDE.md`](../CLAUDE.md)).

---

## Contexto

- **Repo público**, tres proyectos bajo `smaalacarta/`: `landing/` (estático), `web/` (menús públicos: interactivo, estático y PDF, en Vercel) y `admin/` (Next.js 16 + Supabase; de ahí salen los datos que muestra `web/`).
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
6. **Un negocio puede tener varios servicios a la vez, independientes entre sí**
   (Etapa 6e): menú interactivo (`<slug>.smaalacarta.com.ar`, con carrito y
   pedidos), menú estático (`smaalacarta.com.ar/<slug>/menu.html`, sin carrito,
   mismo dato que el interactivo) y menú en PDF (QR a un archivo en un bucket
   aparte). El interactivo y el estático comparten la bandera `published`; el
   PDF es independiente porque un negocio del plan gratis puede no publicar
   nunca un menú digital. Nada de esto vive detrás de un framework nuevo: se
   arma con el mismo patrón sin build que ya tiene `web/` (funciones en
   `web/api/*.js`, como `manifest.js`).

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
- [x] [herni] **Comodín de Vercel** (`*.smaalacarta.com.ar`) con el DNS en **Cloudflare**. Confirmado en vivo (26/09/2026): `pruebacualquiera.smaalacarta.com.ar` resuelve y responde `200` con certificado válido. Quedan los pasos de referencia por si hace falta repetirlos (por ejemplo, para `smaalacarta.online`):
  1. En el proyecto de los menús → **Settings → Domains**, agregar `*.smaalacarta.com.ar`.
  2. En Vercel → **Domains** (a nivel del equipo) → `smaalacarta.com.ar` → **DNS Records** → **Enable Vercel DNS**. **No** cambiar los nameservers en el registro del dominio: siguen en Cloudflare.
  3. En **Cloudflare → DNS**, agregar dos registros `NS` con nombre `_acme-challenge` y valores `ns1.vercel-dns.com` y `ns2.vercel-dns.com`. Solo delegan la validación del certificado y **tienen que quedarse** para que se renueve.
  4. En Cloudflare, agregar el `CNAME` con nombre `*` hacia `cname.vercel-dns-0.com` (o el valor que muestre Vercel), en **"solo DNS" (nube gris), sin proxy**: con la nube naranja Vercel no puede validar ni renovar el certificado.
  5. Esperar la propagación y mirar el estado en Settings → Domains. Un subdominio puntual (por ejemplo `www` o `admin`) que ya tenga su propio registro tiene prioridad sobre el comodín.
  6. Probar con un negocio publicado: `https://<slug>.smaalacarta.com.ar`.
  7. Si se va a usar `smaalacarta.online`, repetir para ese dominio.
- [ ] [por asignar] Dominio propio por negocio (por ejemplo `menu.minegocio.com`): columna en la base y una consulta por host; se evalúa después del comodín
- [ ] [por asignar] Migrar los clientes de `data/clientes/*` a Supabase, uno por uno
- [ ] [por asignar] Limpiar del bucket las imágenes que quedaron sin uso al reemplazarlas (hoy quedan huérfanas, ocupan espacio)
- [ ] [por asignar] Pausa de proyectos gratuitos de Supabase (una semana sin actividad): evaluar un chequeo periódico o el plan pago cuando haya clientes reales

**Decisión:** el envío y el retiro **no** se gestionan en el sistema; se arreglan con cada cliente por WhatsApp.

## Etapa 6b — Pedidos y seguimiento

**Diseño.** Confirmar un pedido en el menú lo guarda en el sistema **antes** de abrir WhatsApp (`create_public_order`); el cliente ve "Gracias por tu pedido", envía el mensaje por WhatsApp como siempre y puede seguir el estado en `https://<slug>.smaalacarta.com.ar/pedido/<código>` (código aleatorio de 20 caracteres). El negocio ve y gestiona los pedidos en `/dashboard/orders`. Si el menú viene de un JSON, o guardar falla, el pedido sigue solo por WhatsApp. Requisitos en `docs/SPEC.md` (ADMIN-PEDIDOS y SEGUIMIENTO).

Hecho en el código (migración `20260929000000_pedidos.sql`, ya aplicada a la base de Herni):

- [x] [herni] Tablero de pedidos (Nuevos, En curso, Listos, Terminados) con cambio de estado, línea de tiempo, link de seguimiento y actualización cada 20 s
- [x] [herni] Pedido manual para lo que llega por fuera del menú
- [x] [herni] Numeración por negocio (1, 2, 3…), ítems con nombre y precio del momento, estados con transiciones controladas
- [x] [herni] El menú guarda el pedido en el sistema, con precios y total calculados por el servidor, y muestra "Gracias por tu pedido" con el botón de WhatsApp y el link de seguimiento
- [x] [herni] Página pública de seguimiento (`web/apps/tracker`), sin datos personales, que se actualiza sola hasta que el pedido termina; ruta `/pedido/:code` en `web/vercel.json`
- [ ] [herni] **Probar a mano** el circuito: publicar un negocio, hacer un pedido desde su menú, verlo en `/dashboard/orders`, cambiarle el estado y mirar el seguimiento. Un servidor estático no aplica la ruta `/pedido/:code`: en local abrí `apps/tracker/index.html?code=<código>`; la ruta real se prueba en una preview de Vercel
- [ ] [por asignar] **Avisar "tu pedido está listo" por WhatsApp**: con un botón que abre el chat con el mensaje escrito (necesita pedir el teléfono del cliente en el checkout) o, más adelante, automático con la API oficial de WhatsApp. Se deja para cuando haya clientes reales
- [ ] [por asignar] Tiempo real (Supabase Realtime) y un aviso sonoro de pedido nuevo en el tablero
- [ ] [por asignar] Captcha (Cloudflare Turnstile, gratis) si aparecen pedidos falsos; hoy el freno es de 20 pedidos por minuto por negocio
- [ ] [por asignar] Privacidad: definir cuánto tiempo se guardan los pedidos y el nombre de los clientes, y avisarlo en el checkout
- [ ] [por asignar] Métricas en el resumen: pedidos por estado y ventas del día

## Etapa 6c — Mejoras de la landing

Requisitos LANDING-1 a 9 en `docs/SPEC.md`, cubiertos por `landing/landing.test.js`.

- [x] [herni] Botón principal legible sobre la foto y sin el error de tipeo ("ahora")
- [x] [herni] Imagen para compartir real (`assets/og-image.jpg`, 1200×630, 50 KB) y logo liviano (`logo.png`) en lugar del `favicon.svg` de 2,5 MB
- [x] [herni] Enlaces: se sacan Twitter/Instagram sin destino, WhatsApp con el mismo número en toda la página, email con `mailto:`
- [x] [herni] Textos al día (promociones, seguimiento del pedido, panel de administración) y dominio de los menús `smaalacarta.com.ar`
- [x] [herni] Accesibilidad: menú del celular y modal de demos con teclado y lectores, enlace para saltar al contenido, foco visible, `prefers-reduced-motion`
- [x] [herni] Indexación: `robots.txt`, `sitemap.xml`, datos estructurados y manifest corregido
- [x] [herni] Bug: el badge "1er mes gratis" del plan "Menú Web" aparecía sobre el
      hero y se corregía solo al pasar el mouse. `.plan-card.featured` tenía
      `position: relative` (necesario para anclar el badge) pero el plan sin
      `.featured` no; al no tener ancla, se posicionaba respecto a toda la página
      (arriba del todo), y el `transform` del `:hover` lo anclaba momentáneamente
      por accidente. Se movió `position: relative` a `.plan-card` en general
- [ ] [herni] **Revisar los textos nuevos**: que el panel, las promociones y el seguimiento estén realmente incluidos en el plan Subdominio Completo antes de publicarlos
- [ ] [por asignar] Reemplazar `favicon.svg` (lo siguen usando las demos de `web/`) y agregar las redes sociales cuando existan
- [ ] [por asignar] El modal de demos: la sección "Menú Web" muestra el mismo demo
      interactivo que "Subdominio Completo" (no hay todavía una demo real de solo
      lectura; depende del ítem de `static-menu.js` sin respaldo JSON, en la Etapa 6e)

## Etapa 6d — Flujo del pedido, PWA y pulido de las pantallas

Requisitos en `docs/SPEC.md` (PUBLICO-10 a 14, SEGUIMIENTO-9 a 11, PWA-1 a 3, ADMIN-CONFIG-8, ADMIN-RESUMEN-1 a 3). Migraciones `20260930000000` a `20260930000200`, ya aplicadas a la base de Herni.

- [x] [herni] Cierre por horario: el menú avisa "Cerrado ahora · Abrimos hoy a las 20:00", no deja enviar y el servidor también lo rechaza (hora de Argentina; antes usaba la hora del celular)
- [x] [herni] Confirmación del pedido: enviar por WhatsApp y seguirlo en cualquier orden; el seguimiento ofrece enviar si todavía no se envió
- [x] [herni] Seguimiento del pedido con los colores, la imagen y la plantilla del negocio
- [x] [herni] PWA por negocio: manifest con su nombre, color y logo (o el ícono general), y logo opcional en Configuración
- [x] [herni] Menú público en escritorio: columna centrada y grilla de productos
- [x] [herni] Admin: resumen con el link público y aviso de pedidos nuevos, contador en el menú lateral, "pedidos de hoy" con la hora de Argentina, y arreglos en el celular (desborde de productos y error de hidratación al arrastrar)
- [ ] [herni] **Probar en una preview de Vercel**: `/api/manifest?slug=<slug>` (función nueva, no se puede probar con un servidor estático), instalar el menú desde el celular y ver el ícono
- [ ] [por asignar] Botón "Instalar app" dentro del menú (hoy depende de que el navegador lo ofrezca; en iPhone es "Compartir → Agregar a inicio")
- [ ] [por asignar] Horarios de retiro programado cuando el negocio está cerrado (hoy, cerrado = no se toman pedidos)

## Etapa 6e — Tres servicios por negocio: interactivo, estático y PDF

**Diseño.** Un mismo negocio puede tener, a la vez y sin pisarse:

- **Menú interactivo** (ya existe): `<slug>.smaalacarta.com.ar`, con carrito, pedidos
  y seguimiento. El comodín de Vercel que necesita ya está confirmado en vivo (Etapa 6).
- **Menú estático** (nuevo, plan "Menú Web"): `smaalacarta.com.ar/<slug>/menu.html`,
  sin carrito ni pedidos, con el mismo dato que el interactivo (`public_menu(slug)`)
  pero armado como HTML de solo lectura por una función serverless (`web/api/*.js`,
  mismo patrón que `api/manifest.js`), sin agregarle build a `web/`. Comparte la
  bandera `published` con el interactivo: publicar o despublicar afecta a los dos.
- **Menú en PDF** (nuevo, plan gratis "QR + PDF"): el negocio manda el PDF que ya
  tiene (por ahora Herni lo sube a mano, nada de generarlo automático todavía); se
  guarda en un bucket aparte (`business-pdfs`, calcado del RLS de `business-images`
  pero con `application/pdf` y un límite más grande) y un QR lo enlaza. Es
  **independiente de `published`**: un negocio del plan gratis puede no publicar
  nunca un menú digital y aun así tener su PDF andando.

Nada de esto necesita un framework nuevo ni build: se arma con el mismo patrón de
siempre (JS plano, lógica en `lib/*.js` con tests, funciones en `web/api/`).

- [x] [herni] Documentar la decisión de los tres servicios independientes (decisión 6, más arriba)
- [x] [herni] Migración: columna `menu_pdf_url` en `business_settings` (nullable);
      bucket `business-pdfs` (`application/pdf`, ~10 MB, mismo RLS por `business_id`
      que `business-images`); un parámetro más en `save_business_settings`; RPC
      nueva `public_business_pdf(slug)` que no exige `published` (no tocar
      `public_menu`: la usa el interactivo y ya tiene tests). Migración
      `20260930000400_menu_pdf.sql`, aplicada a la base de Herni, con requisitos
      PDF-1 y PDF-2 en `docs/SPEC.md` y tests contra Postgres real
- [x] [herni] `npm run db:types` después de la migración
- [x] [herni] Admin: sección "Menú en PDF" en Configuración (subir archivo, mismo
      patrón que `ImageUploader` pero para PDF)
- [x] [herni] `web/apps/pdf` reescrito: la resolución del negocio pasó a
      `lib/pdf.js`, con tests (antes no tenía ninguno). El negocio del PDF va en
      el path (`/:cliente/pdf`, no en el subdominio: por eso no se reusó
      `lib/hostname.js`, pensado para subdominios) y también acepta
      `?cliente=`/`?demo=` para probarlo en un servidor estático. Primero prueba
      `public_business_pdf(slug)` y, si no hay o falla, cae al JSON local
      (`data/clientes/.../config.json` → `pdf.file`, que sigue sirviendo al único
      cliente estático que hay hoy). El caso `demo.*` ya no depende de un slug: es
      siempre el mismo PDF fijo, sin pedir nada a Supabase ni al JSON. Requisitos
      PDF-3 y 4 en `docs/SPEC.md`
- [x] [herni] Nueva función `web/api/static-menu.js` (mismo patrón que
      `api/manifest.js`): pide `public_menu(slug)` y arma un HTML de solo lectura
      (colores, cabecera, categorías, productos, link fijo de WhatsApp, sin
      carrito) con `apps/menu-app/lib/static-page.js`. Reusa las clases y el CSS
      del menú interactivo (`base.css` + `templates/carrito/<template>`), no el
      maquetado de las demos fijas que había en `apps/menu-html` (ya borrado, ver
      abajo): no estaba pensado para recibir datos reales. Nuevo rewrite en
      `vercel.json` para `/:cliente/menu.html`
- [x] [herni] Requisitos ESTATICO-1 a 3 en `docs/SPEC.md`, con tests en
      `static-page.test.js`
- [x] [herni] Una sola familia de plantillas para demos y negocios reales:
      `/moderno`, `/clasico` y `/minimal` (también bajo `demo.smaalacarta.com.ar`)
      pasan a abrir la demo por el menú interactivo real
      (`resolveDemoFromPath`, RUTAS-3), y `apps/menu-html` (las páginas fijas de
      antes, sin datos reales) se borró. Los datos de las demos (`data/demos/*`) se
      completaron: dirección, redes, imágenes livianas. Sin la copia aparte, cada
      mejora de `templates/carrito/*` se ve igual en la demo, en el menú interactivo
      y en el estático
- [x] [herni] Probar a mano los tres servicios juntos: al probarlos en producción
      salió un bug de verdad — `smaalacarta.com.ar` y `www.` son el proyecto de
      `landing/`, no llegan a `web/` (confirmado con la landing: redirige a `www.`, y
      ahí no hay rutas de `web/`). El PDF y el estático estaban armados para leer el
      negocio del path en el dominio raíz (`/:cliente/pdf`), una ruta que **nunca
      funcionó en producción**, ni antes de esta etapa. Arreglado: ahora el negocio
      sale del subdominio (`<slug>.smaalacarta.com.ar/pdf` y `/menu.html`), igual que
      ya funcionaba el interactivo y el seguimiento de pedidos; `vercel.json` con
      rutas "bare" (`/pdf`, `/menu.html`, sin `:cliente`)
- [ ] [herni] Probar de nuevo en producción con `kukarachos` (o el negocio de prueba
      que uses) que `<slug>.smaalacarta.com.ar/pdf` y `/menu.html` respondan bien
- [x] [herni] El menú estático sirve las demos (ESTATICO-6): `getDemoMenu()`
      (`apps/menu-app/lib/demo-menu.js`) trae los JSON de `data/demos/<slug>/` con
      un `require` literal por demo (no un path armado en tiempo de ejecución, que
      el empaquetado de Vercel para funciones serverless podría no incluir). El
      modal de demos de la landing, en "Menú Web", ahora enlaza a
      `<demo>.smaalacarta.com.ar/menu.html` (antes iba a `demo.smaalacarta.com.ar/<demo>`,
      la demo interactiva)
- [ ] [por asignar] El admin no tiene ningún lugar que muestre el link (ni un QR)
      del PDF o del menú estático para compartir — solo el interactivo lo tiene, en
      Configuración → Compartir
- [ ] [por asignar] Generar el PDF automáticamente desde el menú del admin (idea a futuro)
- [x] [herni] Diferenciar en el admin qué plan tiene cada negocio: resuelto en la
      Etapa 6g (`plan_pdf`/`plan_web`/`plan_completo` + alta/baja por pago)

## Etapa 6f — Una sola familia de plantillas (demos y clientes)

**Diseño.** Las tres plantillas (`moderno`, `clasico`, `minimal`) son las mismas para
demos y negocios reales, en el menú interactivo y en el estático
(`base.css` + `templates/carrito/<plantilla>/styles.css`). Requisitos en `docs/SPEC.md`
(RUTAS-3, PUBLICO-15).

- [x] [herni] `/moderno`, `/clasico` y `/minimal` abren la demo por el menú interactivo real
      (`resolveDemoFromPath`); se borró `apps/menu-html` y sus rewrites. De paso, arregla
      que `demo.smaalacarta.com.ar/<demo>` caía siempre en moderno
- [x] [herni] Datos de las tres demos parejos y completos (`data/demos/*`)
- [x] [herni] El estático arma las mismas secciones que el interactivo (`lib/menu.js`) y un
      test (`templates.test.js`) comprueba que toda clase que emite tiene estilo
- [x] [herni] Pulido de las tres plantillas y texto legible sobre colores claros de marca
      (`lib/colors.js`, PUBLICO-15)
- [ ] [herni] **Mirar `/moderno`, `/clasico` y `/minimal` en el celular** (el agente solo las
      vio en capturas headless) y probar colores claros en clásico y minimal con un negocio real
- [ ] [por asignar] Precios con formato es-AR (`$12.000`; hoy `$12000`): toca el carrito
- [ ] [por asignar] Mostrar la descripción de cada categoría en el menú (llega en `public_menu`, no se pinta)

## Etapa 6g — Plan de cada negocio y alta/baja por pago

**Diseño.** El plan no es un valor único: son tres capacidades combinables
(`businesses.plan_pdf`, `plan_web`, `plan_completo` — uno por servicio de
`web/`, Etapa 6e). `businesses.active` es el interruptor de alta/baja según
pago: en `false`, el negocio deja de mostrarse en los tres servicios públicos
(`public_menu`, `public_business_pdf`, `create_public_order`), sin borrar nada.
Solo el superadmin cambia estas columnas (trigger `businesses_guard_admin_columns`,
migración `20260930000500_planes_y_estado.sql`); un dueño no puede tocarlas ni
con un `UPDATE` directo. Los negocios que ya existían quedaron con
`plan_completo = true` para no cortarles nada (es lo que ya tenían de hecho).
Requisitos en `docs/SPEC.md` (ADMIN-SUPER-13 a 16).

- [x] [herni] Elegir el plan (combinable) al dar de alta un negocio, desde `/superadmin/negocios/nuevo`
- [x] [herni] Cambiar el plan y activar/suspender un negocio desde `/superadmin/negocios/[id]`
- [x] [herni] `active = false` saca al negocio de los tres servicios públicos
- [x] [herni] En el panel del propio negocio (no el superadmin): "Compartir" y el
      botón "Ver mi menú" ahora muestran solo las direcciones que responden según
      el plan, y qué plan tiene (badges, de solo lectura). Antes siempre mostraban
      el link del subdominio, aunque el negocio no tuviera `plan_completo` y por
      lo tanto no respondiera ahí — se notó con kukarachos. `src/lib/menu-url.ts`
      (`menuLinks()`/`primaryMenuLink()`, ADMIN-CONFIG-10)
- [x] [herni] Enrutamiento de `web/` según el plan: un negocio sin `plan_completo`
      se sirve por el path del dominio raíz (`smaalacarta.com.ar/<slug>/pdf` y
      `/menu.html`), vía un rewrite externo en `landing/vercel.json` hacia el
      deploy de `web/`; con `plan_completo`, sigue por subdominio, como siempre.
      `public_menu` y `public_business_pdf` ganan `p_via_path` (migración
      `20260930000600_ruteo_por_plan.sql`) y exigen el plan del servicio y que el
      negocio no tenga `plan_completo` cuando se llega por path. Requisitos en
      `docs/SPEC.md` (RUTAS-4, PDF-5, ESTATICO-5)
- [x] [herni] El subdominio también quedó atado al plan (migración
      `20260930000700_subdominio_exige_plan_completo.sql`): sin `plan_completo`, un
      negocio no responde por subdominio en nada (interactivo, estático, PDF ni
      `create_public_order`), solo por path. Antes de esta migración, cualquier
      negocio publicado y activo seguía respondiendo por subdominio sin mirar el
      plan — se notó porque `kukarachos.smaalacarta.com.ar` (solo con `plan_pdf` y
      `plan_web`) seguía sirviendo el menú interactivo. **Importante**: cualquier
      negocio real que ya estuviera usando su subdominio y no tenga `plan_completo`
      va a dejar de responder ahí apenas se aplique esta migración — hay que
      revisar en `/superadmin` qué negocios necesitan `plan_completo` antes o
      justo después de aplicarla
- [x] [herni] Probado en preview (`landing` y `web` de `dev-herni`, apuntando
      momentáneamente uno al otro) con kukarachos sin `plan_completo`: el path
      (`/<slug>/pdf` y `/menu.html`) funciona. Ojo: los previews de Vercel piden
      login ("Vercel Authentication"), así que no se pueden probar con `curl`, solo
      en el navegador ya logueado — en producción no debería pasar, pero conviene
      confirmarlo una vez que esto llegue a `main`
- [x] [herni] Confirmado en producción real (`smaalacarta.com.ar/kukarachos/menu.html`
      y `/pdf`, ambos 200 con el contenido correcto). Encontró y resolvió de paso un
      problema real: el deploy de `web/` tenía la protección de Vercel
      ("Vercel Authentication") activa también en producción, así que cualquier
      visitante sin sesión de Vercel se quedaba en una pantalla de login — quedó
      desactivada para producción
- [ ] [por asignar] Historial de pagos o fecha de vencimiento (quedó afuera de esta
      vuelta: por ahora es un interruptor manual, sin fechas)

## Etapa 6h — Tema claro/oscuro por plantilla

**Diseño.** Una variante más de cada plantilla (`moderno`, `clasico`, `minimal`),
elegida a mano en Configuración (`business_settings.theme`, ADMIN-CONFIG-9): no
sigue el modo del sistema del visitante. `public_menu` la entrega en
`config.tema`; el interactivo (`app.js`) y el estático (`static-page.js`) la
ponen en `data-tema` del `<html>`, y cada plantilla redefine sus variables de
fondo/tarjeta/texto/borde bajo `[data-tema="oscuro"]`. Los colores de marca del
negocio y los fijos (promo, WhatsApp) no cambian con el tema. Requisitos en
`docs/SPEC.md` (ADMIN-CONFIG-9, PUBLICO-16).

- [x] [herni] Migración `20260930000800_tema_claro_oscuro.sql`, selector en
      Configuración → Apariencia, y el resto de la cadena (`public_menu`, `app.js`,
      `static-page.js`)
- [x] [herni] Variables de tema en las tres plantillas (`--bg`, `--card`/`--veil`
      según la plantilla, `--text`, `--muted`, `--border`, y en clásico además
      `--tint-ok-*`/`--tint-bad-*` para Destacados/Ofertas y el estado abierto/cerrado)
- [x] [herni] Los campos del formulario de checkout (input/select/textarea) no
      heredan fondo ni color de texto solos: en clásico y minimal quedaban en
      negro fijo sobre negro al confirmar el carrito en tema oscuro (moderno ya
      los tenía explícitos). Se notó probándolo en el navegador
- [ ] [herni] **Seguir mirando las tres plantillas en oscuro, en el navegador**:
      recién arrancó la revisión a ojo (salió el bug de arriba); puede haber más.
      Para probar rápido: Configuración → Apariencia → Oscuro → Guardar, en un
      negocio real, o el switch de tema de las demos (siguiente ítem)
- [x] [herni] Switch de tema en las demos del interactivo (`#btn-tema`, junto al
      estado abierto/cerrado): alterna `data-tema` al toque, sin recargar, para
      mirar cómo se ve cada plantilla en los dos temas. No está en el estático ni
      en negocios reales
- [x] [herni] Arreglos tras mirarlo en el navegador (minimal): el "+" y los
      botones del carrito usaban el color de marca crudo como texto
      (`color: var(--primary)`), que podía quedar ilegible según el color elegido
      y el tema — pasan a `var(--text)`; el botón flotante del carrito suma un
      borde translúcido para no perderse contra un fondo de página del mismo
      tono. El switch de tema en sí ya no depende de `--card` (minimal no lo
      tiene: por eso el fondo se quedaba blanco con el texto en claro,
      ilegible) — ahora es un chip gris neutro con `color: inherit`, y se movió
      de flotante a la barra de arriba. Transición suave sumada al cambiar de tema
- [x] [herni] Minimal ganó un `--card` propio (antes no distinguía superficie de
      fondo a propósito, "es su estilo"): probado, resultaba demasiado plano —
      "todo blanco", sin poder diferenciar el encabezado, la barra de categorías,
      el carrito y el checkout de la página. Los productos siguen sin tarjeta
      propia (solo una línea debajo, es la lista de siempre): el ajuste es en los
      paneles, no en cada producto
- [ ] [por asignar] El mismo switch en el menú estático de las demos (hoy no
      tiene nada de JS; requeriría un script chico solo para ese caso)

## Etapa 6i — Plan visible en el resumen, negocio suspendido, menú sin trabarse

- [x] [herni] El interactivo (`app.js`) mostraba el loader para siempre cuando no
      había nada que mostrar (negocio inexistente, sin `plan_completo`,
      suspendido): ahora se ve un aviso de "no encontramos este menú". Se notó
      con kukarachos, que no tiene `plan_completo` y por eso no responde por
      subdominio
- [x] [herni] El resumen del panel también muestra el plan del negocio
      (`PlanBadges`, ADMIN-RESUMEN-4), no solo Configuración → Compartir
- [x] [herni] Negocio suspendido (`active = false`): además de desaparecer de lo
      público (Etapa 6g), ahora tampoco se puede editar desde el panel —
      categorías, productos, promociones, configuración y pedidos, con un
      trigger por tabla (migración `20260930000900_bloqueo_por_suspension.sql`,
      ADMIN-SUSPENSION-1) que cubre tanto RLS como las funciones
      `SECURITY DEFINER`. El borrado no se bloquea. Un aviso fijo en todo el
      panel explica por qué mientras dure

## Etapa 6j — El panel según el plan

**Diseño.** No solo lo público cambia según el plan (Etapa 6g): el panel
también. Sin `plan_web` ni `plan_completo` no hay menú digital (Menú y
Promociones no tienen sentido, y Configuración se reduce a "Menú en PDF");
sin `plan_completo` no hay carrito (Pedidos no tiene sentido, tampoco el aviso
de pedidos nuevos ni "Pedidos hoy" en el resumen). El header muestra un botón
por cada servicio que el negocio realmente tenga, no uno solo. Lógica en
`src/lib/plan-access.ts` (`hasDigitalMenu()`, `hasOrders()`); requisitos en
`docs/SPEC.md` (ADMIN-PLAN-1 a 3).

- [x] [herni] Menú lateral, header (botones "Ver carrito"/"Ver menú"/"Ver QR"),
      resumen y Configuración reducida, todos según el plan. Menú, Pedidos y
      Promociones también redirigen a `/dashboard` si se entra por la URL
      directa sin el plan que corresponde
- [ ] [por asignar] Lo mismo pero exigido en la base (como la suspensión,
      Etapa 6i): hoy `save_promotion()`, `create_manual_order()` y las tablas de
      categorías/productos no miran el plan, solo el panel esconde los botones.
      Alguien con la sesión y las herramientas para pegarle directo a la acción
      podría saltarse el filtro

## Etapa 7 — Pendientes técnicos (backlog)

- [ ] [por asignar] **Marketplace** ("un lugar donde encontrar de todo para
      comer", negocios clientes y no clientes): en análisis, ver
      `docs/MARKETPLACE.md`. Todavía no es una tarea tomada — no empezar sin que
      Herni lo decida primero
- [ ] [por asignar] Permisos por `role` en `businesses`: hoy cualquier miembro puede editar el negocio, incluido el `slug`
- [ ] [por asignar] Políticas RLS para `anon` (lectura del menú público), junto con la Etapa 6
- [ ] [por asignar] `getCurrentBusiness()` con varios negocios por usuario: hoy `.maybeSingle()` falla y redirige a `/login`
- [x] [herni] Entrar al panel por `smaalacarta.com.ar/admin`: `next.config.ts`
      tiene `basePath: "/admin"`, y `landing/vercel.json` suma un rewrite externo
      (`/admin` y `/admin/:path*`) hacia `smaalacarta-admin.vercel.app`, mismo
      patrón que ya usa `web/`. De paso salió un bug real: `proxy.ts` armaba la
      redirección de login a mano (`new URL(destino, request.url)`), que no suma
      el `basePath` solo — sin el fix, cualquier redirect (a `/login`, después de
      cambiar la contraseña, etc.) mandaba a una ruta sin `/admin` que no existe.
      También `next/image` necesitó el `basePath` a mano en el `src` de la imagen
      del login (`app/(auth)/layout.tsx`): a diferencia de `next/link`, no lo suma
      solo. **Importante:** desde que esto se despliegue, la URL directa de Vercel
      del panel (`https://smaalacarta-admin.vercel.app/`) da 404 en la raíz — todo
      vive bajo `/admin` ahora
- [ ] [herni] Probar el login de verdad en un preview antes de mergear a `main`
      (curl solo confirmó que las redirecciones arman bien la URL, no un login
      real con cookies de sesión en un navegador)
- [x] Flujo de alta de negocios y membresías desde el admin: resuelto en la Etapa 4 (superadmin)
