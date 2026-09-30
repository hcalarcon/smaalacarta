# Especificación

Qué tiene que hacer SMA a la Carta. Cada requisito es una afirmación única y
testeable con un id estable, y cada uno está cubierto por un test.

**Este archivo es la fuente de verdad del comportamiento.** Si el código y este
archivo no coinciden, uno de los dos es un bug — decidir cuál antes de escribir
cualquier otra cosa.

## Cómo usarlo

- **¿Agregás algo?** Escribí el requisito acá primero, con el siguiente id libre
  de su sección; después el test; después el código. Ver
  [WORKFLOW.md](WORKFLOW.md).
- **¿Cambiás comportamiento?** Editá el requisito en el mismo commit que el
  código y el test. Un requisito que ya no coincide con el código es peor que no
  tener requisito.
- **¿Lo mencionás?** Usá el id (`CARRITO-3`) en commits, pull requests y nombres
  de test. Los ids son permanentes: un requisito que deja de valer se marca
  *retirado*, nunca se renumera.

Cada sección indica el módulo que aplica la regla y los tests que la sostienen.

## Estado

Las secciones están creadas y vacías. Se completan especificando el
comportamiento que ya existe, una app por rama:

| Rama | Secciones |
| --- | --- |
| `test/web-menu-app` | RUTAS, HORARIO, MENU, BUSQUEDA, CARRITO, PEDIDO, PDF |
| `test/landing` | LANDING |
| `test/admin` | ADMIN-AUTH, ADMIN-MENU, ADMIN-PEDIDOS, ADMIN-PROMOS |

---

# Menús web — `smaalacarta/web`

## RUTAS — Qué negocio y qué vista abre cada URL

*Aplicado por `web/vercel.json`, `landing/vercel.json`,
`web/apps/menu-app/app.js` y `web/apps/menu-app/lib/hostname.js`. Cubierto por:
`lib/hostname.test.js` (RUTAS-1 a 4).*

- **RUTAS-1** Un negocio se abre desde `<slug>.smaalacarta.com.ar` (o
  `.smaalacarta.online`) sin declararlo en el código: el subdominio es su slug. El
  parámetro `?cliente=<slug>` sigue sirviendo para desarrollo.
- **RUTAS-2** Los subdominios reservados (`www`, `admin`, `app`, `api`, `demo`…) no
  son negocios; los de las demos (`moderno`, `clasico`, `minimal`) abren su demo.
- **RUTAS-3** Las direcciones `/moderno`, `/clasico` y `/minimal` (también bajo
  `demo.smaalacarta.com.ar`, donde el subdominio reservado no dice cuál) abren esa
  demo con el mismo menú y las mismas plantillas que un negocio real: no hay páginas
  aparte para las demos. Solo cuenta el primer segmento del path y solo las demos
  conocidas; una demo pedida por `?demo=` o por subdominio tiene prioridad.
- **RUTAS-4** Un negocio sin `plan_completo` también se sirve por el path del
  dominio raíz: `smaalacarta.com.ar/<slug>/pdf` y `/menu.html`, vía un rewrite
  externo desde `landing/vercel.json` hacia este proyecto (el negocio nunca deja
  el dominio de la landing: el rewrite es transparente para el navegador). Ese
  camino exige el plan del servicio (`plan_pdf`/`plan_web`) y que el negocio NO
  tenga `plan_completo` — si lo tiene, se sirve por subdominio, no por path. El
  slug llega distinto según el caso: por query (`?ruta=<slug>`) en el estático,
  que corre del lado del servidor; por el propio `pathname` del navegador
  (`/<slug>/pdf`) en el PDF, que corre del lado del cliente y nunca ve la query
  del rewrite. El subdominio, a su vez, exige `plan_completo`: sin él, un negocio
  no responde por subdominio en ningún servicio (interactivo, estático ni PDF),
  solo por path.

## HORARIO — Abierto o cerrado

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## MENU — Armado del menú

*Destacados, ofertas y categorías. Aplicado por `web/apps/menu-app/lib/menu.js`
(lo usan el menú interactivo y el estático). Cubierto por: `lib/menu.test.js`
(MENU-1 a 3) y `lib/price.test.js` (MENU-4). El resto del armado del menú sigue sin especificar.*

- **MENU-1** Los productos marcados como destacados se reúnen en una sección
  "Destacados" que va antes de todas las categorías.
- **MENU-2** Los productos con precio anterior o con promo se reúnen en una sección
  "Ofertas", después de Destacados; si el menú ya trae su categoría de ofertas (las
  promociones del admin), no se arma otra.
- **MENU-3** Las categorías del negocio siguen a continuación, sin cambios ni
  reordenamientos; un menú sin destacados ni ofertas queda como llegó.
- **MENU-4** Los precios se muestran con formato es-AR: punto como separador de miles y
  sin decimales si son enteros (`$12.000`, no `$12000`). Vale igual en el menú
  interactivo, el estático y el mensaje de WhatsApp (`lib/price.js`).

## PUBLICO — El menú desde Supabase

*Aplicado por `supabase/migrations/*_configuracion_y_menu_publico.sql` (función
`public_menu`) y `web/apps/menu-app/lib/` (`public-menu.js`, `info.js` y `html.js`). Cubierto por:
`src/lib/db/public-menu.test.ts` (admin, contra Postgres real: PUBLICO-1 a 5 y 8) y
`web/apps/menu-app/lib/*.test.js` (PUBLICO-6, 7 y 9).*

El menú público pide a Supabase el negocio por su slug, sin sesión, y recibe el
mismo formato que hoy leen los JSON (`config` y `menu`).

- **PUBLICO-1** Un negocio que no existe o no está publicado no devuelve nada.
- **PUBLICO-2** Solo se entregan las categorías y los productos activos del negocio,
  en el orden que definió, sin categorías vacías y sin nada de otros negocios.
- **PUBLICO-3** Las promociones activas, con todos sus productos activos, van en una
  categoría "Ofertas" al principio, con su precio final y el precio anterior
  (ADMIN-PROMOS-4); el precio anterior se omite si no hay ahorro.
