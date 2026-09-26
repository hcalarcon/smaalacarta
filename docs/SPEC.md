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

*Aplicado por `web/vercel.json`, `web/apps/menu-app/app.js` y
`web/apps/menu-app/lib/hostname.js`. Cubierto por: `lib/hostname.test.js`
(RUTAS-1 y 2).*

- **RUTAS-1** Un negocio se abre desde `<slug>.smaalacarta.com.ar` (o
  `.smaalacarta.online`) sin declararlo en el código: el subdominio es su slug. El
  parámetro `?cliente=<slug>` sigue sirviendo para desarrollo.
- **RUTAS-2** Los subdominios reservados (`www`, `admin`, `app`, `api`, `demo`…) no
  son negocios; los de las demos (`moderno`, `clasico`, `minimal`) abren su demo.

## HORARIO — Abierto o cerrado

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## MENU — Armado del menú

*Destacados, ofertas y categorías. Aplicado por: pendiente. Cubierto por:
pendiente.*

_Sin requisitos todavía._

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
  configurado, no lo tiene o falla, usa los JSON locales como hasta ahora.
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
- **SEGUIMIENTO-10** Al confirmar, el cliente puede mandar el pedido por WhatsApp y
  seguirlo en cualquier orden: el mensaje queda guardado en su navegador y la página de
  seguimiento ofrece enviarlo si todavía no lo envió.
- **SEGUIMIENTO-11** La página de seguimiento tiene la estética del negocio: sus colores,
  su imagen de cabecera y su plantilla (`minimal` queda blanca). El seguimiento sigue sin
  datos personales, y los colores y la imagen se validan antes de usarlos.

## PDF — Menú en PDF

*Aplicado por `web/apps/pdf`. Cubierto por: pendiente.*

_Sin requisitos todavía._

---

# Landing — `smaalacarta/landing`

## LANDING — Sitio de venta

*Planes, enlaces de contacto, demos. Aplicado por `landing/index.html`,
`landing/landing.js`, `landing/landing.css`, `landing/robots.txt`,
`landing/sitemap.xml` y `landing/assets/site.webmanifest`. Cubierto por:
`landing/landing.test.js`.*

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

## ADMIN-CONFIG — Configuración del negocio

*Aplicado por `supabase/migrations/*_configuracion_y_menu_publico.sql`,
`src/lib/settings/`, `src/lib/db/settings.ts` y `app/dashboard/settings`. Cubierto
por: `src/lib/db/settings.test.ts` (ADMIN-CONFIG-1 a 6, contra Postgres real),
`src/lib/db/storage.test.ts` (ADMIN-CONFIG-7), `src/lib/settings/*.test.ts` (formatos
y redes) y `src/lib/storage/images.test.ts`.*

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