- **PUBLICO-4** La configuración llega con el formato del menú actual (nombre,
  descripción, plantilla, teléfono, colores, cabecera y horarios); lo que el negocio
  no cargó no aparece. Sin horarios, el menú se muestra siempre abierto.
- **PUBLICO-5** Quien no tiene sesión puede pedir el menú de un negocio publicado,
  pero no puede leer ninguna tabla del negocio.
- **PUBLICO-6** El menú web pide el negocio a Supabase; si Supabase no está
  configurado, no lo tiene o falla, usa los JSON locales como hasta ahora. Si
  ninguno de los dos tiene nada (negocio inexistente, sin plan_completo, o
  suspendido), se ve un aviso de "no encontramos este menú" en vez de quedarse
  trabado en el loader para siempre.
- **PUBLICO-7** Lo que llega de Supabase se completa con valores por defecto para
  que el menú nunca reciba categorías o ítems sin lista.
- **PUBLICO-8** La dirección y las redes llegan como `direccion` y `redes`; un cierre
  temporal vigente llega como `cierre`, con su mensaje y la fecha de reapertura. Un
  cierre cuya fecha de reapertura ya llegó no se entrega.
- **PUBLICO-9** El menú muestra la dirección y las redes al pie de la página ("Encontranos
  en" y "Seguinos en", con el ícono de cada red), y si el negocio está cerrado
  temporalmente lo dice arriba, con su mensaje, y no deja enviar pedidos.
- **PUBLICO-10** El encabezado del menú muestra los colores del negocio aunque no tenga
  imagen (degradé de `primary` a `secondary`); con imagen, la imagen va sobre el degradé.
  La plantilla `minimal` mantiene su encabezado blanco sin imagen, y sin colores
  configurados no se pinta nada.
- **PUBLICO-11** Lo que es solo de las demos (el aviso "¿Querés este menú en tu negocio?" y
  el botón "Volver" a la landing) no se muestra en un negocio real.
- **PUBLICO-12** Abierto o cerrado se calcula con la hora de Argentina (no la del celular
  del cliente). Un rango "HH:MM-HH:MM" incluye la hora de inicio y no la de cierre, y
  uno nocturno ("20:00-02:00") sigue en la madrugada del día siguiente. Un día sin
  rangos está cerrado; sin ningún horario cargado el negocio está siempre abierto.
- **PUBLICO-13** El menú público entrega el logo del negocio en `logo`, solo si lo cargó.
- **PUBLICO-14** En pantallas anchas (desde 1024 px) el menú se centra en una columna de hasta
  1120 px y los productos van en una grilla de tarjetas de ancho parejo, en las tres
  plantillas; en el celular no cambia nada. Solo se prueba mirándolo en el navegador.
- **PUBLICO-15** Cada negocio elige sus colores, y algunos son claros. El menú (interactivo y
  estático) calcula con qué texto se lee sobre ellos —blanco u oscuro, el que dé más
  contraste— y un tono de la marca oscurecido para escribir sobre blanco (mínimo 4.5:1). Las
  plantillas usan `--on-brand`, `--on-brand-mix` y `--on-header` en vez de blanco fijo. Un
  valor que no sea un color hexadecimal válido no llega al estilo.
- **PUBLICO-16** El menú entrega el tema en `config.tema` (`"claro"` o `"oscuro"`,
  ADMIN-CONFIG-9); el interactivo lo pone en `data-tema` del `<html>` (`app.js`) y
  el estático lo arma en el HTML (`static-page.js`). Las tres plantillas leen
  `[data-tema="oscuro"]` para redefinir sus variables de fondo, tarjeta, texto y
  borde; los colores de marca del negocio y los fijos (promo, WhatsApp) no
  cambian con el tema: ya se calculan para leerse sobre sí mismos. Sin tema
  cargado (las demos, hoy), se ve como siempre: claro. En el interactivo, las
  demos tienen además un switch (`#btn-tema`, junto al estado abierto/cerrado)
  para alternar entre los dos temas sin recargar; no existe en negocios reales
  ni en el estático. El cambio de tema anima suave (transición en fondo, texto
  y borde), salvo con `prefers-reduced-motion`.
- **PUBLICO-17** Las demos están siempre abiertas: quien las prueba puede hacer el pedido
  de prueba a cualquier hora. Sus `config.json` no traen `horarios` (PUBLICO-4 y 12).

## BUSQUEDA — Buscador

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## CARRITO — Carrito de compra

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## PEDIDO — Envío del pedido por WhatsApp

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## SEGUIMIENTO — Pedido guardado y página de seguimiento

*Aplicado por `supabase/migrations/*_pedidos.sql` (funciones `create_public_order` y
`public_order_tracking`), `web/apps/menu-app/lib/orders.js` y `web/apps/tracker`.
Cubierto por: `src/lib/db/orders.test.ts` (admin, contra Postgres real:
SEGUIMIENTO-1 a 6) y `web/apps/**/lib/*.test.js` (SEGUIMIENTO-7 y 8).*

Cuando el menú viene de Supabase, confirmar el pedido lo guarda en el sistema antes
de abrir WhatsApp, y el cliente recibe un link para seguirlo. El pedido sigue
llegando al negocio por WhatsApp.

- **SEGUIMIENTO-1** Un cliente, sin sesión, puede crear un pedido en un negocio
  publicado y abierto. No puede en uno que no existe, no está publicado o cerró
  temporalmente.
- **SEGUIMIENTO-2** Los precios y el total los calcula el sistema a partir del menú:
  el navegador solo dice qué productos y cuántos. Un precio enviado por el navegador
  no existe para el sistema.
- **SEGUIMIENTO-3** Solo se puede pedir lo que el menú público muestra: productos y
  promociones activos de ese negocio. Si un ítem no es válido, el pedido no se crea.
- **SEGUIMIENTO-4** Un pedido lleva de 1 a 40 ítems distintos, de 1 a 20 unidades
  cada uno, con textos de largo acotado; un negocio no recibe más de 20 pedidos por
  minuto desde el menú.
- **SEGUIMIENTO-5** Al crear el pedido, el cliente recibe su número y un código único
  e imposible de adivinar. Con ese código se ve el estado, la línea de tiempo y el
  detalle del pedido, sin el nombre del cliente, las notas ni ningún dato personal.
- **SEGUIMIENTO-6** Sin sesión no se lee ni se cambia ninguna tabla de pedidos: solo
  se crea un pedido y se consulta uno por su código.
- **SEGUIMIENTO-7** Si el menú no viene de Supabase, o el pedido no se puede guardar,
  se envía por WhatsApp como hasta ahora.
- **SEGUIMIENTO-8** La página de seguimiento muestra el estado y se actualiza sola
  hasta que el pedido termina; los textos que muestra nunca se interpretan como HTML.
- **SEGUIMIENTO-9** Fuera del horario del negocio no se reciben pedidos: el servidor los
  rechaza (`P0006`) y el menú avisa "Cerrado ahora", con el próximo horario de
  apertura, y no deja enviarlos.
- **SEGUIMIENTO-10** Al confirmar un pedido guardado, el menú muestra el panel "Pedido registrado"
  y abre WhatsApp solo, en la misma pestaña, con el mensaje ya armado ("Nuevo pedido #N" y el
  link de seguimiento; siempre en español y con el nombre original de los productos). El
  panel tiene un botón principal "Ver el estado de mi pedido" y, chico, "¿No se abrió
  WhatsApp? Enviar de nuevo". Si el navegador recarga la página al volver, el panel se
  vuelve a mostrar (hasta 2 horas o hasta que el cliente lo cierre). El mensaje queda
  guardado en el navegador y la página de seguimiento ofrece enviarlo si el pedido
  no figura como enviado. Si el pedido no se pudo guardar, se abre WhatsApp directo, sin panel.
- **SEGUIMIENTO-11** La página de seguimiento tiene la estética del negocio: sus colores,
  su imagen de cabecera y su plantilla (`minimal` queda blanca). El seguimiento sigue sin
  datos personales, y los colores y la imagen se validan antes de usarlos.
- **SEGUIMIENTO-12** Al cambiar el estado de un pedido, el negocio puede dejar un
  mensaje opcional (por ejemplo, el motivo de una cancelación); el cliente lo ve
  junto al evento correspondiente en su seguimiento.

## PWA — Instalar el menú en el celular

*Aplicado por `web/api/manifest.js`, `web/sw.js` y `web/apps/menu-app/lib/{manifest,pwa}.js`.
Cubierto por: `lib/manifest.test.js` y `lib/pwa.test.js`. La función y el service worker
solo se prueban en una preview de Vercel.*

- **PWA-1** Cada negocio se instala con lo suyo: su nombre, su color y, como ícono, su logo
  (ADMIN-CONFIG-8). Sin logo se usa el ícono general de SMA a la Carta, así que no hace
  falta cargar uno por cada comercio.
- **PWA-2** Las demos y cualquier sitio que no sea un negocio publicado reciben el manifest
  general de SMA a la Carta.
- **PWA-3** El service worker no guarda nada en caché: precios, horarios y pedidos siempre
  vienen de la red.

## PDF — Menú en PDF

*Aplicado por `supabase/migrations/20260930000400_menu_pdf.sql`, la sección "Menú
en PDF" de Configuración (`app/dashboard/settings`) y `web/apps/pdf`. Cubierto por
`src/lib/db/settings.test.ts` (PDF-1), `src/lib/db/storage-pdfs.test.ts` (PDF-2) y
`src/lib/settings/validation.test.ts` contra Postgres real y en JS puro; y
`web/apps/pdf/lib/pdf.test.js` (PDF-3 y PDF-4).*

- **PDF-1** Un negocio puede tener un PDF de menú (`menu_pdf_url`), independiente
  de si publicó o no el menú digital: `public_business_pdf(slug)` lo devuelve
  exista o no `published`, y no devuelve nada si no cargó ninguno. Se sube desde
  Configuración, sin depender del interruptor "Menú público".
- **PDF-2** El PDF se sube a un bucket aparte (`business-pdfs`), con el mismo
  aislamiento por negocio que las imágenes: cada negocio escribe solo en su
  propia carpeta, y solo se aceptan PDF de hasta 10 MB.
- **PDF-3** `<slug>.smaalacarta.com.ar/pdf` muestra el PDF de Supabase si el negocio
  cargó uno; si no, cae al PDF del JSON local (`data/clientes/<slug>/config.json` →
  `pdf.file`), que sigue sirviendo al único cliente estático que hay hoy. El negocio
  sale del subdominio, igual que el menú interactivo: el dominio raíz
  (`smaalacarta.com.ar`, `www.`) es el sitio de la landing y no llega a esta ruta. Un
  `?cliente=<slug>` en la dirección permite probar cualquiera de los dos casos en un
  servidor estático, igual que en el menú interactivo.
- **PDF-4** Un subdominio `demo.*` (o `?demo=<slug>`) siempre muestra el mismo PDF
  de ejemplo, sin pedir nada a Supabase ni al JSON: es solo para mostrar cómo se ve
  el plan "QR + PDF", no depende de ningún negocio real.
- **PDF-5** `smaalacarta.com.ar/<slug>/pdf` (RUTAS-4) exige `plan_pdf` y que el
  negocio no tenga `plan_completo`; `<slug>.smaalacarta.com.ar/pdf` (subdominio)
  exige `plan_completo`, tenga o no `plan_pdf`.

## ESTATICO — Menú web de solo lectura

*Aplicado por `web/api/static-menu.js`, `web/apps/menu-app/lib/static-page.js` y
`lib/demo-menu.js`. Cubierto por `lib/static-page.test.js` y `lib/demo-menu.test.js`,
en JS puro.*

- **ESTATICO-1** `<slug>.smaalacarta.com.ar/menu.html` (el negocio sale del
  subdominio, no hay `:cliente` en el path: el dominio raíz es la landing y no
  llega acá) muestra el mismo menú que el interactivo (`public_menu`, mismos
  colores, plantilla, horarios y cierre temporal) pero de solo lectura: sin
  carrito, sin formulario de pedido, un link de WhatsApp fijo en vez de un
  checkout. Comparte la bandera `published` con el interactivo. Sin negocio, sin
  Supabase configurado o sin publicar, la ruta responde 404.
- **ESTATICO-2** El HTML se arma en el momento (`web/api/static-menu.js`, función
  serverless, sin build); el texto del negocio se escapa igual que en el menú
  interactivo (PUBLICO-9): un nombre o descripción con HTML no se ejecuta.
- **ESTATICO-3** Una categoría sin productos activos no aparece; una plantilla o
  un color inválido caen a los valores por defecto, igual que en el resto del
  menú público.
- **ESTATICO-4** El menú estático se ve como el interactivo con la misma plantilla:
  arma las mismas secciones (Destacados y Ofertas, MENU-1 a 3), pone la etiqueta de
  promo en el producto y usa el mismo encabezado (estado dentro de `.header-top`).
- **ESTATICO-5** `smaalacarta.com.ar/<slug>/menu.html` (RUTAS-4) exige `plan_web` y
  que el negocio no tenga `plan_completo`; `<slug>.smaalacarta.com.ar/menu.html`
  (subdominio) exige `plan_completo`, tenga o no `plan_web`. Mismo criterio para
  el menú interactivo (`<slug>.smaalacarta.com.ar`) y para crear un pedido: sin
  `plan_completo`, no responden.
- **ESTATICO-6** `moderno.smaalacarta.com.ar/menu.html` (también `clasico` y
  `minimal`) muestra la demo de solo lectura, sin pedir nada a Supabase: sale de
  los mismos JSON que usa el menú interactivo para las demos
  (`web/data/demos/<slug>/`), no del plan de un negocio.

## IDIOMA — Menú público en español, inglés y portugués

*Aplicado por `web/apps/menu-app/lib/i18n.js` (diccionario, `t()` y `resolveLang()`),
`app.js`, `lib/static-page.js`, `web/api/static-menu.js` y `web/apps/tracker/`. Cubierto
por `lib/i18n.test.js`, `lib/schedule.test.js`, `lib/static-page.test.js` y
`tracker/lib/tracker.test.js`, en JS puro. Las traducciones del contenido (IDIOMA-8 a 11)
se prueban además en `admin/src/lib/menu/translations.test.ts` y `admin/src/lib/db/`.*

- **IDIOMA-1** Se traducen solo los textos de la interfaz (botones, carrito, checkout,
  "Destacados", "Ofertas", abierto/cerrado, próximo horario, avisos y seguimiento), a
  español (`es`), inglés (`en`) y portugués (`pt`). El contenido del negocio (nombre,
  descripción, categorías, productos) no se traduce.
- **IDIOMA-2** El idioma sale, en este orden, de `?lang=es|en|pt`, del idioma del
  navegador (`navigator.language`, por ejemplo `pt-BR` → `pt`) y, si no es ninguno de los
  tres, es español.
- **IDIOMA-3** `t(clave, idioma)` devuelve el texto en ese idioma; si falta la clave en
  ese idioma cae al español, y si tampoco está, devuelve la clave. Los tres idiomas
  tienen las mismas claves.
- **IDIOMA-4** El menú interactivo tiene un selector ES/EN/PT en la barra de arriba,
  junto al switch de tema. Cambiar de idioma no recarga la página, no vacía el
  carrito ni el buscador, y actualiza `?lang=` en la dirección.
- **IDIOMA-5** El mensaje de WhatsApp que recibe el negocio queda siempre en español,
  sea cual sea el idioma del cliente: lo lee el dueño.
- **IDIOMA-6** El menú estático toma `?lang=` del lado del servidor (sin JS nuevo,
  sin mirar el idioma del navegador) y marca el idioma en `<html lang>`.
- **IDIOMA-7** La página de seguimiento usa el mismo criterio que IDIOMA-2; el menú
  interactivo le pasa `?lang=` al link "Seguir mi pedido".
- **IDIOMA-8** Categorías y productos tienen nombre y descripción opcionales en inglés
  y portugués (`name_en`, `name_pt`, `description_en`, `description_pt`). Vacíos, se
  guardan como nulos; no hay traducción automática.
- **IDIOMA-9** En los formularios de categoría y de producto, una sección plegable
  "Traducciones (opcional)" carga esos cuatro campos; se abre sola si ya hay alguno.
- **IDIOMA-10** `public_menu` entrega los textos traducidos (`nombre_en`, `nombre_pt`,
  `descripcion_en`, `descripcion_pt`) sin la cadena vacía, y `web/` elige según el idioma
  (`localized()` en `i18n.js`, aplicado en `buildEnhancedMenu`, así vale para el
  interactivo y el estático). Si falta la traducción, se usa el español.
- **IDIOMA-11** El mensaje de WhatsApp sigue en español (IDIOMA-5): usa el nombre original
  del producto (`nombreEs`).

---

---

# Landing — `smaalacarta/landing`

## LANDING — Sitio de venta

*Planes, enlaces de contacto, demos. Aplicado por `landing/index.html`,
`landing/landing.js`, `landing/landing.css`, `landing/robots.txt`,
`landing/sitemap.xml`, `landing/assets/site.webmanifest`, `landing/hola.html`,
`landing/hola.css` y `landing/vercel.json`. Cubierto por: `landing/landing.test.js` y
`landing/hola.test.js`.*

- **LANDING-1** Lo que se comparte da buena imagen: `og:image` y `twitter:image` apuntan a un
  archivo que existe en `assets/`, de 1200×630 y menos de 300 KB, y el logo del
  encabezado no usa el `favicon.svg` de 2,5 MB.
- **LANDING-2** Ningún enlace queda vacío (`href="#"`) y los de contacto usan los mismos
  datos (WhatsApp y email) en toda la página.
- **LANDING-3** Los planes hablan del mismo dominio que los menús:
  `<negocio>.smaalacarta.com.ar`.
- **LANDING-4** Lo que ofrecemos está al día: la página menciona el panel de administración,
  las promociones y el seguimiento del pedido.
- **LANDING-5** El menú del celular avisa su estado (`aria-expanded`, `aria-controls`), se
  cierra con Escape y, cerrado, no deja enlaces enfocables fuera de la pantalla.
- **LANDING-6** El modal de demos es un diálogo (`role="dialog"`, `aria-modal`, con
  título), lleva el foco adentro al abrirse, lo devuelve al botón al cerrarse, se cierra
  con Escape, con un botón "Cerrar" o tocando afuera, y no deja salir el foco con Tab.
- **LANDING-7** Todo el contenido se ve aunque falle el JavaScript o el navegador pida menos
  movimiento: la animación de entrada solo la activa el JS y nunca con
  `prefers-reduced-motion`.
- **LANDING-8** Las imágenes tienen texto alternativo en español, tamaño declarado y carga
  diferida (salvo la principal); hay un enlace para saltar al contenido y un foco visible.
- **LANDING-9** El sitio se deja indexar bien: `robots.txt`, `sitemap.xml`, datos
  estructurados (`LocalBusiness`) y un `site.webmanifest` con el nombre real.
- **LANDING-10** `smaalacarta.com.ar/hola` abre una página para quien llega por la tarjeta
  de visita: existe `hola.html`, `vercel.json` la sirve en `/hola` y no se indexa
  (`noindex`, fuera del `sitemap.xml`).
- **LANDING-11** Tiene un solo objetivo, escribir por WhatsApp: sin menú de navegación ni
  enlaces a secciones. Los únicos enlaces son WhatsApp, llamada, el menú de ejemplo y uno
  discreto a la landing. Los de contacto usan el mismo número que `index.html` y los de
  WhatsApp llevan un mensaje escrito que menciona la tarjeta.
- **LANDING-12** En el celular hay un botón fijo de WhatsApp abajo que no tapa el
  contenido; desde 768 px no se muestra.
- **LANDING-13** El funcionamiento se muestra con una animación solo de CSS, decorativa
  (`aria-hidden`): el mismo contenido está escrito en una lista de 4 pasos, y con
  `prefers-reduced-motion` no se anima nada.
- **LANDING-14** Es liviana: `hola.html` + `hola.css` suman menos de 30 KB, no lleva
  JavaScript propio y sus imágenes existen, declaran tamaño y tienen `alt`.
- **LANDING-15** Se lee bien en el celular: el botón principal tiene contraste de al menos
  4,5:1, los botones miden al menos 48 px de alto y el foco del teclado se ve.
- **LANDING-16** Los precios de la página son los mismos que los de `index.html`.

---

# Admin — `smaalacarta/admin`

## ADMIN-AUTH — Acceso y negocio actual

*Aplicado por `src/lib/get-current-business.ts`, `src/lib/auth/`, `proxy.ts`,
`app/(auth)` y las políticas de RLS en `supabase/migrations/`. Cubierto por:
`src/lib/auth/*.test.ts` (ADMIN-AUTH-4 a 8) y `src/lib/db/policies.test.ts`
(ADMIN-AUTH-1 a 3, contra Postgres real). El envío de mails y el flujo completo de
recuperación se prueban a mano.*

- **ADMIN-AUTH-1** Al registrarse un usuario se le crea un perfil con su email.
  Nadie ve ni edita el perfil de otro.
- **ADMIN-AUTH-2** Un usuario solo puede ver, crear, editar y borrar categorías,
  productos, promociones y pedidos de los negocios de los que es miembro, y no
  puede mover una fila a un negocio del que no es miembro. Un producto solo
  puede pertenecer a una categoría de su mismo negocio.
- **ADMIN-AUTH-3** Un usuario solo ve los negocios de los que es miembro y sus
  propias membresías. Crear negocios y asignar miembros solo lo hace un
  superadmin (ADMIN-SUPER).
- **ADMIN-AUTH-4** Iniciar sesión pide un email con formato válido y una
  contraseña; si Supabase rechaza las credenciales el usuario ve un mensaje en
  español que no dice cuál de los dos datos falló.
- **ADMIN-AUTH-5** Una contraseña nueva (al restablecerla) tiene al menos 8
  caracteres y coincide con su confirmación.
- **ADMIN-AUTH-6** Después de iniciar sesión el usuario vuelve a la página del
  panel que había pedido; una dirección que no sea una ruta interna del panel se
  ignora y va a `/dashboard`.
- **ADMIN-AUTH-7** Sin sesión, las rutas del panel llevan a `/login`; con
  sesión, `/login` y `/recuperar` llevan a `/dashboard`. No hay registro
  público: las cuentas las crea el equipo de SMA a la Carta.
- **ADMIN-AUTH-8** Un usuario con sesión pero sin negocio no vuelve a `/login`:
  ve un aviso de que su cuenta no tiene negocio asignado y puede cerrar sesión.
- **ADMIN-AUTH-9** Pedir recuperar la contraseña muestra el mismo mensaje
  exista o no una cuenta con ese email.
- **ADMIN-AUTH-10** Cambiar la contraseña con sesión iniciada (desde
  Configuración o, con la temporal, en `/cambiar-contrasena`) pide la
  contraseña actual y la valida contra Supabase antes de guardar la nueva; si
  no coincide, no se toca nada. La nueva tiene que ser distinta de la actual.

## ADMIN-SUPER — Superadmin y alta de cuentas

*Aplicado por `supabase/migrations/*_superadmin.sql`, `src/lib/auth/superadmin.ts`,
`src/lib/superadmin/`, `app/superadmin` y `app/(auth)/cambiar-contrasena`. Cubierto por:
`src/lib/db/superadmin.test.ts` (ADMIN-SUPER-1 a 4, contra Postgres real) y por los
tests de `src/lib/superadmin/` y `src/lib/auth/` (el resto).*

No hay registro público: las cuentas y los negocios los crea el equipo de SMA a la
Carta desde `/superadmin`. No se envían mails: cada cuenta nueva nace con una
contraseña temporal que el superadmin le pasa a la persona, y que ella cambia en su
primer ingreso.

- **ADMIN-SUPER-1** Un superadmin es un usuario registrado en `super_admins`.
  Ningún usuario, ni siquiera un superadmin, puede agregar ni quitar filas de esa
  tabla desde la app: solo se modifica con SQL o con la clave de servicio.
- **ADMIN-SUPER-2** Un superadmin ve todos los negocios, todos sus miembros y todos
  los perfiles; un usuario común sigue viendo solo lo suyo.
- **ADMIN-SUPER-3** Solo un superadmin puede crear un negocio, y lo crea junto con
  su primer miembro, dueño, en un solo paso: si algo falla no queda un negocio sin
  dueño.
- **ADMIN-SUPER-4** Solo un superadmin puede asignar y quitar miembros de un
  negocio.
- **ADMIN-SUPER-5** El slug de un negocio es único y solo tiene minúsculas,
  números y guiones; se propone a partir del nombre, sin tildes.
- **ADMIN-SUPER-6** Dar de alta a un dueño con un email nuevo crea su cuenta con
  una contraseña temporal generada al azar, que se muestra una sola vez; si ese
  email ya tiene cuenta se reutiliza y no se genera ninguna contraseña.
- **ADMIN-SUPER-7** Sin sesión, `/superadmin` lleva a `/login`; un usuario que no
  es superadmin va a su panel y no ve nada de `/superadmin`.
- **ADMIN-SUPER-8** La clave de servicio de Supabase solo se usa después de
  comprobar que quien pide la acción es superadmin.
- **ADMIN-SUPER-9** Un superadmin sin negocio entra a `/superadmin`, no a
  `/sin-negocio`.
- **ADMIN-SUPER-10** Una cuenta con contraseña temporal solo puede llegar a la
  pantalla de cambio de contraseña, hasta que elija una propia; con la nueva, la
  marca de temporal se borra.
- **ADMIN-SUPER-11** Un superadmin puede restablecer la contraseña de un miembro
  de un negocio: se genera una temporal nueva, se muestra una sola vez y la
  persona vuelve a quedar obligada a cambiarla. No puede hacerlo con otro
  superadmin ni con quien no es miembro de ese negocio.
- **ADMIN-SUPER-12** Un negocio no puede llamarse con un slug reservado (`www`,
  `admin`, `app`, `api`, `demo`, `moderno`, `clasico`, `minimal`…): serían
  subdominios que no abren un negocio.
- **ADMIN-SUPER-13** El plan de un negocio no es un valor único: son tres
  capacidades combinables (`plan_pdf`, `plan_web`, `plan_completo`, una por cada
  servicio de `web/`). El superadmin elige el plan (al menos uno) al dar de alta
  el negocio, y puede cambiarlo después desde `/superadmin/negocios/[id]`.
- **ADMIN-SUPER-14** Solo un superadmin puede cambiar el plan o el estado
  (`active`) de un negocio; un dueño no puede tocar esas columnas ni con un
  `UPDATE` directo a `businesses`, aunque sí siga editando el resto de sus datos
  (nombre, slug, WhatsApp, logo).
- **ADMIN-SUPER-15** `active = false` es el interruptor de alta/baja según pago:
  saca al negocio de los tres servicios públicos (`public_menu`,
  `public_business_pdf`, `create_public_order`), sin publicarlo ni borrar nada.
  Un negocio nuevo nace activo.
- **ADMIN-SUPER-16** Los negocios que ya existían antes de esta funcionalidad
  quedaron con `plan_completo = true` (es lo que ya tenían de hecho: subdominio
  sin restricción de plan); solo un negocio nuevo arranca sin plan hasta que el
  superadmin elija uno.

## ADMIN-MENU — Categorías y productos

*Aplicado por `src/lib/db/categories.ts`, `src/lib/db/products.ts`,
`src/lib/menu/product-fields.ts`, `src/lib/menu/ordering.ts`, `app/dashboard/menu`.
Cubierto por: `src/lib/menu/product-fields.test.ts` (ADMIN-MENU-1 y 2),
`src/lib/menu/ordering.test.ts` y `src/lib/db/ordering.test.ts` (ADMIN-MENU-3 a 5).*

- **ADMIN-MENU-1** Un producto se crea siempre dentro de una categoría; la
  descripción vacía se guarda como nula y un producto nuevo nace activo.
- **ADMIN-MENU-2** Editar un producto conserva su categoría, salvo que se indique
  otra de forma explícita.
- **ADMIN-MENU-3** Las categorías y, dentro de cada una, los productos se muestran
  en el orden que definió el negocio; los que todavía no tienen orden van al final,
  del más viejo al más nuevo.
- **ADMIN-MENU-4** Reordenar guarda la posición de cada elemento (0, 1, 2…) solo
  dentro de su lista: las categorías del negocio, o los productos de una categoría.
- **ADMIN-MENU-5** Un negocio no puede reordenar ni modificar las categorías o los
  productos de otro.
- **ADMIN-MENU-6** Un producto puede tener una imagen; quitarla la deja en blanco, y
  editar el producto sin tocar la imagen la conserva.
- **ADMIN-MENU-7** Un producto puede marcarse como destacado; un producto nuevo nace
  sin destacar si no se indica. El menú público ya arma la categoría "Destacados"
  con estos productos (PUBLICO-1 a 5); esto solo agrega cómo marcarlos desde el panel.

## ADMIN-CONFIG — Configuración del negocio

*Aplicado por `supabase/migrations/*_configuracion_y_menu_publico.sql`,
`src/lib/settings/`, `src/lib/db/settings.ts` y `app/dashboard/settings`. Cubierto
por: `src/lib/db/settings.test.ts` (ADMIN-CONFIG-1 a 6 y 9, contra Postgres real),
`src/lib/db/storage.test.ts` (ADMIN-CONFIG-7), `src/lib/settings/*.test.ts` (formatos
y redes), `src/lib/storage/images.test.ts` y `src/lib/menu-url.test.ts` (ADMIN-CONFIG-10).*

- **ADMIN-CONFIG-1** Cada negocio tiene una configuración propia (plantilla, colores,
  imagen de cabecera, descripción, horarios y si el menú es público); solo sus
  miembros la ven y la editan.
- **ADMIN-CONFIG-2** La plantilla es `moderno`, `clasico` o `minimal`; los colores son
  `#rrggbb`; la imagen es una dirección `https`; los horarios son rangos
  `HH:MM-HH:MM` por día (de `lunes` a `domingo`), que pueden cruzar la medianoche,
  sin ser de duración cero ni superponerse dentro de un día.
- **ADMIN-CONFIG-3** Guardar la configuración y el WhatsApp del negocio es atómico.
- **ADMIN-CONFIG-4** Un negocio nuevo no es público: su menú solo se ve desde
  Supabase cuando su dueño lo publica.
- **ADMIN-CONFIG-5** La dirección (hasta 200 caracteres), el Instagram y el Facebook
  son opcionales. Las redes se guardan como direcciones `https` de esas redes; se
  acepta escribir `@usuario` o el usuario a secas y se convierte.
- **ADMIN-CONFIG-6** Un negocio puede cerrar temporalmente, con un mensaje opcional
  (hasta 200 caracteres) y una fecha de reapertura opcional. Con fecha, el cierre
  termina solo al llegar ese día.
- **ADMIN-CONFIG-7** Solo los miembros de un negocio suben, cambian y borran archivos
  de su carpeta del bucket de imágenes; solo se aceptan JPG, PNG y WebP de hasta
  2 MB. Nadie puede escribir fuera de la carpeta de su negocio.
- **ADMIN-CONFIG-8** El negocio puede cargar un logo cuadrado (opcional, una imagen https).
  Se usa como ícono al instalar el menú en el celular; sin logo se usa el ícono general.
- **ADMIN-CONFIG-9** El negocio elige el tema de su plantilla, `claro` u `oscuro`
  (columna `theme`, por defecto `claro`); no sigue el modo del sistema del
  visitante. Se guarda junto con el resto de Configuración y `public_menu` lo
  entrega en `config.tema` (PUBLICO-16).
- **ADMIN-CONFIG-10** "Compartir" y el botón "Ver mi menú" del header muestran
  solo las direcciones que de verdad responden, según el plan del negocio
  (`src/lib/menu-url.ts`, `menuLinks()`/`primaryMenuLink()`, mismo criterio que
  RUTAS-4): con `plan_completo`, el subdominio (interactivo, y estático/PDF si
  además los tiene); sin él, el path del dominio raíz para el estático y el PDF,
  si los tiene, y ningún link para el interactivo. También muestra qué plan
  tiene el negocio (badges), de solo lectura: solo el superadmin lo cambia.

## ADMIN-PEDIDOS — Pedidos

*Aplicado por `supabase/migrations/*_pedidos.sql`, `src/lib/orders/`,
`src/lib/db/orders.ts` y `app/dashboard/orders`. Cubierto por:
`src/lib/db/orders.test.ts` (contra Postgres real: ADMIN-PEDIDOS-1 a 5) y
`src/lib/orders/*.test.ts` (ADMIN-PEDIDOS-1 y 3).*

- **ADMIN-PEDIDOS-1** Un pedido pasa por Pendiente, Confirmado, En preparación, Listo
  y Entregado, o se cancela. Desde un estado se puede pasar a uno posterior o
  cancelar; Entregado y Cancelado no cambian. Cada cambio queda en la línea de
  tiempo, con su hora.
- **ADMIN-PEDIDOS-2** Solo los miembros de un negocio ven y cambian sus pedidos.
- **ADMIN-PEDIDOS-3** El negocio puede cargar un pedido a mano (cliente, ítems con
  nombre, precio y cantidad); recibe número y código como cualquier otro.
- **ADMIN-PEDIDOS-4** Los pedidos de un negocio se numeran 1, 2, 3…, sin repetirse ni
  saltearse, aunque lleguen a la vez.
- **ADMIN-PEDIDOS-5** Cada ítem guarda el nombre y el precio del momento: editar o
  borrar el producto después no cambia los pedidos ya hechos.

## ADMIN-RESUMEN — Pantalla de inicio del panel

*Aplicado por `app/dashboard/page.tsx`, `src/lib/db/summary.ts`, `src/lib/dates.ts`,
`src/lib/menu-url.ts` y el menú lateral. Cubierto por: `src/lib/dates.test.ts`,
`src/lib/menu-url.test.ts` y `src/lib/layout/nav-badge.test.ts`.*

- **ADMIN-RESUMEN-1** "Pedidos hoy" cuenta desde las 00:00 de Argentina, sin importar la zona
  horaria del servidor.
- **ADMIN-RESUMEN-2** El link y el QR del menú viven en Configuración → Compartir
  (ADMIN-CONFIG-10), no acá.
- **ADMIN-RESUMEN-3** Los pedidos nuevos (pendientes) se avisan en el resumen y con un contador
  junto a "Pedidos" en el menú lateral (hasta "9+").
- **ADMIN-RESUMEN-4** El resumen muestra qué plan tiene el negocio (`PlanBadges`,
  mismos badges que Configuración → Compartir), de solo lectura.

## ADMIN-SUSPENSION — Negocio suspendido

*Aplicado por `supabase/migrations/20260930000900_bloqueo_por_suspension.sql`,
`src/components/dashboard/SuspendedBanner.tsx` y `app/dashboard/layout.tsx`.
Cubierto por `src/lib/db/suspension.test.ts`, contra Postgres real.*

- **ADMIN-SUSPENSION-1** Un negocio con `active = false` no puede crear ni editar
  categorías, productos, promociones (ni sus ítems), la configuración, ni pedidos
  (manuales o los que llegan del menú público) — un trigger por tabla
  (`guard_business_active()`) lo exige aunque la operación pase por una función
  `SECURITY DEFINER`. Borrar sigue permitido: solo se bloquea alta y edición.
  El panel muestra un aviso fijo en todo el dashboard mientras dure la
  suspensión, y cada acción devuelve un mensaje en español (no el error crudo
  de Postgres) en vez de fallar en silencio.

## ADMIN-PLAN — El panel según el plan

*Aplicado por `src/lib/plan-access.ts`, `app/dashboard/layout.tsx`,
`app/dashboard/page.tsx`, `app/dashboard/{menu,orders,promotions}/page.tsx` y
`app/dashboard/settings/components/SettingsForm.tsx`. Cubierto por
`src/lib/plan-access.test.ts`, en JS puro.*

- **ADMIN-PLAN-1** Sin `plan_web` ni `plan_completo` (`hasDigitalMenu()`), el
  negocio no tiene un menú digital: no ve Menú ni Promociones en el menú
  lateral (ni pueden entrar por la URL directa, redirige a `/dashboard`), y
  Configuración solo muestra "Menú en PDF" (con Compartir y Contraseña, que no
  dependen del plan) — nada de Publicación, Apariencia, Horarios, Cierre
  temporal ni Contacto, que solo tienen sentido con un menú digital.
- **ADMIN-PLAN-2** Sin `plan_completo` (`hasOrders()`), el negocio no tiene
  carrito: no ve Pedidos en el menú lateral (ni puede entrar por la URL
  directa), y el resumen no muestra el aviso de pedidos nuevos ni la tarjeta
  "Pedidos hoy".
- **ADMIN-PLAN-3** El header muestra un botón por cada servicio público que el
  negocio realmente tenga ("Ver carrito", "Ver menú", "Ver QR" — mismas
  direcciones que `menuLinks()`, RUTAS-4), no uno solo fijo.

## ADMIN-PROMOS — Promociones

*Aplicado por `supabase/migrations/*_orden_y_promociones.sql`,
`src/lib/promotions/`, `src/lib/db/promotions.ts`, `app/dashboard/promotions`.
Cubierto por: `src/lib/db/promotions.test.ts` (ADMIN-PROMOS-2, 3, 5 y 6) y
`src/lib/promotions/*.test.ts` (ADMIN-PROMOS-1 y 4).*

- **ADMIN-PROMOS-1** Una promoción es de tipo `percent` (descuento del 1 al 100 %
  sobre cada producto) o `combo` (precio fijo mayor a 0 por el conjunto), tiene un
  nombre y lleva al menos un producto.
- **ADMIN-PROMOS-2** Los productos de una promoción se guardan en el orden elegido
  y solo pueden ser del mismo negocio que la promoción.
- **ADMIN-PROMOS-3** Guardar una promoción con sus productos es atómico: si algo
  falla no queda una promoción a medias ni con productos de menos.
- **ADMIN-PROMOS-4** El precio final de una promoción es la suma de sus productos
  menos el descuento (`percent`) o el precio fijo (`combo`); el ahorro nunca es
  negativo.
- **ADMIN-PROMOS-5** Un negocio solo ve, edita y borra sus propias promociones.
- **ADMIN-PROMOS-6** Borrar un producto lo saca de sus promociones; borrar una
  promoción no borra sus productos.

---

## No especificado deliberadamente

Lo que está fuera a propósito. Un requisito para cualquiera de estas cosas se
escribe acá antes de construirse.

- Pagos online: el pedido termina en WhatsApp.
- Cuentas de cliente final: quien pide no se registra.

## Brechas conocidas

Cosas que no cumplen lo que deberían, o que no se pueden testear acá. Cada una
se resuelve en su propia rama `fix/`.

- **Protección de ramas.** El repositorio privado en plan gratuito no permite
  rulesets: las reglas de [BRANCHING.md](BRANCHING.md) se cumplen por acuerdo.
- **Admin: `role` no limita nada.** Cualquier miembro de un negocio puede
  editar `businesses`, incluido el `slug`, sea cual sea su `role` en
  `business_users`. Falta definir qué puede hacer cada rol.
- **Menú público sin acceso a Supabase.** No hay políticas para `anon`: hoy el
  menú web lee JSON y no lo necesita, pero cuando lea de Supabase va a hacer
  falta permitir leer negocios, categorías y productos activos.
- **Admin: un usuario con varios negocios no puede entrar.** El esquema permite
  varias membresías por usuario, pero `getCurrentBusiness()` usa
  `.maybeSingle()`: con más de una falla, devuelve `null` y manda a `/login`.
- **Superadmin: pasos manuales en Supabase.** (1) Apagar el registro público
  (`Allow new users to sign up`): con la clave pública, cualquiera puede crear
  cuentas llamando a la API aunque el admin no tenga pantalla para eso. (2) Cargar
  el primer superadmin con SQL. (3) Poner `SUPABASE_SERVICE_ROLE_KEY` en el
  servidor. Ver [PLAN.md](PLAN.md).
- **Recuperar la contraseña por mail no llega a los clientes.** El mail por defecto
  de Supabase solo entrega a miembros del equipo del proyecto y permite 2 por hora;
  sin un SMTP propio, `/recuperar` no le sirve a un cliente. Por eso el
  restablecimiento lo hace el superadmin (ADMIN-SUPER-11). La marca de "contraseña
  temporal" la respeta la app, no la base: quien use la API con su sesión puede
  saltearla, pero solo para su propia cuenta.
- **Superadmin: roles sin efecto.** Un miembro puede ser `owner` o `staff`, pero
  ninguna política distingue uno de otro. Ver "`role` no limita nada".
- **Landing: `favicon.svg` pesa 2,5 MB.** Es un PNG metido dentro de un SVG y también
  lo usan las demos de `web/`; la landing ya no lo carga en la página (usa `logo.png`),
  pero conviene reemplazarlo por un SVG real o por el PNG en las demos.
- **Landing: redes sociales.** El pie ya no muestra Twitter ni un Instagram sin
  destino; cuando el negocio tenga cuentas, agregarlas.
- **Dominio del email.** La landing y los menús usan `smaalacarta.com.ar`; el email de
  ventas sigue siendo `@smaalacarta.online` hasta que exista un buzón en el otro dominio.
