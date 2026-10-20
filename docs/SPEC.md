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
  tenga `plan_completo` — si lo tiene, ese servicio se sirve por subdominio, no por path. El
  slug llega distinto según el caso: por query (`?ruta=<slug>`) en el estático,
  que corre del lado del servidor; por el propio `pathname` del navegador
  (`/<slug>/pdf`) en el PDF, que corre del lado del cliente y nunca ve la query
  del rewrite. El subdominio, a su vez, exige `plan_completo` además del plan del servicio
  (el interactivo solo exige `plan_completo`): sin él, un negocio no responde por
  subdominio en ningún servicio, solo por path (RUTAS-5).
- **RUTAS-5** Los tres servicios de un negocio son independientes: el interactivo exige
  `plan_completo`; el estático (`/menu.html`) exige `plan_web`; el PDF (`/pdf`) exige `plan_pdf`.
  Estático y PDF van por subdominio si además hay `plan_completo` y por el path del dominio raíz si
  no. `plan_completo` no habilita el estático ni el PDF por sí solo. `public_menu` recibe
  `p_static` (el estático lo manda en `true`; el interactivo no responde por path) y
  `public_business_pdf` exige `plan_pdf`; `published`, `active` y la suspensión siguen igual. Un
  test contra Postgres real cubre las ocho combinaciones de planes en cada servicio y ruta.

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
  cargado (las demos, hoy), se ve como siempre: claro. El interactivo tiene además
  un switch (`#btn-tema`, junto al estado abierto/cerrado) para alternar entre
  los dos temas sin recargar (PUBLICO-24); no existe en el estático. El cambio de tema anima suave (transición en fondo, texto
  y borde), salvo con `prefers-reduced-motion`.
- **PUBLICO-24** El tema que el negocio elige en Configuración (ADMIN-CONFIG-9) es el que ve
  cada visitante la primera vez; el visitante puede cambiarlo con el switch del menú
  interactivo, y su elección queda en su navegador, por negocio (`lib/theme.js`), y gana al
  tema del negocio las próximas veces. Sin almacenamiento disponible, vale el del negocio.
- **PUBLICO-25** `public_menu` entrega `agotado` (verdadero o falso) en cada producto, y no
  entrega una promoción que lleva algún producto sin stock (ADMIN-MENU-8).
- **PUBLICO-26** El menú interactivo muestra un producto agotado atenuado y con la etiqueta "Sin
  stock", sin botón para agregarlo. Si el carrito guardado de una visita anterior tiene uno, se
  quita al cargar el menú y se avisa. Si al confirmar el pedido el sistema responde que algo
  está sin stock (`out_of_stock`), se avisa y el menú se vuelve a cargar con lo actual.
- **PUBLICO-27** Los textos de "Sin stock" y los avisos están en español, inglés y portugués.
- **PUBLICO-28** `public_menu` entrega en `config` `programados` (si el negocio acepta pedidos
  programados, ADMIN-CONFIG-16) y `anticipacionMin` (los minutos de anticipación).
- **PUBLICO-29** `scheduledSlots(horarios, anticipacionMin, ahora)` (`lib/scheduled-slots.js`)
  devuelve las horas de hoy, cada 15 minutos, que están dentro de un rango abierto (con los
  rangos nocturnos) y desde ahora más la anticipación, siempre en hora de Argentina; sin
  horarios cargados, cualquier hora de hoy que quede. Es el mismo cálculo que
  `is_schedulable_at` en la base, y un test compara los dos.
- **PUBLICO-30** El checkout ofrece "Lo antes posible" o "Programar" (un select con esas horas)
  solo si el menú viene de Supabase y el negocio acepta pedidos programados; si no queda
  ninguna hora, solo "Lo antes posible"; con un menú de JSON se comporta como siempre (un
  campo de hora libre que va a las notas). La hora elegida se manda al servidor
  (`p_scheduled_for`) y deja de ir en las notas; el mensaje de WhatsApp sigue diciendo
  "Horario: HH:MM". Los motivos de rechazo nuevos (`scheduling_disabled`, `invalid_schedule`)
  tienen texto en español, inglés y portugués.
- **PUBLICO-31** `public_menu` entrega en `config` `anticipados` (`activo`, `proximaApertura` y
  `corte`, en ISO) solo si el negocio acepta pedidos anticipados (ADMIN-CONFIG-18), está cerrado
  por horario (no por cierre temporal), la próxima apertura es de un día con corte cargado y ese
  corte todavía no pasó; si no, no entrega la clave.
- **PUBLICO-32** `preorderWindow(horarios, cortes, ahora)` (`lib/preorders.js`) devuelve la próxima
  apertura y su corte (siempre en hora de Argentina), o null si el negocio está abierto, no tiene
  horarios, ese día no tiene corte o el corte ya pasó. El corte de un día de venta es la última
  vez que cae el día y la hora cargados antes de su primera apertura. Es el mismo cálculo que
  `preorder_window` en la base, y un test compara los dos.
- **PUBLICO-33** Con `anticipados` activo, en vez de bloquear el menú avisa "Cerrado ahora. Podés
  dejar tu pedido para el sábado 10/10 (hasta el viernes 20:00)", el botón de enviar queda
  habilitado y el pedido se manda con `p_preorder`; pasado el corte queda cerrado como siempre.
  Un pedido anticipado no pregunta la hora y no muestra link de seguimiento: "Gracias por tu
  pedido" dice "Tu pedido es para el sábado 10/10".
- **PUBLICO-34** El mensaje de WhatsApp de un pedido anticipado incluye "Pedido para el sábado
  10/10" y no lleva link de seguimiento. Los textos nuevos y el motivo de rechazo
  `preorder_closed` (`P0013`) están en español, inglés y portugués.
- **PUBLICO-17** Las demos están siempre abiertas: quien las prueba puede hacer el pedido
  de prueba a cualquier hora. Sus `config.json` no traen `horarios` (PUBLICO-4 y 12).
- **PUBLICO-18** `public_menu` entrega en `config` las opciones que el negocio ofrece:
  `entrega` y `pagos` (listas), y `transferencia` con `alias` y `cbu` solo si
  "transferencia" está habilitada y cargó alguno de los dos.
- **PUBLICO-19** El checkout arma los selects de entrega y de pago con esas opciones
  (`lib/checkout-options.js`). Si un grupo queda con una sola opción, se preselecciona
  y su select se oculta; con varias, hay que elegir una. Si el menú no trae esos campos
  (JSON de demos y negocios sin Supabase), se ofrecen todas, como hasta ahora.
- **PUBLICO-20** Si el pago elegido es transferencia y el negocio cargó alias o CBU/CVU, se
  muestran con un botón "Copiar" para cada uno, en el checkout apenas se elige y de nuevo
  en "Gracias por tu pedido". Se pintan con `textContent`; ni el mensaje de WhatsApp ni el
  seguimiento llevan esos datos.
- **PUBLICO-21** Los textos nuevos (alias, CBU/CVU, "Copiar", "Copiado", avisos de entrega) están
  en español, inglés y portugués.
- **PUBLICO-22** Si el negocio ofrece un solo tipo de entrega, el checkout lo dice donde estaba
  el select: "Retirá tu pedido en nuestro local" con su dirección si la cargó, o "Solo hacemos
  delivery". Con las dos opciones, o con un menú sin esos campos, no hay aviso.
- **PUBLICO-23** El checkout, en las tres plantillas, es un cuadro de hasta 560 px de ancho,
  centrado horizontalmente y despegado 15 px del borde inferior; no ocupa toda la altura (deja
  15 px arriba), con scroll propio y el encabezado con la X siempre visible, y tocar afuera lo
  cierra. En tema oscuro, los controles nativos (el reloj del horario, la lista del select) se
  dibujan oscuros, y en `moderno` los botones + y − de
  cantidad usan el color del negocio, no negro. Solo se prueba mirándolo en el navegador.
- **PUBLICO-35** `public_menu` incluye `mercadopago` en `config.pagos` solo si el negocio lo tiene entre sus
  medios de pago **y** tiene credenciales cargadas y habilitadas (MP-1); nada de `payment_credentials` sale
  por `public_menu`.
- **PUBLICO-36** El checkout ofrece "Mercado Pago" (español, inglés y portugués) solo si `config.pagos` lo
  trae (`lib/checkout-options.js`). Con ese medio guarda el pedido como siempre, pide el link de pago a
  `/admin/api/mp/create` (nunca manda montos) y redirige a él, sin abrir WhatsApp. Si pedir el link falla,
  avisa y lleva al seguimiento del pedido, que se puede cancelar.
- **PUBLICO-37** El seguimiento de un pedido con Mercado Pago en "awaiting" o "failed" dice "Esperando el
  pago" (o "El pago no se completó") con un botón para reintentar, y mientras esté en "awaiting" consulta
  `/admin/api/mp/verify` al cargar y cada pocos segundos; al pasar a "paid" dice "Pago confirmado". Todo
  con `textContent`.
- **PUBLICO-38** El seguimiento de un pedido anticipado pagado con Mercado Pago muestra solo "Pago
  confirmado" o "Esperando el pago" y "Tu pedido es para el <día>" (hora de Argentina), sin línea de
  tiempo de estados; mismo flujo de verificación y reintento.
- **PUBLICO-39** `public_menu` entrega en cada producto con grupos de opciones `opciones`:
  `[{id, nombre, min, max, repetir, opciones: [{id, nombre, precio, agotado}]}]`, en el orden del
  panel. Solo van los grupos activos asociados a ese producto y sus opciones activas (un grupo sin
  opciones activas no se entrega). Un producto sin grupos no lleva la clave, y las promociones nunca
  llevan `opciones`.
- **PUBLICO-40** `create_public_order` acepta en cada ítem de producto `options: [{id, quantity}]` y
  rechaza con `P0014` (motivo `invalid_options`) una opción que no es activa, de un grupo activo
  asociado a ese producto; una elección cuya suma por grupo no está entre `min` y `max`; una opción
  elegida más de una vez en un grupo que no permite repetir; un producto con grupo obligatorio pedido
  sin opciones; y cualquier opción en una promoción o combo. Un grupo sin opciones activas no se exige.
- **PUBLICO-41** Una opción agotada (`sold_out`) rechaza el pedido con `P0009` (`out_of_stock`), como un
  producto sin stock.
- **PUBLICO-42** El navegador manda solo ids y cantidades de opciones; el servidor calcula todo precio:
  el `unit_price` del ítem es el precio del producto más la suma de `price_delta × cantidad` de lo
  elegido, y el total del pedido lo incluye. `order_items.options` guarda la foto de lo elegido
  (`[{grupo, nombre, cantidad, precio}]`): un cambio de precio o de nombre posterior no altera un
  pedido hecho.
- **PUBLICO-43** Un pedido puede llevar dos líneas del mismo producto con distinta elección de
  opciones; la misma elección en dos líneas sigue siendo un ítem repetido (`22023`).
- **PUBLICO-44** `lib/options.js` (funciones puras): valida una elección contra `min`, `max` y
  `repetir`, calcula el precio con extras y arma una firma estable de la elección para agrupar las
  líneas iguales del carrito.
- **PUBLICO-45** En el menú interactivo, un producto con grupos abre al tocar "+" una hoja inferior con
  cada grupo (título, "Obligatorio" u "Opcional, hasta N", radio si el máximo es 1, casillas si es
  mayor y contador +/− si permite repetir), las opciones agotadas deshabilitadas con "Sin stock", el
  precio total en vivo y el botón "Agregar" deshabilitado hasta que la elección sea válida. Un producto
  sin grupos se agrega directo, como siempre.
- **PUBLICO-46** En el carrito, una línea con opciones las muestra y su subtotal incluye los extras; el
  mismo producto con la misma elección suma cantidad y con otra elección es otra línea. Un carrito
  guardado antes de las opciones (sin ellas) sigue funcionando.
- **PUBLICO-47** `reconcileCart` quita del carrito, y avisa, las líneas cuyas opciones ya no existen o
  están agotadas, las que dejaron de cumplir `min`/`max`, y las de un producto que ahora exige opciones y
  no las tiene.
- **PUBLICO-48** `buildOrderItems` manda las opciones como `{id, quantity}`, nunca precios. El mensaje de
  WhatsApp lista cada opción bajo su ítem (`  + Queso x1`) y suma los extras al subtotal y al total.
- **PUBLICO-49** Los textos de las opciones están en español, inglés y portugués; los nombres de grupos y
  opciones salen como los cargó el negocio. Todo dato del negocio se escribe con `textContent` o
  `escapeHtml`. Los estilos de la hoja y de las líneas del carrito están en `base.css` y en las tres
  plantillas, en claro y oscuro (el aspecto solo se comprueba mirándolo en el navegador).
- **PUBLICO-50** `public_menu` entrega `config.header.posicion` `{x, y}` (enteros de 0 a 100). `headerPosition(config)`
  devuelve `"x% y%"` solo con enteros de 0 a 100 y `""` en cualquier otro caso (nunca texto del dato en el
  estilo); `headerBackground` queda igual. El menú interactivo la aplica como `background-position` de la
  cabecera, y sin posición queda centrada como antes.
- **PUBLICO-51** Un producto sin imagen propia (o con una vacía) sale de `public_menu` con `imagen` = la
  ilustración que sugiere `suggest_default_image(nombre, categoría)`, sin escribir nada en `products`. La imagen
  propia siempre gana.
- **PUBLICO-52** Con `show_default_images` apagado, o sin coincidencia, o con la entrada inactiva, el producto
  sale sin `imagen` y el menú muestra el logo del negocio.
- **PUBLICO-53** Una imagen que viene de una ilustración sale con `imagenIlustrativa: true`; una imagen propia
  nunca lo lleva. La sugerencia se calcula una sola vez por producto.
- **PUBLICO-54** `productImage(item, config)` resuelve qué muestra la tarjeta: la imagen del producto; si falta, el
  logo del negocio; si tampoco hay, el de SMA a la Carta (`DEFAULT_LOGO`). Solo se aceptan direcciones http(s).
- **PUBLICO-55** La ilustración lleva la etiqueta "Imagen ilustrativa" (`item.illustrative`, en español, inglés y
  portugués); el logo de reemplazo no la lleva.
- **PUBLICO-56** La ilustración y el logo se ven con `object-fit: contain` sobre un fondo neutro (clases
  `imagen-ilustrativa` e `imagen-logo`) y no se pueden ampliar: la lupa (ESTATICO-9) es solo para fotos propias.
- **PUBLICO-57** Los estilos de la ilustración, el logo y la etiqueta están en `base.css` y en las tres
  plantillas, en claro y oscuro (el aspecto solo se comprueba mirándolo en el navegador).
- **PUBLICO-58** Con `?preview=1` el menú interactivo entra en modo vista previa (`isPreviewMode`): no consulta
  Supabase, no crea pedidos, no lee ni escribe `localStorage` (carrito, idioma, tema), no registra el service
  worker ni el manifest, y no hace nada al tocar (agregar, abrir el carrito, enviar el pedido o seguir un link),
  aunque los botones se ven igual.
- **PUBLICO-59** La vista previa solo acepta mensajes `{ type: "preview", config, menu }` que vengan de la
  ventana que la contiene y de un origen permitido: `https://www.smaalacarta.com.ar` y, solo si la página se
  abrió desde localhost, la dirección local que indique `?admin=` (`allowedOrigins`, `isAllowedOrigin`).
  `parsePreviewMessage` reconstruye los datos como datos planos y descarta el mensaje si el tipo no coincide, si
  falta la configuración o las categorías, o si algún texto, lista, profundidad o cantidad de datos excede el
  límite. `vercel.json` manda `frame-ancestors https://www.smaalacarta.com.ar` solo con `?preview=1`.
- **PUBLICO-60** Cada mensaje válido vuelve a dibujar el menú sin recargar la página (si llegan varios seguidos,
  se dibuja el último): `applyPreviewConfig` aplica la plantilla (solo `moderno`, `clasico` o `minimal`), el tema
  y los colores, y quita las variables de color de la configuración anterior; luego se dibujan cabecera, logo,
  descripción, horarios y productos con el mismo código que el menú público. Los textos del negocio siguen
  pasando por `escapeHtml` o `textContent`.
- **PUBLICO-61** La vista previa avisa al panel que está lista (`preview-ready`) y, tras cada dibujo o cambio de
  tamaño, el rectángulo de la cabecera (`headerRect`, `preview-header`) solo al origen que le escribió.
- **PUBLICO-62** Cada producto del pedido puede llevar una nota del cliente (`order_items.note`): texto libre de hasta
  140 caracteres. La base la limpia (`clean_item_note`: caracteres de control y espacios, saltos de línea incluidos,
  pasan a un solo espacio), la recorta a 140 y la deja nula si queda vacía; un valor que no es texto se ignora. La nota
  no cambia el precio ni el total, y el navegador sigue mandando solo ids y cantidades.
- **PUBLICO-63** Dos líneas con el mismo producto y las mismas opciones pero distinta nota son líneas distintas; con la
  misma nota (ya limpia), es una repetida y la base la rechaza como cualquier línea repetida.
- **PUBLICO-64** `business_settings.allow_item_notes` (por defecto `true`) lo decide el negocio. Con el interruptor
  apagado, `create_public_order` ignora las notas sin error y `config.notasPorItem` es `false`.
- **PUBLICO-65** En el menú interactivo la nota se escribe **al seleccionar el producto**, en la hoja del
  producto, y no en el carrito. Solo con `config.notasPorItem`: tocar la foto o el nombre de la tarjeta (no el
  "+") abre la hoja con nombre y foto, cantidad (− / +, de 1 a 99), los grupos de opciones si los tiene, el campo
  "Nota para este producto (opcional)" (`textarea` de 2 líneas, 140 caracteres, contador, ejemplo "Sin cheddar,
  con mostaza", sin salto de línea) y el botón "Agregar $total" con el precio en vivo
  (producto + extras) × cantidad. Un producto sin grupos también abre la hoja. El "+" sigue siendo el agregado
  rápido de un toque en un producto sin grupos (sin nota); en uno con grupos abre la hoja. Con el interruptor
  apagado nada de esto aparece: el toque en la tarjeta no abre nada y la hoja de opciones es la de siempre. La
  foto de una tarjeta que abre la hoja no se amplía (el visor del menú estático no cambia). La hoja dice que la
  nota es un pedido al local, no una promesa; es un diálogo con el foco atrapado, se cierra con Esc y devuelve el
  foco a la tarjeta. Textos en es, en y pt. La nota entra en la firma del ítem del carrito (misma nota, suman
  cantidad); un carrito viejo de `localStorage` sigue funcionando.
- **PUBLICO-65b** En el carrito la nota de una línea se ve de solo lectura bajo el ítem (`📝 texto`, con
  `textContent`), sin campo de edición. Un botón lápiz ("Editar nota", o "Agregar nota" si no tiene) reabre la
  hoja precargada con las opciones, la cantidad y la nota de esa línea; al confirmar reemplaza la línea
  (`replaceLine`): si su firma coincide con otra línea, se juntan y suman cantidad.
- **PUBLICO-66** `buildOrderItems` manda `{id, kind, quantity, options, note}`, y el mensaje de WhatsApp lista la nota
  bajo cada ítem (`  📝 sin cheddar`). Cualquier texto del cliente se muestra con `textContent` o `escapeHtml`.
- **PUBLICO-67** En el menú interactivo, una promoción de Ofertas muestra la `imagen` que le resolvió el servidor
  (ADMIN-PROMO-1), con la etiqueta "Imagen ilustrativa" si `imagenIlustrativa` es verdadera. Sin `imagen`, no lleva ninguna
  (como hasta ahora, no cae al logo). Solo direcciones http(s).
- **PUBLICO-68** Una promoción con `validaHasta` muestra "Válida hasta el dd/mm" (día de Argentina, `TIME_ZONE` de
  `lib/schedule.js`).
- **PUBLICO-69** Una promoción con `quedan` muestra "¡Últimas N!" ("¡Última unidad!" con una).
- **PUBLICO-70** `reconcileCart` quita del carrito una promoción que el menú ya no ofrece (vencida o agotada) y la que pasó
  su `validaHasta` aunque el menú abierto todavía la traiga, y avisa cuál.
- **PUBLICO-71** Si el servidor rechaza el pedido con `unavailable`, se muestra el aviso de siempre y el menú se vuelve a
  pedir (como con `out_of_stock`), así el carrito se limpia solo.
- **PUBLICO-72** Los textos están en es, en y pt (`promo.validUntil`, `promo.lastUnits`, `promo.lastOne`) y se ven bien en
  tema claro y oscuro en las tres plantillas.
- **PUBLICO-73** Solo en locales con envío (entrega "delivery" habilitada y `public_delivery_zones` con al menos un
  barrio), al entrar el menú muestra una tarjeta liviana que se puede cerrar: "¿Para envío o para retirar?". En los demás
  locales (y en los menús de un JSON) no aparece nada nuevo.
- **PUBLICO-74** "Retirar" cierra la tarjeta y deja el checkout en "Retiro en el local". "Envío" muestra las zonas del
  local con un buscador que ignora acentos y mayúsculas.
- **PUBLICO-75** Elegir una zona muestra "Enviamos a {zona} · ${precio} aprox." (precio de referencia de
  `public_delivery_zones`) y deja el checkout con entrega "delivery" y esa zona preseleccionada. El checkout valida la zona
  como siempre: la tarjeta solo ayuda.
- **PUBLICO-76** "Mi barrio no está" muestra "No hay envío a tu barrio. Podés retirar en el local." (sin la segunda frase si
  el local no ofrece retiro) y ofrece retirar; además bloquea el envío (ver PUBLICO-80).
- **PUBLICO-77** La elección se guarda en `localStorage` por negocio (slug), con `try/catch`; si falla, el menú anda igual.
  Al volver no se pregunta de nuevo. Una zona guardada que ya no está en la lista se borra y se vuelve a preguntar.
- **PUBLICO-78** Un chip arriba del menú ("📍 {zona}" o "Retiro") vuelve a abrir la tarjeta para cambiar la elección.
- **PUBLICO-79** Los textos están en es, en y pt, los nombres de barrio se pintan con `textContent` y se ve bien en las
  tres plantillas y a 360 px.
- **PUBLICO-80** El selector de zona es un diálogo con el fondo oscurecido detrás: hoja desde abajo en el celular y
  centrado en escritorio (≥ 640 px), con el scroll de la página bloqueado mientras está abierto. Elegir "Mi barrio no
  está" bloquea el envío: el checkout queda solo en retiro, la opción "Envío" se ve deshabilitada y un aviso dice "No
  hay envío a tu barrio. Podés retirar en el local." (es/en/pt); el chip dice "Sin envío a tu barrio". Elegir una zona
  de la lista con el chip vuelve a habilitar el envío. Esta elección no se guarda: al volver se pregunta de nuevo.
- **PUBLICO-81** El diálogo de zona atrapa el foco (Tab y Shift+Tab dan la vuelta), se cierra con Escape, con × o
  tocando el fondo, enfoca el buscador (o la primera opción) al abrirse y devuelve el foco a quien lo abrió.
- **PUBLICO-82** El checkout no confirma con envío si no hay una zona de la lista elegida, ni con "Mi barrio no está"
  aunque quede una zona cargada: avisa y no crea el pedido. Con barrios sin cargar no se exige zona. El servidor la
  valida igual (`create_public_order`).

**Tarea 24 — Moderna y Minimalista con cara de app.** Todo lo de abajo aplica a las plantillas `moderno` y `minimal`;
`clasico` queda como estaba.

- **PUBLICO-86** `contrastText(fondo)` devuelve el texto (blanco u oscuro) que se lee sobre ese fondo con un
  contraste WCAG de al menos 4.5:1, para cualquier color; si no es un color válido, devuelve `null`.
- **PUBLICO-87** El precio va en una pastilla con fondo propio (el color principal del local) y texto calculado con
  `contrastText`, con un borde fino que la separa de la tarjeta; se ve así en productos, promos, carrito y checkout,
  sea cual sea el color elegido y en tema claro y oscuro.
- **PUBLICO-88** `suggestLanguage(idiomaDelCelular, idiomasDelMenu, guardado)` devuelve `en` o `pt` cuando el idioma
  del celular es inglés o portugués (por ejemplo `pt-BR`), el menú lo ofrece y no hay una elección guardada; en
  cualquier otro caso devuelve `null`.
- **PUBLICO-89** El menú interactivo arranca en el idioma de `?lang=`, si no en el que el visitante eligió la última
  vez, y si no en español. Elegirlo se guarda en `localStorage` (con `try/catch`: sin almacenamiento, no se guarda).
- **PUBLICO-90** Si corresponde sugerir un idioma (PUBLICO-88) y el menú está en español, aparece un aviso chico
  ("¿Ver el menú en English?") con un botón para cambiar y otro para cerrar; cualquiera de los dos guarda la
  elección y el aviso no vuelve.
- **PUBLICO-91** El idioma es un solo botón compacto ("ES") dentro del encabezado, que al tocarlo se estira hacia la izquierda y muestra los otros idiomas en la misma línea (animación de ~200 ms, sin ella con `prefers-reduced-motion`; `aria-expanded`; se cierra al elegir, al tocar afuera o con Escape);
  se va con el desplazamiento y nunca queda encima de las categorías. Botones de al menos 44 px de alto.
- **PUBLICO-92** Abajo hay una barra fija con Menú, Promos y Carrito (el carrito con contador de unidades); cada
  botón tiene `aria-label` y al menos 44 px de alto; Promos no aparece si el local no tiene promociones.
- **PUBLICO-93** Las promos y los destacados van en un carrusel horizontal centrado con scroll suave y snap; con una
  sola, va centrada y sin carrusel.
- **PUBLICO-94** En el celular el checkout es una hoja que sube desde abajo, a pantalla completa, con scroll propio y
  el botón de confirmar siempre visible; en escritorio es un modal que no desborda el ancho.
- **PUBLICO-95** La hoja del checkout se cierra con Escape y con el gesto de atrás del celular, devuelve el foco a
  quien la abrió y no deja desplazar la página de atrás.
- **PUBLICO-96** Los nombres de productos, promos y del local se parten en líneas (`text-wrap: balance`,
  `hyphens: auto`) en vez de cortarse con puntos suspensivos, y su contenedor crece con el texto, sin alto ni ancho
  fijo, con un radio que no recorta. El nombre de un producto o promo va a todo el ancho de la tarjeta, debajo de la
  imagen y encima de la descripción, y nunca se parte letra por letra.
- **PUBLICO-97** El encabezado es liviano: una fila arriba con Volver a la izquierda e idioma y tema a la derecha;
  debajo, el nombre del local directo sobre la portada (sin caja, con degradado y sombra, hasta dos líneas) con el
  logo al lado si hay, y una línea chica "Abierto · zona". No hay pastillas sueltas; el buscador se mantiene.
- **PUBLICO-98** En la plantilla Moderna, en celular la portada del encabezado mide entre 120 y 140 px; al
  desplazarse, la portada y su fila de controles desaparecen; quedan fijas una fila compacta solo con el nombre del
  local y las tabs. La lupa abre el buscador sin aumentar el alto permanente; el foco es visible, se respeta
  `prefers-reduced-motion` y Clásica y Minimalista no cambian.
- **PUBLICO-99** El loader del menú muestra, además de la marca SMA a la carta, el nombre del negocio que está
  cargando, en texto escapado mediante `textContent` y sin cortarlo en celulares.
- **PUBLICO-100** En la plantilla Moderna, en pantallas de escritorio (desde 1024 px) el encabezado ocupa menos
  alto que en su diseño previo y el sombreado cubre toda la portada, no solo el área detrás del nombre. El celular
  y las plantillas Clásica y Minimalista no cambian.
- **PUBLICO-83** Mientras carga el menú interactivo se ve un loader animado: una hamburguesa que se arma y debajo
  "SMA a la carta" que se va escribiendo; igual en las tres plantillas, en CSS y SVG propios, con los colores del
  local si ya se conocen, sin librerías y sin bloquear la carga; con `prefers-reduced-motion` queda quieto, con la
  marca completa, y lleva un texto accesible "Cargando…" (es/en/pt).
- **PUBLICO-85** Al terminar de cargar, el loader se desvanece mientras el menú aparece con un fade suave (sin
  corte), y en tema oscuro el loader ya se ve oscuro; con `prefers-reduced-motion` el cambio es inmediato.
- **PUBLICO-101** El loader interactivo permite elegir en `config.animacionCarga` una animación propia de comida:
  `hamburguesa`, `pizza`, `cafe`, `helado`, `parrilla`, `sushi`, `pastas` o `panificados`. Si falta o el valor no es
  válido, usa `hamburguesa`. Cada opción tiene su propia ilustración SVG y animación CSS, decorativas y sin
  dependencias; respetan `prefers-reduced-motion`, el tema y el fade actuales. En `helado`, la bocha cae y se asienta
  sobre un cucurucho con trama antes de que caiga la cereza. La elección se hace desde Configuración → Animaciones
  (PUBLICO-103).
- **PUBLICO-102** Cada negocio elige cómo se anima su menú al entrar (`business_settings.menu_animation`, que llega al
  menú como `config.animacionMenu` y se aplica en `html[data-animacion-menu]`): `estandar` (el fundido de siempre, es lo
  que tienen hoy todos los negocios), `suave` (títulos y productos suben despacio, escalonados), `dinamica` (los
  productos rebotan y los títulos se deslizan) o `ninguna` ("Sin animaciones": no se mueve nada del menú, ni
  transiciones). Un valor que falta o no vale se lee como `estandar`. Disponible en todos los planes.
- **PUBLICO-103** En Configuración hay una sección **Animaciones** (después de Apariencia) con: la animación del menú
  (las cuatro de arriba), la animación de carga (las ocho de comida de PUBLICO-101 o **La mía**) y la imagen de fondo.
  Se guarda con "Guardar cambios", junto con el resto, con `save_menu_look()`, que vuelve a
  validar todo (`22023`) y deja el negocio de la sesión como único dueño de lo que cambia. Los negocios que ya
  existían quedan en `estandar`, `hamburguesa` y sin fondo.
- **PUBLICO-104** La animación de carga propia es una imagen animada (GIF, WebP o PNG animado) del propio negocio:
  `loader_animation = 'custom'` exige `loader_custom_url`, y el menú la muestra en el loader con `config.animacionCargaUrl`.
  Con `prefers-reduced-motion` no se usa (un GIF no se puede pausar) y queda la de comida, que se ve quieta. Lottie
  (`.json`) queda para después: hoy no hay librería de Lottie en el loader.
- **PUBLICO-105** Los archivos van a Storage con la sesión del negocio. Las animaciones, al bucket `business-animations`
  (público para leer, **1 MB** y solo GIF, WebP o PNG); el fondo, a `business-images` (**2 MB**, JPG, PNG o WebP). En los
  dos, cada negocio escribe solo en su carpeta `<business_id>/…` (mismas políticas que el logo). El tipo y el tamaño los
  hace cumplir el bucket, no el navegador (que avisa antes); la dirección guardada tiene que ser de la carpeta del
  propio negocio y del bucket correcto, tanto en `save_menu_look()` como en un CHECK de la tabla.
- **PUBLICO-106** Un negocio no puede cambiar la elección de otro ni subir a su carpeta; sin sesión no se guarda nada.
- **PUBLICO-107** La imagen de fondo del menú es opcional (por defecto no hay, y el menú no cambia). Se ve en las tres
  plantillas y en celular: una capa fija detrás de todo (`html.con-fondo::before`), `cover` sin deformar, sin
  `background-attachment: fixed`, con encima una capa del color de la página (`--bg`: cambia con la plantilla y con el
  tema claro u oscuro) para que el texto se lea siempre; los productos y tarjetas tienen su fondo y no se tapan. Solo se
  usa una dirección https sin comillas ni paréntesis.
- **PUBLICO-108** Junto a las opciones hay una vista previa tipo celular con el menú real (la misma de Apariencia,
  `?preview=1`), que reproduce lo que está elegido sin guardar: primero la animación de carga (`look=1` la deja ver
  unos segundos) y después la entrada del menú, con el fondo. Cada cambio de animación y el botón **Ver de nuevo** la
  repiten. La vista de Apariencia también muestra el fondo.
- **PUBLICO-109** Con `prefers-reduced-motion: reduce` el menú no se anima aunque el negocio haya elegido una
  animación: las que mueven algo viven dentro de `@media (prefers-reduced-motion: no-preference)`. No se cargan
  librerías: todo es CSS y una imagen.
- **PUBLICO-110** `public_menu` (por `build_public_menu`) entrega `animacionMenu`, `animacionCarga`,
  `animacionCargaUrl` (solo con la propia) y `fondo` (solo si hay); `menu_preview` también.

## BUSQUEDA — Buscador

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## CARRITO — Carrito de compra

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

- **CARRITO-1** En las plantillas de cara de app, la pastilla del precio de cada producto en el carrito conserva el
  ancho necesario para contener el importe y su relleno, aunque el espacio del nombre esté reducido por los
  controles de cantidad.
- **CARRITO-2** En las plantillas de cara de app, el nombre del producto en el carrito dispone de una línea propia
  por encima de los controles de cantidad, puede ocupar varias líneas y no se corta ni se parte letra por letra.
- **CARRITO-3** El carrito se guarda y se carga en `localStorage` con una clave que incluye el slug del negocio; al
  cambiar de negocio nunca se muestran ni se sobrescriben los productos del carrito de otro negocio.

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
- **SEGUIMIENTO-10** *Reemplazado en parte por SEGUIMIENTO-34.* Al confirmar un pedido guardado, el menú muestra el panel "Pedido registrado"
  y abre WhatsApp solo (en una ventana aparte en PC, SEGUIMIENTO-14; en la misma pestaña en celulares y tablets), con el mensaje ya armado ("Nuevo pedido #N" y el
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
- **SEGUIMIENTO-13** El panel "Pedido registrado" hereda los colores de la plantilla (texto, botón
  principal como el de enviar del checkout, "Cerrar" como botón secundario con borde) y se lee en
  claro y en oscuro; sus botones y el link de reenviar miden al menos 44 px de alto.
- **SEGUIMIENTO-14** En PC (puntero fino con hover y sin Android/iPhone/iPad/Mobile en el navegador),
  WhatsApp se abre en una ventana aparte y la pestaña del pedido conserva el panel; la ventana se
  abre al tocar "enviar", antes de esperar al servidor, y se cierra si el pedido no se envía. Si el
  navegador la bloquea, y en celulares y tablets, se usa la misma pestaña.
- **SEGUIMIENTO-15** `create_public_order` rechaza (`invalid_delivery` o
  `invalid_payment`, código `P0007` y `P0008`) una entrega o un pago que el
  negocio no tiene habilitado (ADMIN-CONFIG-11); sin valor se acepta, como hasta ahora.
- **SEGUIMIENTO-16** `create_public_order` rechaza (`out_of_stock`, código `P0009`) un pedido
  con un producto sin stock, solo o dentro de una promoción (ADMIN-MENU-8). El pedido manual del
  negocio no valida el stock.
- **SEGUIMIENTO-17** `create_public_order` acepta `p_scheduled_for` y lo guarda en el pedido.
  Lo rechaza con `scheduling_disabled` (`P0011`) si el negocio no acepta pedidos programados
  (ADMIN-CONFIG-16) y con `invalid_schedule` (`P0012`) si no es para hoy en hora de Argentina,
  si cae antes de ahora más la anticipación, o si no está dentro de un rango abierto (con los
  nocturnos; sin horarios cargados vale cualquier hora de hoy futura). El pedido "ahora" sigue
  exigiendo que el negocio esté abierto (SEGUIMIENTO-9), y el programado también.
- **SEGUIMIENTO-18** `public_order_tracking` entrega `programado` en el pedido y la página de
  seguimiento dice "Programado para las HH:MM" (hora de Argentina, en el idioma del cliente),
  sin dar a entender demora; la línea de tiempo no cambia.
- **SEGUIMIENTO-19** `create_public_order` acepta `p_preorder`. Lo rechaza con `preorder_closed`
  (`P0013`) si el negocio no acepta pedidos anticipados, si está abierto, si el día de su próxima
  apertura no tiene corte o si el corte ya pasó; con `p_scheduled_for` no se combina (`22023`). Un
  pedido anticipado exige que el cierre no sea temporal (`P0005`), guarda `preorder = true` y
  `scheduled_for` = el inicio de la próxima apertura. Cuando el negocio abre, el pedido normal
  funciona como siempre (SEGUIMIENTO-9).
- **SEGUIMIENTO-20** `create_public_order` con `p_payment = 'mercadopago'` rechaza (`invalid_payment`, `P0008`)
  si el negocio no tiene credenciales habilitadas (MP-1) y, si no, crea el pedido con
  `payment_status = 'awaiting'`; con cualquier otro medio queda `not_required`.
- **SEGUIMIENTO-21** `public_order_tracking` entrega `pago` (`awaiting`, `paid` o `failed`) solo en los
  pedidos con Mercado Pago y `anticipado: true` en los anticipados; nunca credenciales ni el id del pago.
- **SEGUIMIENTO-22** `public_order_tracking` entrega en cada ítem `opciones` (`grupo`, `nombre`,
  `cantidad`, `precio`) tal como quedaron guardadas en el pedido, sin ids; un ítem sin opciones no lleva
  la clave.
- **SEGUIMIENTO-23** La página de seguimiento muestra las opciones bajo cada ítem, escritas con
  `textContent`.
- **SEGUIMIENTO-24** `public_order_tracking` entrega `negocio.posicion` `{x, y}` y la cabecera del seguimiento la
  aplica con `headerPosition` (solo enteros de 0 a 100).
- **SEGUIMIENTO-25** La página muestra una línea de pasos con un ícono animado por paso, según el tipo de entrega: con
  envío (Recibido, Aceptado, Listo, En camino, Entregado) y para retirar (Recibido, Aceptado, Listo para retirar,
  Retirado); un pedido cancelado tiene su estado propio, con el motivo si lo hay.
- **SEGUIMIENTO-26** El paso actual está animado, los hechos llevan tilde y los que faltan se ven apagados; con
  `prefers-reduced-motion` no hay animación.
- **SEGUIMIENTO-27** En un pedido con envío, una tarjeta aparte dice "Buscando repartidor", "Elegí tu repartidor",
  "Lo lleva {repartidor}" (con teléfono y botón de WhatsApp) o "Lo lleva el local".
- **SEGUIMIENTO-28** Las ofertas son tarjetas con nombre, precio y el motivo si cambió el de lista, con la del favorito
  del local primero y marcada "Recomendado por el local"; "Elegir" confirma antes y manda el precio visto.
- **SEGUIMIENTO-29** Arriba de las ofertas, una cuenta regresiva "Si no elegís en m:ss, elegimos la más barata" hasta
  `cierra_en`; ya elegida, se ve el repartidor.
- **SEGUIMIENTO-30** Si el link de WhatsApp quedó guardado en este navegador, un botón claramente opcional permite
  "Enviar también por WhatsApp".
- **SEGUIMIENTO-31** "Avisarme cuando cambie" (un toque del cliente, recordado en `localStorage`): con la página abierta,
  cada cambio de estado del pedido o del envío, y cuando falta 1 minuto para la elección automática, suena, vibra y,
  con la pestaña oculta y permiso, muestra una notificación del navegador. La regla de qué cambió y qué aviso toca es
  pura y está en `lib/`.
- **SEGUIMIENTO-32** Mientras hay ofertas abiertas se consulta cada 5 segundos; con los avisos activados se sigue
  consultando con la pestaña oculta, más espaciado. Sin Supabase Realtime.
- **SEGUIMIENTO-33** Los textos nuevos están en es, en y pt y todo dato del pedido o del repartidor se pinta con
  `textContent`.
- **SEGUIMIENTO-34** *Reemplaza a SEGUIMIENTO-10 y 14 para los pedidos guardados:* el menú no abre WhatsApp solo, lleva al
  cliente al seguimiento; el pedido anticipado sin pago online conserva el panel "Pedido registrado".
- **SEGUIMIENTO-35** `public_order_tracking` entrega `pedido.entrega` (`retiro` o `delivery`): la línea de pasos dice "Listo para
  retirar" y "Retirado" solo en un pedido para retirar.
- **SEGUIMIENTO-36** `public_order_tracking` entrega `nota` en cada ítem que la tiene; el seguimiento la muestra bajo el
  ítem con `textContent`, como lo que el cliente pidió.
- **SEGUIMIENTO-37** `public_order_tracking` entrega `pedido.prep` (`desde`, `hasta`, `actualizado` y `motivo`) si el
  negocio tiene `show_prep_time` (encendido por defecto), el local cargó el tiempo ("Aceptar sin tiempo" no muestra
  nada), el pedido está en Confirmado o En preparación, no es programado ni anticipado; `desde` es `prep_ready_at` y `hasta` es `desde` + `PREP_WINDOW_MINUTES` (10). Sin eso no trae
  la clave, y nunca trae datos de otro negocio.
- **SEGUIMIENTO-38** `PREP_WINDOW_MINUTES` (10) es una sola constante: la de `admin/src/lib/orders/prep.ts` y la de
  `web/apps/tracker/lib/prep.js` valen lo mismo, y un test las compara.
- **SEGUIMIENTO-39** Con `prep`, el seguimiento dice "Listo aprox. a las 21:30" (ENVIO-169) y, antes de `hasta`, "en unos N min"
  (se renueva con la página); nunca un número negativo. Para retirar dice "Podés pasar a retirar desde las 21:30".
- **SEGUIMIENTO-40** Pasado `hasta` el seguimiento dice "Se está demorando un poco más de lo previsto", sin horas ni números.
- **SEGUIMIENTO-41** Si el local dejó un motivo (`busy`, `weather`, `supply`, `other`), se muestra como texto amable ("por
  mucho movimiento"); `other` y los desconocidos no agregan nada.
- **SEGUIMIENTO-42** Las horas del tiempo estimado salen siempre en hora de Argentina (`TIME_ZONE`), los textos están en es,
  en y pt y se pintan con `textContent`. Sin `prep` la página no muestra nada nuevo.
- **SEGUIMIENTO-43** Un pedido manual de consumo en el local (`entrega = 'local'`, sin envío) se sigue con el camino sin
  repartidor: recibido, aceptado, listo y entregado. Un pedido manual nace confirmado, así que el cliente que abre el
  link ya lo ve aceptado.
- **SEGUIMIENTO-44** Si con la página abierta cambia la hora marcada (`pedido.prep.desde`) sin que cambie el estado, el
  seguimiento muestra "El local actualizó la demora" con la hora nueva, en es, en y pt, hasta que el cliente lo cierra o
  cambia el estado. Se detecta comparando con la última lectura de la página (no hay nada guardado): la primera lectura
  y la primera vez que aparece la hora no avisan. Con los avisos activados suena y vibra igual que un cambio de estado.
- **SEGUIMIENTO-45** El seguimiento dice el resultado y no la demora en minutos: "Listo aprox. 21:40" (con envío ya
  tomado, "Llega aprox. 21:55" con la hora del repartidor) y "faltan 12 min", que se descuenta con la hora aunque no
  haya lecturas nuevas (se repinta cada 30 s con la pestaña visible). Pasada la hora dice "Unos minutos más", sin horas
  ni números negativos (con 1 minuto, "falta 1 min"). Se repinta cambiando solo el texto de esos nodos, sin rehacer la
  página, y el reloj se detiene al entregarse o cancelarse el pedido. Se actualiza solo cuando el local cambia la demora, por la lectura periódica (SEGUIMIENTO-32;
  sin Realtime, que exigiría abrir las políticas de `orders` a `anon`). En es, en y pt.
- **SEGUIMIENTO-46** Con el selector de idioma dentro del encabezado, la barra de arriba se oculta: no queda una franja
  en blanco sobre el seguimiento.
- **SEGUIMIENTO-47** Con repartidor asignado (nunca mientras se busca), el seguimiento dice "Podés pedirle a {nombre}
  también: compras en el camino · buscar otros pedidos." y el texto del repartidor, solo con lo que marcó o escribió; sin
  nada, no hay bloque. Sale de `preferencias` en `public_order_delivery`, que lee solo las del repartidor de ese pedido.
  El texto se escribe con `textContent`. En es, en y pt.
- **SEGUIMIENTO-48** Con el pedido entregado o cancelado, `preferencias` ya no se entrega: el link del seguimiento
  queda en manos del cliente y el texto que el repartidor cambie después no se tiene que ver en un pedido cerrado.
- **ADMIN-REPARTIDOR-1** Las preferencias del repartidor viven en `courier_preferences` (una fila por repartidor):
  "Compro cosas en el camino", "Busco otros pedidos" y un texto de hasta 140 caracteres, opcional. Con RLS: cada
  repartidor lee la suya y nadie escribe directo; se guardan con `courier_save_preferences`, que toma al repartidor de
  la sesión y recorta el texto.
- **ADMIN-REPARTIDOR-2** La pantalla "Mi perfil" (`/repartidor/perfil`) las edita, con botón que espera a la base
  (`PendingButton`) y botones de al menos 44 px. Un texto de más de 140 caracteres se rechaza.
- **ADMIN-REPARTIDOR-3** En la tarjeta de cada pedido del repartidor la acción principal siempre está a la vista y
  arriba: Ofertar / Tomar en los disponibles; "llego en…", En camino y Entregado (y Rendido) en los envíos en curso.
- **ADMIN-REPARTIDOR-4** Lo secundario va al abrir: Devolver, Otro precio, Retirar la oferta y Rechazar, bajo "Más
  opciones", y los productos, el barrio y las notas, bajo "Detalle del pedido". Cerrado es el estado de partida.
- **ADMIN-REPARTIDOR-5** El panel muestra primero los envíos en curso (lo que hay que hacer ahora), después los
  disponibles y al final el historial. "Mi perfil" aparece en la barra de abajo del celular y en el menú lateral.
- **ADMIN-REPARTIDOR-6** La tarjeta de un pedido entra casi entera en 360 px: línea 1 con número, local y estado; línea
  2 destacada con lo que cobra y el precio del envío, y la hora de listo; línea 3 "Retiro → Entrega" (local → barrio y
  dirección); y la acción principal. Teléfonos, WhatsApp, datos del cliente, pago y productos van en "Ver detalle",
  cerrado de partida.
- **ADMIN-REPARTIDOR-7** Lo primero en pantalla son los pedidos: sin título grande ni textos de ayuda, con el sonido
  como un botón chico y el aviso de activar notificaciones en una tira de una línea. "Mis envíos en curso" no se
  muestra si está vacío; "Disponibles" sí dice que no hay nada. El historial va plegado, una línea por pedido, salvo lo
  que sigue sin rendir, que conserva su tarjeta.
- **SEGUIMIENTO-49** El tiempo del local se ve grande, debajo del estado, en una sola línea ("Listo aprox. 13:40 ·
  faltan 25 min", o "Llega aprox." con la hora del repartidor), siempre que el local haya cargado una hora y el negocio
  tenga `show_prep_time` encendido.
- **SEGUIMIENTO-50** `show_prep_time` es `true` por defecto (migración `20261111000000`, que también lo enciende en los
  negocios existentes y en `save_business_settings` cuando la fila nace sin él). Si el local lo apaga, `public_order_tracking`
  no entrega `pedido.prep` aunque la hora esté cargada y el cliente no ve el tiempo; al volver a encenderlo, sí.
- **SEGUIMIENTO-51** La línea de la hora ("Listo aprox. 13:40 · faltan 25 min") se muestra en un tamaño de texto normal
  destacado (1 rem, negrita), sin competir con el estado del pedido.
- **SEGUIMIENTO-52** La línea de pasos suma "En preparación" entre "Aceptado" y "Listo": Recibido → Aceptado → En
  preparación → Listo → En camino → Entregado (para retirar: … → Listo para retirar → Retirado; si lo lleva el local:
  … → Listo → Entregado). El local no tiene un botón más: apenas acepta el pedido (`confirmed`), "Aceptado" queda hecho
  y "En preparación" es el paso activo, con la cuenta regresiva de la hora de listo si `show_prep_time` está prendido;
  si el local marca `preparing` a mano, cae en el mismo paso. Ícono de olla con vapor animado, que se apaga con
  `prefers-reduced-motion`. Textos en es/en/pt.
- **SEGUIMIENTO-53** Los íconos de moto y auto son `motorbike` y `car` de Tabler Icons (licencia MIT), pegados como SVG
  (no la librería), los mismos en el seguimiento, las ofertas, la tarjeta del local y el panel del repartidor.
- **ADMIN-REPARTIDOR-8** La tarjeta del pedido del repartidor, en orden: #número · local · estado, **destino** (ícono
  de ubicación, barrio y dirección de entrega en grande), retiro en {local} más chico, hora de listo, la plata en una sola
  línea chica (lo que cobra por el envío y un chip "Cobrar $X" si tiene que cobrar al cliente) y la acción principal.
  Total, desglose y lo que se rinde, solo en "Ver detalle".


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
  exige `plan_pdf` **y** `plan_completo`. `plan_completo` solo no habilita el PDF.

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
  (subdominio) exige `plan_web` **y** `plan_completo`. `plan_completo` solo no
  habilita el estático. El menú interactivo (`<slug>.smaalacarta.com.ar`) y crear
  un pedido exigen `plan_completo`: sin él, no responden.
- **ESTATICO-6** `moderno.smaalacarta.com.ar/menu.html` (también `clasico` y
  `minimal`) muestra la demo de solo lectura, sin pedir nada a Supabase: sale de
  los mismos JSON que usa el menú interactivo para las demos
  (`web/data/demos/<slug>/`), no del plan de un negocio.
- **ESTATICO-7** El menú estático muestra un producto sin stock atenuado y con la etiqueta "Sin
  stock", en las tres plantillas y en los dos temas.
- **ESTATICO-8** Bajo cada producto con opciones, el menú estático muestra un texto de solo lectura
  ("Extras: Queso +$500 · Panceta +$800 (hasta 2)"), sin carrito ni selección; los datos del negocio
  pasan por `escapeHtml`.
- **ESTATICO-9** Al tocar la foto de un producto, en el menú interactivo y en el estático, se abre
  ampliada sobre un fondo oscuro, sin ocupar el 100% de la pantalla. Se cierra con la ✕, con
  `Esc` o tocando el fondo. Lo hace `web/apps/menu-app/lightbox.js`, que ambos cargan.
- **ESTATICO-10** El menú estático aplica la posición de la imagen de cabecera como `background-position` en el
  `style` de la cabecera, con `headerPosition` (solo enteros de 0 a 100, escapado como el resto del `style`).
- **ESTATICO-11** El menú estático muestra lo mismo que el interactivo (PUBLICO-51 a 56): ilustración con su
  etiqueta "Imagen ilustrativa", o el logo, con las mismas clases y sin la lupa. Todo dato del negocio pasa por
  `escapeHtml`.
- **ESTATICO-12** El menú estático muestra en cada promoción lo mismo que el interactivo: su imagen (con la etiqueta
  si es ilustrativa), "Válida hasta el dd/mm" y "¡Últimas N!" (PUBLICO-67 a 69), con los textos escapados.
- **ESTATICO-13** El menú estático (`api/static-menu.js`) pone `Cache-Control` con `staticCacheControl`: el de siempre
  (`s-maxage=60, stale-while-revalidate=300`) y, si una promoción vence en menos de 6 minutos, `s-maxage` hasta su fin
  (entre 1 y 60 segundos) y sin `stale-while-revalidate`, para no servir una vencida.

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
  tres, es español. En el menú interactivo el idioma del navegador ya no cambia el idioma
  solo: solo lo sugiere (PUBLICO-88 a 90); el seguimiento y el menú estático siguen igual.
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
- **IDIOMA-12** El link de seguimiento que va dentro del mensaje de WhatsApp lleva `?lang=` con el
  idioma del cliente (solo `es`, `en` o `pt`, nunca repetido); el texto del mensaje sigue en español.
- **IDIOMA-13** El texto "Buscando tu pedido…" y el título de la pestaña de la página de
  seguimiento salen del diccionario, en el idioma elegido.
- **IDIOMA-14** La página de seguimiento tiene un selector ES | EN | PT (botones de al menos 44 px,
  con `aria-pressed`): cambia `?lang=` sin recargar y vuelve a dibujar sin perder el estado.
- **IDIOMA-15** Con un pedido a la vista, el selector de idioma es la primera fila del encabezado del
  negocio (a la derecha, con los colores del encabezado; en el blanco, los de siempre), con el nombre y
  "Pedido #N" centrados debajo; en los mensajes sin encabezado vuelve a la barra de arriba. Los botones se
  ven de unos 34 px y se tocan en 44 px.

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
  WhatsApp llevan un mensaje escrito, dirigido a Cristian (quien atiende), que menciona la
  tarjeta.
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
- **LANDING-17** El inicio dice lo que se vende en una frase y su botón principal
  (`.hero-cta`) abre WhatsApp, al mismo número que el resto de la página, con un mensaje
  escrito; el botón tiene contraste de al menos 4,5:1.
- **LANDING-18** El inicio no depende de una foto: sin `<img>` en el hero, sin
  `object-fit: fill` ni `transform: scale` en el hero, y sin `min-height: 100vh`; en el
  celular se ven el titular y el botón principal sin hacer scroll.
- **LANDING-19** El inicio muestra cómo funciona con un teléfono animado solo de CSS y
  decorativo (`aria-hidden`); con `prefers-reduced-motion` queda quieto.
- **LANDING-20** La landing no carga imágenes de terceros: todo `<img>` apunta al propio
  sitio.
- **LANDING-21** Lo nuevo está dicho: sin comisión, carta en español, inglés y portugués
  (en Pedidos Online) y que se instala en el celular.
- **LANDING-22** En el celular hay un botón fijo de WhatsApp abajo, que no tapa el
  contenido ni al menú ni al modal de demos; desde 768 px no se muestra.
- **LANDING-23** La landing habla como empresa: no lleva la foto ni el nombre de una
  persona, los beneficios no llevan íconos de emoji y el email de contacto es
  `smaalacarta@gmail.com` en toda la página.
- **LANDING-24** El botón "Ver Demo" del encabezado no parte su texto en dos líneas ni se
  achica (`nowrap`, `flex: none`), y en el celular el logo cede antes que el botón para
  que todo entre en una línea, con el botón separado de la hamburguesa.
- **LANDING-25** En el celular, con el botón fijo de WhatsApp a la vista, el botón de WhatsApp
  del inicio de `index.html` se oculta; en `/hola` quedan ocultos los botones de la portada y
  del cierre y solo queda el fijo. Desde 768 px se ven todos.
- **LANDING-26** En `/hola`, en el celular (hasta 639 px), el paso en curso se lee dentro del
  teléfono animado, de a uno y sincronizado con su pantalla; la lista de pasos queda solo para
  lectores de pantalla. Desde 640 px se ve la lista al costado.
- **LANDING-27** Easter egg: al tipear el código Konami (↑↑↓↓←→←→ B A; Shift o Bloq Mayús no lo cortan y las letras valen en cualquier distribución de teclado) aparece sobre la página
  el mapa de la provincia del Chaco (SVG con el contorno real de Natural Earth, dominio público; `role="dialog"`) con la frase "La sangre de mi Chaco va
  corriendo por mis venas" y suena `assets/pico-frank.mp3`. Se cierra al terminar el audio, con
  Escape o al tocar; si el audio falta o el navegador lo bloquea, se cierra solo a los 6 s. No
  se abre dos veces a la vez. El contorno se dibuja de a poco (2,6 s), después se rellena y aparece el punto de Sáenz Peña con su nombre. Con `prefers-reduced-motion` el mapa queda completo y quieto. En el celular
  (sin teclado) lo abren 7 toques seguidos al logo del encabezado, cada uno a menos de 1,5 s del
  anterior.
- **LANDING-28** `/hola` es la página del Programa Pioneros: la portada dice "Buscamos 7 locales
  pioneros" y cuántos lugares quedan; lista los beneficios (primer mes gratis, $25.000 fijos por
  12 meses, 30% menos de por vida y sin comisión por pedido); una grilla de 7 casilleros, el primero
  Ozburguer como pionero fundador y el resto "Tu local acá", sin enlaces ni imágenes; el número de
  "Quedan N lugares" es igual a los casilleros libres (se actualiza a mano); los botones de WhatsApp
  llevan el mensaje de pioneros y los metadatos hablan del programa. Sigue sin JavaScript y dentro
  de los límites de LANDING-11, 14 y 25.
- **LANDING-29** Los precios se revisan cada 4 meses y se dice en la sección de planes de
  `index.html` y en `/hola` (donde además los pioneros pagan siempre un 30% menos).
- **LANDING-30** Una dirección inexistente en `smaalacarta.com.ar` muestra `landing/404.html`: la marca, "No
  encontramos esta página" y un botón al inicio. Usa rutas absolutas porque Vercel la sirve en cualquier
  dirección; los menús (`web/`) no la usan, ahí una ruta desconocida abre el menú.

---

# Admin — `smaalacarta/admin`

## ADMIN-AUTH — Acceso y negocio actual

*Aplicado por `src/lib/get-current-business.ts`, `src/lib/auth/`, `proxy.ts`,
`app/(auth)` y las políticas de RLS en `supabase/migrations/`. Cubierto por:
`src/lib/auth/*.test.ts` (ADMIN-AUTH-4 a 8) y `src/lib/db/policies.test.ts`
(ADMIN-AUTH-1 a 3, contra Postgres real). No hay recuperación de contraseña por mail:
la restablece el superadmin (ADMIN-AUTH-16).*

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
- **ADMIN-AUTH-5** Una contraseña nueva (al cambiarla) tiene al menos 8
  caracteres y coincide con su confirmación.
- **ADMIN-AUTH-6** Después de iniciar sesión el usuario vuelve a la página del
  panel que había pedido; una dirección que no sea una ruta interna del panel se
  ignora y va a `/dashboard`.
- **ADMIN-AUTH-7** Sin sesión, las rutas del panel llevan a `/login`; con
  sesión, `/login` lleva a `/dashboard`. No hay registro
  público: las cuentas las crea el equipo de SMA a la Carta.
- **ADMIN-AUTH-8** Un usuario con sesión pero sin negocio no vuelve a `/login`:
  ve un aviso de que su cuenta no tiene negocio asignado y puede cerrar sesión.
- ~~**ADMIN-AUTH-9** Pedir recuperar la contraseña muestra el mismo mensaje
  exista o no una cuenta con ese email.~~ *Reemplazado por ADMIN-AUTH-16: no hay recuperación por mail.*
- **ADMIN-AUTH-10** Cambiar la contraseña con sesión iniciada (desde
  Configuración o, con la temporal, en `/cambiar-contrasena`) pide la
  contraseña actual y la valida contra Supabase antes de guardar la nueva; si
  no coincide, no se toca nada. La nueva tiene que ser distinta de la actual.
- ~~**ADMIN-AUTH-11** El link del mail de recuperar contraseña vuelve a
  `<origen>/admin/auth/callback?next=/restablecer`, en producción y en localhost: el basePath
  (`src/lib/base-path.ts`, el mismo que usa `next.config.ts`) se suma en un solo lugar.~~ *Reemplazado por ADMIN-AUTH-16.*
- ~~**ADMIN-AUTH-12** `/auth/callback` responde con un redirect relativo que suma el basePath (el
  navegador conserva el dominio con el que entró, p. ej. `www.smaalacarta.com.ar`, y no pasa al host
  interno del deploy): el link de recuperación sigue a `/admin/restablecer`, el de confirmar cuenta a
  `/admin/dashboard`, y uno inválido o vencido a `/admin/login?error=link`. Si el canje del `code` falla (o el link no lo trae) se loguea en el
  servidor el motivo, nunca el `code`.~~ *Reemplazado por ADMIN-AUTH-16.*
- ~~**ADMIN-AUTH-13** `/restablecer` (el destino del link del mail de recuperación) pide solo la
  contraseña nueva y su repetición, sin la actual, que quien llega ahí no recuerda: la sesión que
  abrió el link es la prueba de identidad. Valida la nueva como el cambio normal y, si la cuenta
  tenía una contraseña temporal, borra la marca `must_change_password` en el mismo paso. El cambio
  desde Configuración y `/cambiar-contrasena` siguen pidiendo la actual (ADMIN-AUTH-10).~~ *Reemplazado por ADMIN-AUTH-16.*
- ~~**ADMIN-AUTH-14** `/restablecer` y su acción solo valen con una sesión de recuperación: al canjear
  un link con `next=/restablecer`, `/auth/callback` deja una cookie `sma-recovery` httpOnly, de 15
  minutos, acotada al panel y firmada con una clave del servidor, atada al usuario. Sin esa marca (una
  sesión normal que entra a mano a `/restablecer`) se va a `/dashboard` y la acción no cambia nada; la
  marca se borra al guardar la contraseña. Sin clave en el servidor falla cerrado.~~ *Reemplazado por ADMIN-AUTH-16.*
- ~~**ADMIN-AUTH-15** Mientras la sesión tenga una marca de recuperación válida (cookie `sma-recovery`,
  ADMIN-AUTH-14) y no se haya guardado la contraseña nueva, `proxy.ts` deja al usuario solo en
  `/restablecer` y `/auth/callback` y manda cualquier otra ruta a `/restablecer` (`redirectForRoute`,
  también por encima de la contraseña temporal): con "atrás" o escribiendo `/dashboard` no queda
  logueado sin haberla cambiado. El cierre de sesión se manda desde `/restablecer` y descarta la
  marca; guardar la contraseña también la borra. Con la marca vencida o inválida no confina (flujo
  normal).~~ *Reemplazado por ADMIN-AUTH-16.*
- **ADMIN-AUTH-16** Solo el superadmin restablece contraseñas (ADMIN-SUPER-11): el panel no ofrece
  recuperarla por mail, y la pantalla de login indica pedirla al equipo de SMA a la Carta con un
  link de WhatsApp al mismo número que usa la landing.

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
  `admin`, `app`, `api`, `demo`, `moderno`, `clasico`, `minimal`, `explorar`…): serían
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
- **ADMIN-SUPER-17** `normalize_words(texto)` pasa a minúsculas, quita tildes y eñes (con `translate`, sin
  `unaccent`), deja solo letras y números separados en palabras, y singulariza las de más de 4 letras: quita la
  `s` final, y la `es` si termina en `nes` o `ches`.
- **ADMIN-SUPER-18** `default_images` guarda las ilustraciones (nombre, palabras clave, imagen https, prioridad,
  activa). Las palabras clave se normalizan al guardar (sin vacías ni repetidas). Cualquiera lee las activas; solo
  el superadmin ve las inactivas y escribe, edita o borra.
- **ADMIN-SUPER-19** El bucket `default-images` es público, admite WebP, PNG, JPG y SVG de hasta 1 MB, y solo el
  superadmin escribe en él.
- **ADMIN-SUPER-20** `suggest_default_image(nombre, categoría)` devuelve la entrada activa que mejor coincide: una
  entrada coincide si todas las palabras de alguna de sus claves están en el nombre; puntaje = palabras de la clave
  + prioridad, así que la más específica gana ("milanesa napolitana" sobre "milanesa"). La categoría es una
  segunda pasada que queda siempre por debajo del nombre. Desempata por prioridad, nombre e id. Sin coincidencia no
  devuelve nada.
- **ADMIN-SUPER-21** `/superadmin/imagenes` (solo superadmin) lista las entradas con miniatura, nombre, claves como
  chips, estado y prioridad, y permite crear, editar y borrar, subiendo la imagen al bucket `default-images`. Las
  claves se escriben separadas por coma (`parseKeywords`); `validateDefaultImage` exige nombre de hasta 80
  caracteres, al menos una clave, una dirección https y una prioridad entera de -100 a 100, y
  `validateDefaultImageFile` solo deja subir WebP, PNG, JPG o SVG de hasta 1 MB.
- **ADMIN-SUPER-22** Esa pantalla tiene un probador: dado un nombre de producto (y opcionalmente una categoría)
  muestra la imagen y la entrada que coinciden, o que no hay, usando `suggest_default_image` (una sola fuente de
  verdad).
- **ADMIN-SUPER-23** "Productos sin coincidencia" (`default_images_unmatched()`) lista los nombres de los
  productos activos, con categoría activa, de los negocios publicados y activos que no tienen imagen propia ni
  sugerida, agrupados por nombre normalizado, con la cantidad de negocios y de productos, de más a menos
  repetidos. Solo el superadmin puede pedirlo (para los demás da `42501`).
- **ADMIN-SUPER-24** Cada acción de esa pantalla comprueba que quien la pide es superadmin antes de actuar.
- **ADMIN-SUPER-25** Dos entradas de `default_images` no pueden tener el mismo nombre (sin distinguir mayúsculas
  ni espacios de los bordes): la base lo exige con un índice único sobre `lower(name)`, y la migración que lo crea
  junta antes las claves de los duplicados que ya existan en la más antigua y borra el resto.
- **ADMIN-SUPER-26** El seed ampliado (`admin/scripts/seed-default-images.mjs`) no duplica entradas: cada fila del
  script apunta a una entrada existente (por nombre o por imagen), a la que le suma las claves, o a una nueva; la
  migración que genera es idempotente (`ON CONFLICT`) y las frases de varias palabras ganan por especificidad
  ("milanesa napolitana" antes que "milanesa", "papas fritas" antes que "papa"). Toda imagen del seed existe
  en `landing/assets/defaults/`.
- **ADMIN-SUPER-27** Las imágenes predeterminadas del seed son fotos reales de uso libre (Pexels, sin
  atribución), no ilustraciones: toda dirección del propio sitio en `default_images` termina en `.jpg` y el archivo
  existe en `landing/assets/defaults/`. Las cargadas por el superadmin con otra dirección no se tocan.

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
- **ADMIN-MENU-8** Un producto puede marcarse "Sin stock" (columna `sold_out`, por defecto
  `false`), distinto de Oculto (`active`): sin stock sigue visible en el menú público pero no
  se puede pedir. Un producto nuevo nace con stock; editarlo sin indicar `sold_out` no lo toca.
- **ADMIN-MENU-9** En el panel, cada producto muestra su estado (Oculto o Sin stock, con una
  etiqueta visible; un producto activo y sin stock se distingue de uno Oculto), se alterna
  "Sin stock" con un clic y sin recargar (con actualización optimista, como Activar/Desactivar),
  el filtro del menú tiene "Sin stock" y el formulario del producto tiene su casilla.

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
  RUTAS-4 y 5): el interactivo solo con `plan_completo`; el estático solo con
  `plan_web` y el PDF solo con `plan_pdf`, y la ruta de esos dos (subdominio o
  path del dominio raíz) la decide `plan_completo`. Un test compara `menuLinks()`
  con lo que responde la base en las ocho combinaciones de planes. También muestra qué plan
  tiene el negocio (badges), de solo lectura: solo el superadmin lo cambia.
- **ADMIN-CONFIG-11** El negocio elige qué tipos de entrega ofrece (`delivery`,
  `retiro`) y qué medios de pago (`efectivo`, `transferencia`, `tarjeta`): al
  menos uno por grupo (columnas `delivery_options` y `payment_options`). Un negocio
  existente o nuevo arranca con todo habilitado. La base rechaza un grupo vacío o
  con valores fuera de esos conjuntos.
- **ADMIN-CONFIG-12** Con "transferencia" habilitada el negocio puede cargar un alias
  (6 a 20 caracteres: letras, números, punto y guion) y un CBU/CVU (22 dígitos), los dos
  opcionales. Sin "transferencia", el alias y el CBU/CVU se descartan al guardar. La
  base rechaza un alias o un CBU con otro formato.
- **ADMIN-CONFIG-13** Configuración muestra "Entrega y pago" con una casilla por opción;
  los campos de alias y CBU/CVU aparecen solo con "transferencia" tildada. Los errores
  (ningún tipo de entrega, ningún medio de pago, alias o CBU inválidos) salen en español
  junto al campo, y el alias y el CBU/CVU se normalizan (sin espacios ni guiones) antes
  de guardarse.
- **ADMIN-CONFIG-14** `save_business_settings` guarda las opciones de entrega y de pago,
  el alias y el CBU junto con el resto de Configuración, en el mismo paso atómico
  (ADMIN-CONFIG-3).
- **ADMIN-CONFIG-15** El botón "Guardar cambios" de Configuración es flotante: queda fijo en la
  esquina inferior derecha de la pantalla, afuera de las tarjetas, y "Cambios guardados" aparece
  como un toast de app, apenas arriba del borde inferior, que se va solo a los 3 segundos. Solo
  se prueba mirándolo en el navegador.
- **ADMIN-CONFIG-16** El negocio decide si acepta pedidos programados para una hora de hoy
  (`allow_scheduled_orders`, por defecto sí) y con cuántos minutos de anticipación como mínimo
  (`scheduled_lead_minutes`, por defecto 30; la base rechaza lo que no esté entre 15 y 240).
  `save_business_settings` los guarda junto con el resto, en el mismo paso atómico
  (ADMIN-CONFIG-3).
- **ADMIN-CONFIG-17** Configuración muestra "Pedidos programados" con la casilla "Permitir
  programar pedido" y los minutos de anticipación (visibles solo con la casilla tildada). La
  anticipación tiene que ser un entero de 15 a 240; si no, el error sale en español junto al campo
  (`src/lib/settings/scheduled.ts`).
- **ADMIN-CONFIG-18** El negocio decide si acepta pedidos anticipados mientras está cerrado
  (`preorders_enabled`, por defecto no) y, por cada día de venta (con rangos en `schedule`), un
  corte `{dia, hora}` en hora de Argentina (`preorder_cutoffs`, por ejemplo
  `{"sabado":{"dia":"viernes","hora":"20:00"}}`). Un día sin corte no recibe pedidos anticipados.
  La base rechaza un formato que no sea ese, y `save_business_settings` los guarda junto con el
  resto (ADMIN-CONFIG-3).
- **ADMIN-CONFIG-19** El corte de un día tiene que ser anterior a su primera apertura y no más de
  7 días antes: con el mismo día de la semana, la hora tiene que ser menor que la apertura. La
  hora es HH:MM y el corte solo se carga para días con horario (`src/lib/settings/preorders.ts`).
  Con la casilla tildada hace falta el corte de al menos un día; apagada, los cortes no bloquean
  el guardado.
- **ADMIN-CONFIG-20** Configuración muestra, junto a Horarios, "Pedidos anticipados" con la casilla
  "Aceptar pedidos anticipados" y, por cada día con horario, un selector de día de corte y la hora
  (visibles solo con la casilla tildada); los errores salen en español junto al campo. Solo se
  prueba mirándolo en el navegador.
- **ADMIN-CONFIG-21** "Mercado Pago" es un medio de pago más en "Entrega y pago" (`payment_options`
  acepta `mercadopago`). Que se ofrezca depende de las credenciales (MP-1), que no se cargan desde el panel.
- **ADMIN-CONFIG-22** Configuración muestra un índice de sus secciones, y `settingsSections(plan)`
  devuelve solo las que el plan permite, en el orden de la pantalla: Datos del negocio, Compartir y
  Contraseña siempre; Publicación, Apariencia, Horarios, Pedidos anticipados, Cierre temporal,
  Entrega y pago, Pedidos programados y Contacto con menú digital; Menú en PDF con `plan_pdf`.
- **ADMIN-CONFIG-23** El índice resalta la sección que se está viendo (`aria-current`); al tocar una
  entrada la pantalla salta a esa sección (scroll suave, o sin animación si el usuario prefiere
  menos movimiento), pone `#id` en la URL y le da el foco.
- **ADMIN-CONFIG-24** Una imagen que falló al cargar vuelve a intentarse cuando cambia su dirección:
  en `ImageUploader` y en la vista previa de la cabecera, pasar de una URL rota a una válida muestra
  la imagen.
- **ADMIN-CONFIG-25** El negocio acomoda qué parte de la imagen de cabecera se ve: `business_settings`
  guarda `header_image_x` y `header_image_y` (enteros de 0 a 100, por defecto 50 y 50 = centro);
  `save_business_settings` los recibe, y la base rechaza un valor fuera de rango.
- **ADMIN-CONFIG-26** `validateSettings` acepta `headerImageX` y `headerImageY` solo si son enteros de 0 a
  100; `normalizeFocus` deja cualquier otro valor en el rango (lo redondea y lo acota, y un valor que no
  es número vuelve a 50).
- **ADMIN-CONFIG-27** En la vista previa se mueve el punto de enfoque arrastrando la cabecera (mouse o
  dedo), con las flechas del teclado (2 puntos; 10 con Mayús) o con "Centrar"; el doble clic también
  centra. `dragFocus` mueve el punto al revés del arrastre, proporcional a lo que la imagen sobra de la
  cabecera en ese eje, y no lo mueve en un eje donde no sobra nada. Un indicador marca el punto.
- **ADMIN-CONFIG-28** La vista previa de Apariencia es el menú real: un `iframe` que carga `web/apps/menu-app` con
  `?preview=1` (PUBLICO-58 a 61, en `/apps/menu-app/index.html`) desde `MENU_ASSETS_URL`, que `NEXT_PUBLIC_MENU_ASSETS_URL` pisa en desarrollo
  (un servidor estático sobre `web/`), y que se ve en celular y en escritorio. Ya no hay un HTML aparte que
  imite las clases del menú.
- **ADMIN-CONFIG-29** Los colores de lectura (`--on-brand`, `--on-header`, `--brand-ink`, …) los calcula el
  propio menú con `brandVariables` de `web/apps/menu-app/lib/colors.js`; el panel solo manda los colores
  elegidos.
- **ADMIN-CONFIG-30** La vista previa refleja sin guardar la plantilla, el tema, los colores, la imagen de
  cabecera y su punto de enfoque, el logo, el nombre, la descripción y los horarios del formulario
  (`mergePreviewConfig`). Los datos del negocio viajan al `iframe` como datos (PUBLICO-59) y el menú los
  escribe con `escapeHtml` o `textContent`.
- **ADMIN-CONFIG-31** Apariencia tiene el interruptor "Mostrar imágenes de muestra en productos sin foto"
  (`business_settings.show_default_images`, por defecto prendido). `save_business_settings` lo recibe con valor
  por defecto `true`, así que el panel anterior no lo apaga por accidente.
- **ADMIN-CONFIG-32** En el diálogo de un producto sin imagen, el panel muestra de solo lectura qué se verá
  (`defaultImageHint`): la ilustración que sugiere `suggest_default_image`, o el logo del negocio si no hay
  coincidencia o el interruptor está apagado, con la aclaración de que subir una foto propia la reemplaza. Con
  imagen propia no muestra nada.
- **ADMIN-CONFIG-33** Configuración tiene un solo botón "Guardar cambios" (el flotante): guarda a la vez
  Datos del negocio (nombre y URL) y el resto de la configuración. "Datos del negocio" no tiene botón propio;
  "Contraseña" conserva el suyo porque es otra acción.
- **ADMIN-CONFIG-34** Al guardar se valida todo en el navegador antes de enviar nada
  (`validateBusinessProfile` y `validateSettings`): si algo es inválido no se guarda nada y cada error queda
  en su campo.
- **ADMIN-CONFIG-35** `runSave` guarda primero el perfil (si cambió) y solo si sale bien la configuración (si
  cambió). Si el perfil falla (p. ej. la URL ya la usa otro negocio), no se guarda la configuración, los
  cambios siguen marcados como sin guardar y el error queda en su campo.
- **ADMIN-CONFIG-36** Si cambió el nombre y no la URL, al tocar guardar se pregunta si regenerar la URL
  (`regenerateSuggestion`); según la respuesta se guarda con la URL actual o con la sugerida.
- **ADMIN-CONFIG-37** El guardado muestra un único aviso "Cambios guardados", y junto al botón aparece
  "Cambios sin guardar" mientras haya algo pendiente (en el perfil o en la configuración); sin cambios
  pendientes el botón está desactivado.
- **ADMIN-CONFIG-38** El índice de secciones se puede ocultar en escritorio con un botón (`aria-expanded`,
  alcanzable con teclado): oculto, el contenido ocupa todo el ancho y queda un control mínimo para volver a
  abrirlo. La elección se recuerda en `localStorage` (`useStoredFlag`); si el navegador no deja usarlo la
  pantalla funciona igual. En celular sigue la barra de chips.
- **ADMIN-CONFIG-39** La pantalla de Configuración usa menos relleno (contenedor más ancho, separaciones y
  padding de las secciones más chicos) sin cambiar el resto del panel.
- **ADMIN-CONFIG-40** En Apariencia, en escritorio, los controles van a la izquierda y una vista previa
  compacta fija (sticky) a la derecha; en celular, la vista previa compacta queda fija arriba de la sección y
  se puede colapsar (`aria-expanded`).
- **ADMIN-CONFIG-41** La vista previa compacta es el menú real en formato celular, achicado al ancho disponible y
  recortado a la parte de arriba: cabecera con el degradé o la imagen y su recorte, categorías y primer
  producto, con la plantilla, el tema y los colores elegidos.
- **ADMIN-CONFIG-42** "Ampliar" abre la misma vista en un modal grande (formatos Celular y Escritorio y cambio de
  tema) que se cierra con Esc, con el botón o tocando afuera, y que sigue reflejando los cambios en vivo;
  cerrado, esa vista no está en la página.
- **ADMIN-CONFIG-43** `menu_preview(p_business_id)` devuelve el menú del negocio con el mismo formato que
  `public_menu` (config, categorías, productos, imágenes predeterminadas, opciones y agotados) a un miembro
  del negocio o a un superadmin, aunque no esté publicado ni tenga el plan del servicio; a cualquier otro, o
  sin sesión, le da error. `public_menu` conserva su contrato y sus filtros (published, active y plan): ahora
  decide si el negocio se muestra y arma el menú con `build_public_menu(p_business_id)`, función interna que
  la app no puede llamar.
- **ADMIN-CONFIG-44** El panel le manda al `iframe` `{ type: "preview", config, menu }` (`previewPayload`) con
  `postMessage` dirigido al origen del menú: con un pequeño retraso cuando cambia el formulario y enseguida
  cuando el menú avisa `preview-ready`. Solo atiende mensajes de ese `iframe` y de ese origen. `config` es la
  guardada (`menu_preview`) con los valores del formulario encima; lo que se vació en el formulario se quita, y
  una imagen o un logo que no son https no se mandan.
- **ADMIN-CONFIG-45** El arrastre del punto de enfoque y "Centrar imagen" se superponen a la cabecera usando el
  rectángulo que informa el menú (`preview-header`), con la escala del `iframe` descontada; las flechas y el
  doble clic también sirven. Sin imagen de cabecera no hay nada que arrastrar.
- **ADMIN-CONFIG-46** El panel lee el menú con `fetchMenuPreview` (`menu_preview`, ADMIN-CONFIG-43), que nunca
  lanza: un error de la base o una respuesta que no es un menú es `{ ok: false }`. Contra un menú local, el
  `iframe` lleva `?admin=<origen del panel>` para que el menú acepte sus mensajes.
- **ADMIN-CONFIG-47** La vista previa muestra su estado: "Cargando vista previa…" mientras llega el menú o el
  `iframe` dibuja; si no se pudo leer el menú, o el menú no responde en 12 segundos, dice que no pudo
  conectar y deja reintentar; un menú sin productos avisa que solo se ve la cabecera.
- **ADMIN-CONFIG-48** Configuración tiene el interruptor "Permitir notas en cada producto" (`allow_item_notes`, activo
  por defecto), en Entrega y pago; se guarda con "Guardar cambios" y `save_business_settings` lo recibe en
  `p_allow_item_notes`.
- **ADMIN-CONFIG-49** Configuración tiene la sección "Tiempos de preparación" con el interruptor "Tus clientes ven
  a qué hora sale su pedido" (`show_prep_time`, encendido por defecto) y la aclaración de que siempre es aproximado; se
  guarda con "Guardar cambios" y `save_business_settings` lo recibe en `p_show_prep_time`.
- **ADMIN-CONFIG-50** La misma sección tiene "Tiempo de preparación por defecto" (`default_prep_minutes`, 20 por
  defecto): un entero de 5 a 180, validado en `validateSettings` y en la base; es lo que el selector de Aceptar
  ofrece si no hay sugerencia.

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
- **ADMIN-PEDIDOS-6** Un pedido es nuevo para el tablero si está Pendiente y su id no
  está entre los ya vistos; uno que ya se vio no se repite, y uno que dejó de estar
  Pendiente no cuenta.
- **ADMIN-PEDIDOS-7** Los pedidos pendientes se cuentan por estado "pending"; los
  demás estados, conocidos o no, no suman.
- **ADMIN-PEDIDOS-8** Si tras actualizarse el tablero aparecen pedidos sin atender nuevos
  mientras la alarma ya suena, suena enseguida, una sola vez; los que ya estaban al abrir el
  tablero no suenan hasta que la persona activa el sonido (ver ADMIN-PEDIDOS-26).
- **ADMIN-PEDIDOS-9** El aviso solo suena si el negocio activó el sonido con un botón
  (el navegador lo exige); la preferencia se recuerda, pero tras recargar el botón
  pide tocar de nuevo para volver a permitirlo.
- **ADMIN-PEDIDOS-10** Con el sonido activado, el tablero sigue consultando pedidos cada
  20 segundos aunque la pestaña esté oculta; sin sonido, solo con la pestaña a la vista.
- **ADMIN-PEDIDOS-11** Con el sonido activado y pedidos sin atender, el aviso suena en
  bucle (alarma, ver ADMIN-PEDIDOS-26) hasta que no quede ninguno; ya no espera 30 segundos
  entre vueltas.
- **ADMIN-PEDIDOS-12** Mientras haya N pedidos sin atender, el título de la pestaña lleva la
  cantidad ("(N) NUEVO PEDIDO", parpadeando con el título original, ver ADMIN-PEDIDOS-27; con
  `prefers-reduced-motion`, fijo en "(N) Nuevo pedido · <título original>"); cuando no queda
  ninguno, vuelve al original.
- **ADMIN-PEDIDOS-13** Con el sonido activado, el tablero pide mantener la pantalla
  encendida, lo vuelve a pedir cada vez que la pestaña vuelve a estar visible y lo
  libera al desactivar el sonido o al salir; si el navegador no lo soporta, no pasa
  nada. Debajo del botón dice "Mantené esta pantalla abierta para recibir avisos".
- **ADMIN-PEDIDOS-14** Un pedido guarda para cuándo es (`orders.scheduled_for`; vacío = lo
  antes posible). El pedido manual acepta un "Para las" opcional (hora de hoy, hora de Argentina)
  y `create_manual_order` lo guarda sin validarlo contra los horarios del negocio.
- **ADMIN-PEDIDOS-15** El tablero muestra en los pedidos programados el distintivo "Para las
  HH:MM" (hora de Argentina), ordena los Nuevos por esa hora (los "lo antes posible" van antes,
  por llegada) y la tabla de historial muestra el mismo dato (`src/lib/orders/scheduled.ts`).
- **ADMIN-PEDIDOS-16** Un pedido guarda si es anticipado (`orders.preorder`). El tablero muestra
  en los anticipados el distintivo con la fecha ("Para el sáb 10/10", hora de Argentina) en lugar
  de la hora, y ordena los Nuevos por esa fecha junto con los programados
  (`src/lib/orders/scheduled.ts`).
- **ADMIN-PEDIDOS-17** Un pedido guarda su estado de pago (`orders.payment_status`: `not_required`,
  `awaiting`, `paid`, `failed`) y el id del pago (`mp_payment_id`). El tablero y el detalle muestran
  "Esperando pago", "Pagado" o "Pago fallido" en los pedidos con Mercado Pago (`src/lib/orders/payment.ts`).
- **ADMIN-PEDIDOS-18** Mientras un pedido es con Mercado Pago y no está pagado, solo se puede cancelar:
  `set_order_status` lo exige (`P0004`), `canTransition` y `nextStatuses` lo reflejan y el botón de avanzar
  queda deshabilitado con el motivo.
- **ADMIN-PEDIDOS-19** El pedido manual no usa Mercado Pago: el diálogo no lo ofrece y el pedido queda
  `not_required`.
- **ADMIN-PEDIDOS-20** El tablero y el detalle del pedido (que también se abre desde el historial, cuya
  tabla no lista ítems) muestran las opciones elegidas bajo cada ítem (`+ Queso`, `+ Frutilla ×2`).
- **ADMIN-PEDIDOS-21** *Reemplazado por ADMIN-PEDIDOS-40 y 41: el pedido manual ahora elige productos del menú con
  sus opciones, y la base las valida como en el menú.*
- **ADMIN-PEDIDOS-22** El tablero, el detalle y el historial de pedidos muestran la nota de cada ítem destacada (en un
  recuadro) bajo el ítem, para que no pase desapercibida; también el panel del repartidor si lista el detalle.
- **ADMIN-PEDIDOS-23** `create_manual_order` acepta `note` por ítem (la limpia y recorta igual, y no depende del
  interruptor: la escribe el propio local). Las notas no cambian el RLS: el local lee las de sus pedidos y no las de
  otro negocio.

**Aviso fuerte de pedido nuevo** (`src/lib/orders/urgent-alert.ts`, `badge.ts`, `speech.ts`, `sound-pref.ts`,
`app/dashboard/orders/components/NewOrderAlert.tsx`, `src/components/dashboard/OrderAlertsBar.tsx`; los
recordatorios push son ADMIN-PWA-33 a 37)

- **ADMIN-PEDIDOS-24** Un pedido está sin atender si está Pendiente, no es manual (`source = 'manual'`) y,
  si es de Mercado Pago, no está esperando ni falló el pago. Mientras haya alguno, el tablero muestra una
  tarjeta a pantalla completa "NUEVO PEDIDO #N" con cliente, entrega, ítems y total, y los botones
  "Aceptar" (lo pasa a Confirmado, como "Confirmar") y "Ver pedidos" (la cierra hasta que llegue otro
  pedido nuevo); con varios muestra el más viejo y cuántos más hay. Desaparece sola si el pedido se atiende.
- **ADMIN-PEDIDOS-25** "Silenciar" calla la alarma y la voz durante 5 minutos y después vuelven solas; el
  título, el globito, la barra y la tarjeta siguen.
- **ADMIN-PEDIDOS-26** Con el sonido activado, mientras haya pedidos sin atender suena una alarma en bucle,
  distinta del aviso de prueba, que sube de volumen cuando el pedido más viejo lleva 60 segundos sin
  atender. Nada suena antes de que la persona active el sonido (política de autoplay del navegador).
- **ADMIN-PEDIDOS-27** Mientras suena la alarma, la voz del navegador dice "Nuevo pedido" en es-AR, ahora y
  cada 30 segundos; sin `speechSynthesis` no hace nada. El título de la pestaña parpadea entre
  "(N) NUEVO PEDIDO" y el título normal, salvo con `prefers-reduced-motion`.
- **ADMIN-PEDIDOS-28** La cantidad de pedidos sin atender se dibuja en el favicon (canvas) y, en la app
  instalada, en el ícono con `navigator.setAppBadge`/`clearAppBadge`; si el navegador no las tiene, no rompe.
  Al atenderlos o salir del tablero, el ícono vuelve al original y el globito se borra.
- **ADMIN-PEDIDOS-29** Activar el sonido desde la barra deja listo el mismo contexto de audio que usa el
  tablero: al abrir Pedidos no hay que tocar de nuevo.
- **ADMIN-PEDIDOS-30** Los negocios con pedidos por menú ven, fija arriba de cualquier pantalla del panel, una
  barra roja "No vas a oír los pedidos nuevos" mientras el sonido esté apagado (o sin habilitar tras recargar)
  o los avisos push no estén activados, con los botones "Activar el sonido" (lo guarda y lleva a Pedidos) y
  "Activar los avisos"; con los avisos bloqueados o por instalar lo dice sin botón, y sin nada que arreglar
  no se ve.
- **ADMIN-PEDIDOS-31** Aceptar un pedido pendiente que no es programado ni anticipado abre un selector con los botones
  10, 15, 20, 30 y 45 min, un campo para otro valor y "Aceptar con N min" de un solo toque, más "Aceptar sin tiempo"
  que confirma como siempre. El modal de pedido nuevo abre ese mismo selector; los pedidos programados y anticipados
  se confirman directo.
- **ADMIN-PEDIDOS-32** El valor preseleccionado es `suggested_prep_minutes` con el texto "Sugerido: N min según tus
  últimos pedidos"; sin sugerencia, el tiempo por defecto del negocio. La sugerencia se calcula en la base y se lee al
  abrir el selector.
- **ADMIN-PEDIDOS-33** Aceptar con tiempo es una sola Server Action que toma el negocio de `requireBusiness()`: confirma
  el pedido y fija el tiempo; si el pedido se confirmó pero el tiempo falló, lo dice en vez de dejarlo a medias sin aviso.
- **ADMIN-PEDIDOS-34** La tarjeta de un pedido Confirmado o En preparación con tiempo dice "Listo 21:35 (en 8 min)" en hora
  de Argentina y, pasada la hora, "Listo 21:35 (atrasado 4 min)" en alerta. Sin tiempo, la tarjeta no muestra nada nuevo.
- **ADMIN-PEDIDOS-35** "Demorar +10" fija el tiempo en lo que falta (nada si ya pasó) más 10 minutos, hasta un máximo de
  180, con motivo opcional (mucho movimiento, clima, falta de insumo, otro).
- **ADMIN-PEDIDOS-36** Las reglas puras (`src/lib/orders/prep.ts`) validan el rango de 5 a 180, calculan los minutos que
  faltan y el atraso, el tiempo de una demora y la mediana para la vista previa.
- **ADMIN-PEDIDOS-37** `set_order_prep(pedido, minutos, motivo)` solo la puede llamar un miembro del negocio del pedido,
  exige de 5 a 180 minutos, un motivo conocido o nulo y un pedido Confirmado o En preparación que no es programado ni
  anticipado; fija `prep_ready_at` en ahora + minutos, `prep_updated_at` y `prep_reason`, deja un evento
  `kind = 'prep'` (que no es un paso de la línea de tiempo) y, con el negocio suspendido, falla como todo cambio.
- **ADMIN-PEDIDOS-38** `suggested_prep_minutes(negocio)` es la mediana de lo que tardó el negocio entre Confirmado y
  Listo en sus últimos 20 pedidos que llegaron a Listo, sin contar los de más de 3 horas ni los que no pasaron tiempo; con menos
  de 5 muestras (o sin ser miembro) devuelve nulo y el selector usa el tiempo por defecto.

**Pedido manual en el circuito** (`*_pedido_manual_en_el_circuito.sql`; reemplaza a ADMIN-PEDIDOS-3 en lo que
contradiga: ahora entra a los envíos, lleva opciones y nace confirmado)

- **ADMIN-PEDIDOS-39** `create_manual_order` deja el pedido `confirmed` (no `pending`), con `source = 'manual'`,
  `payment_status = 'not_required'` y los eventos `pending` y `confirmed` en ese orden, como un pedido del menú recién
  aceptado. No le avisa al local (ADMIN-PEDIDOS-24); a los repartidores sí, si busca repartidor (ENVIO-138).
- **ADMIN-PEDIDOS-40** Los ítems del menú llegan como `{id, kind, quantity, options, note}` y el precio lo calcula la base
  con `resolve_order_lines()`, la misma que usa `create_public_order_base`: precio del producto o la promoción, extras
  de las opciones, stock (P0009), producto de otro negocio o inactivo (P0001) y opciones obligatorias (P0014). Un
  `unit_price` que mande el navegador junto a un `id` se ignora.
- **ADMIN-PEDIDOS-41** La cantidad del pedido manual va de 1 a 99 (la del menú sigue de 1 a 20) y la nota por ítem la
  escribe el propio local: no depende de `allow_item_notes`.
- **ADMIN-PEDIDOS-42** Un producto libre es `{name, unit_price, quantity, note}` sin `id` (nombre de 1 a 100
  caracteres, precio de 0 a 9.999.999,99). Se guarda con `order_items.free = true`, sin producto ni promoción; el
  menú nunca acepta ítems libres. La migración marca como libres los ítems tipeados de los pedidos manuales anteriores.
- **ADMIN-PEDIDOS-43** La entrega del pedido manual es `retiro`, `delivery` o `local` (consumo en el local, solo
  manual): `retiro` y `delivery` tienen que estar en `delivery_options` del negocio (P0007) y `local` siempre vale.
  Es obligatoria; ya no hay texto libre.
- **ADMIN-PEDIDOS-44** El pago del pedido manual es uno de `payment_options` del negocio, sin `mercadopago`, o `qr`
  ("QR / billetera virtual", solo manual: el menú lo rechaza con P0008 y `business_settings` no lo admite). Otro valor
  da P0008. Es obligatorio. `qr` solo registra cómo pagó: no genera ningún código.
- **ADMIN-PEDIDOS-45** El teléfono es obligatorio con `delivery` (de 8 a 15 dígitos, P0018), con o sin repartidores en el
  negocio; en `retiro` y `local` es opcional, y si se carga tiene que ser válido. Se guarda solo con dígitos.
- **ADMIN-PEDIDOS-46** Solo un miembro del negocio puede cargarlo (42501, también sin sesión) y un pedido rechazado no deja
  nada guardado.
- **ADMIN-PEDIDOS-47** El diálogo "Pedido manual" va por pasos, en pantalla completa en el celular: Productos, Entrega,
  Cliente y Pago. El menú sale de `menu_preview` (productos y promociones activos con sus grupos de opciones, el mismo
  formato del menú público), con buscador sin tildes ni mayúsculas. Cada producto abre una hoja con sus opciones
  (obligatorias, máximos, repetidas y agotadas como en el menú), la nota y la cantidad; "Producto libre" pide nombre y
  precio. El mismo producto con la misma elección y nota es una sola línea. Lo que viaja a la base son ids, opciones
  y cantidades: nunca precios (`toRpcItems`).
- **ADMIN-PEDIDOS-48** Al crearlo, el diálogo muestra el número y "Mandar seguimiento por WhatsApp": abre
  `api.whatsapp.com/send` al teléfono del cliente con el link `https://<slug>.smaalacarta.com.ar/pedido/<código>`. Con
  "Buscar repartidor" el texto le dice que entre para elegir quién se lo lleva. Sin teléfono se muestra el link para
  copiar. El tablero se actualiza al crearlo y el diálogo sigue abierto con el seguimiento hasta "Listo".
- **ADMIN-PEDIDOS-49** El detalle del pedido (tablero e historial), el panel del repartidor, el aviso de pedido sin atender
  y los avisos push muestran la entrega y el pago con su nombre (`src/lib/orders/labels.ts`): "Consumo en el local", "QR
  / billetera virtual", etc.; un valor que no se conoce (texto libre de un pedido manual anterior) se muestra tal cual.
- **ADMIN-PEDIDOS-50** Las reglas puras viven en `src/lib/orders/`: `manual-order.ts` (validación, total, líneas),
  `manual-menu.ts` (menú, buscador y reglas de opciones), `manual-context.ts` (barrios y favorito) y
  `manual-followup.ts` (mensaje y link de WhatsApp). La acción toma el negocio de `requireBusiness()` y vuelve a
  validar con `courier = business.courier_delivery`.

**Aceptar una sola vez y cambiar la demora** (sin migración; reemplaza a ADMIN-PEDIDOS-35 en lo que contradiga)

- **ADMIN-PEDIDOS-51** Todo botón que espera a la base (`PendingButton`, usado en el panel del local y en el del
  repartidor) queda gris, con spinner y su texto en gerundio ("Aceptando…", "Retirando…") hasta que vuelve la respuesta,
  y un segundo toque no hace nada; si falla, vuelve a estar activo y el error se muestra. El pedido pasa de `pending` a
  `confirmed` una sola vez: `acceptOrderAction` sobre un pedido que ya no está pendiente devuelve `ok` sin confirmar
  ni fijar el tiempo de nuevo, también si dos pedidos de aceptar llegan juntos (el segundo recibe P0004 de la base y
  vuelve a leer el estado). El tablero tampoco lanza dos cambios a la vez.
- **ADMIN-PEDIDOS-52** En un pedido aceptado, "Cambiar demora" reemplaza a "Demorar +10": botones −5, +5, +10, +15 y +30
  que suman o restan a lo que falta (`adjustPrepAction`, con la hora que guarda la base; el resultado queda entre 5 y 180
  minutos, bajar de más deja 5), un "Otro valor…" que abre el selector para escribir los minutos y un motivo opcional.
  Un salto que no es de la lista se rechaza. El selector de Aceptar arranca con el último tiempo que usó el local en ese
  navegador ("Último que usaste: N min"), después con la sugerencia de la base y, si no, con el tiempo por defecto.
- **ADMIN-PEDIDOS-53** La tarjeta del tablero tiene una estructura fija: arriba `#número · nombre`, hace cuánto llegó y
  el reloj de la demora; una cinta de cinco tramos (Nuevo, Aceptado, Cocina, Listo, Entrega) que marca el paso
  (`stepIndex`, `src/lib/orders/urgency.ts`); los productos en dos líneas como máximo con "y N más…"; y un pie con el
  botón principal a todo el ancho y "Detalle" (⋯). Tocar la tarjeta también abre el detalle. El teléfono y, buscando
  repartidor, el resumen de ofertas siguen en la tarjeta (ENVIO-117 y el teléfono de cualquier pedido).
- **ADMIN-PEDIDOS-54** Dentro de cada columna, lo que pide atención va primero (`orderUrgency` y `compareByUrgency`):
  alta (borde rojo) si el pedido pasó la hora de la demora o lleva 10 minutos buscando repartidor sin ofertas; media
  (borde ámbar) si faltan 5 minutos o menos para la demora o un pendiente espera hace 5 minutos o más. A igual
  urgencia, el orden de siempre. El título de cada columna dice cuántos son urgentes. En el celular las tres
  columnas son pestañas (Nuevos, En curso, Listos) con su contador.
- **ADMIN-PEDIDOS-55** "Cambiar demora" ya no estira la tarjeta: el reloj de la demora (o ⋯) abre un panel superpuesto
  con los saltos, los motivos opcionales y "Otro valor…". Al elegir un salto se aplica y el panel se cierra solo;
  también cierran la ✕, tocar fuera y Escape. Los botones son los de espera de ADMIN-PEDIDOS-51.
- **ADMIN-PEDIDOS-56** El menú lateral de escritorio se achica a solo íconos con el nombre en el tooltip, y el contenido
  usa todo el ancho. La elección se recuerda en el navegador (`localStorage`, con `try/catch`, `src/lib/layout/sidebar-pref.ts`).
  En el celular sigue la hamburguesa.
  Achicado, el nombre de cada ícono se ve escrito debajo de él (no como tooltip: un ícono solo no dice qué es), el
  enlace lleva `aria-label` con los pendientes, y el menú pasa de 4 a 5 rem de ancho.
- **ADMIN-PEDIDOS-57** Todo cambio de estado lleva el estado que la persona veía (`from`; `p_from` en
  `set_order_status` y `courier_set_status`, migración `20261112000000`) y solo se aplica si el pedido sigue ahí: si no,
  la base no hace nada, no registra evento y no da error. Un doble click, dos pestañas o Realtime nunca avanzan dos pasos.
  Aceptar manda `from = pending`. En el panel del repartidor, un segundo toque sobre el mismo pedido no lanza otra acción.
- **ADMIN-PEDIDOS-58** Al confirmar la aceptación (con tiempo o sin él), el cartel de "Nuevo pedido" y la cuenta de sin
  atender se van en el momento, sin esperar al servidor; si la acción falla, vuelven y se muestra el error.


## MP — Cobro con Mercado Pago (Checkout Pro)

*Aplicado por `supabase/migrations/*_mercadopago.sql`, `src/lib/mp/`, `app/api/mp/` y, en `web/`,
`apps/menu-app/lib/mercadopago.js` y `apps/tracker`. Cubierto por `src/lib/db/mercadopago.test.ts`
(contra Postgres real), `src/lib/mp/*.test.ts` y los tests de `web/`. Guía de puesta en marcha:
[MERCADOPAGO.md](MERCADOPAGO.md).*

- **MP-1** Las credenciales de cada negocio viven en `payment_credentials` (token de acceso, secreto del
  webhook, `enabled`), con RLS activo y sin políticas: ni `anon` ni `authenticated` la leen ni escriben;
  solo la clave de servicio. Se cargan a mano en SQL; no hay pantalla para dueños.
- **MP-2** `confirm_order_payment(pedido, id de pago, estado, monto)` solo la ejecuta `service_role`. Con
  `paid` marca el pedido pagado, guarda el id del pago y registra un evento, pero no confirma si el monto
  no coincide con `orders.total`. Con `failed` marca el pago fallido. Es idempotente y un pago `paid` nunca
  vuelve a `failed`.
- **MP-3** `POST /admin/api/mp/create` recibe solo el código del pedido, exige que sea con Mercado Pago, que
  esté en `awaiting` o `failed` y que el negocio tenga credenciales habilitadas, y crea la preferencia con
  los ítems de `order_items` (el precio sale del servidor), `external_reference` = id del pedido,
  `back_urls` a `https://<slug>.smaalacarta.com.ar/pedido/<código>`, `auto_return` `approved` y
  `notification_url` con `?b=<business_id>`. Devuelve solo `init_point`.
- **MP-4** `POST /admin/api/mp/webhook?b=` valida la firma `x-signature` con el secreto de ese negocio antes
  de hacer nada (firma inválida: 401); luego consulta el pago a la API de Mercado Pago, comprueba que su
  `external_reference` sea un pedido de ese negocio y llama a `confirm_order_payment` con el monto de la API
  (`approved` → `paid`, `rejected` o `cancelled` → `failed`, los demás se ignoran). Responde 200 rápido y no
  confía en el redirect de vuelta.
- **MP-4b** Un pago que Mercado Pago no encuentra (404) se ignora con 200; los demás fallos de consulta
  responden 5xx para que reintente.
- **MP-5** `GET /admin/api/mp/verify?code=` busca en Mercado Pago los pagos del pedido
  (`external_reference`) y confirma si hay uno aprobado; no consulta más de una vez cada pocos segundos por
  pedido. Devuelve solo el estado de pago.
- **MP-6** Los endpoints responden a CORS solo para `https://*.smaalacarta.com.ar` (y `localhost` fuera de
  producción); cualquier otro origen no recibe `Access-Control-Allow-Origin`.
- **MP-7** El token y el secreto de un negocio nunca salen de la base ni aparecen en una respuesta, un log o
  un mensaje de error.
- **MP-8** Los ítems de la preferencia de pago salen de `order_items` (su `unit_price` ya incluye los
  extras) y llevan las opciones elegidas en el título; la suma de la preferencia coincide con
  `orders.total`.

### Conexión por OAuth (PR 1: conectar y desconectar)

*Aplicado por `supabase/migrations/*_mercadopago_oauth.sql`, `src/lib/mp/crypto.ts`, `src/lib/mp/oauth.ts` y
`app/api/mp/oauth/`. Cubierto por `src/lib/db/mp-oauth.test.ts`, `src/lib/mp/crypto.test.ts`,
`src/lib/mp/oauth.test.ts` y `app/api/mp/oauth/routes.test.ts`. Todavía no se cobra con la conexión: eso es el
PR 2 (más abajo). Guía: [MERCADOPAGO.md](MERCADOPAGO.md).*

- **MP-9** Solo el dueño del negocio (`business_users.role = 'owner'`; un `staff` no) conecta o desconecta su
  cuenta de Mercado Pago; `start` y `disconnect` solo aceptan POST y, si el encabezado `Origin` viene, tiene
  que ser el del sitio.
- **MP-10** `start` guarda un `state` aleatorio de 32 bytes del que solo queda el hash SHA-256, atado al
  negocio y al usuario que lo pidió; vence a los 10 minutos, se usa una sola vez (el callback lo marca usado en
  la misma operación que lo valida) y `start` frena a un negocio que lo pide sin pausa.
- **MP-11** La autorización usa PKCE con `S256`: el `code_verifier` queda cifrado en la base y se manda recién
  al canjear el código; un `state` inexistente, usado, vencido o de otro usuario no canjea nada.
- **MP-12** El `access_token` y el `refresh_token` se guardan cifrados con AES-256-GCM (clave del entorno con
  su versión, IV aleatorio y el `business_id` como dato asociado); `payment_connections` y `mp_oauth_states` tienen
  RLS sin políticas y sin permisos para `anon` y `authenticated`: solo la clave de servicio las toca.
- **MP-13** El callback comprueba con la API de Mercado Pago que la cuenta es la del token y es de Argentina
  (`MLA`); una cuenta ya conectada a otro negocio se rechaza sin tocar nada (una conexión revocada libera la cuenta),
  y conectar otra vez en el mismo negocio reemplaza la conexión anterior.
- **MP-14** Desconectar borra los tokens y deja la conexión en `revoked`; no llama a Mercado Pago (el negocio
  puede revocar desde su cuenta).
- **MP-15** Conectar exige `MP_OAUTH_ENABLED` en `"true"` y `businesses.mp_oauth_enabled` del negocio; si
  cualquiera está apagado, `start` y `callback` responden un 404 genérico (`disconnect` no depende de los
  interruptores: el negocio siempre puede sacar sus tokens), y el dueño no puede prender el interruptor de
  su negocio (solo un superadmin o la clave de servicio).
- **MP-16** Ningún secreto (`code`, tokens, `client_secret`, `state`, `code_verifier`) aparece en una URL, un
  log, una respuesta ni un mensaje de error; de un fallo de Mercado Pago solo se registra el código HTTP.
- **MP-17** La vuelta del callback siempre es al origen público fijo (`https://www.smaalacarta.com.ar`) más
  `/admin`, nunca al host ni al `basePath` de la request: detrás del rewrite de `landing/` la request llega
  con el host del deploy directo de `admin/` y con el `basePath` vacío. Vale también para el redirect de error.

### Cobro con la conexión por OAuth (PR 2: cobrar)

*Aplicado por `supabase/migrations/*_mercadopago_oauth_cobro.sql`, `src/lib/mp/credentials.ts`, `src/lib/mp/deps.ts`
y `src/lib/mp/service.ts`. Cubierto por `src/lib/mp/credentials.test.ts`, `src/lib/mp/service.test.ts`,
`src/lib/mp/flujo-oauth.test.ts` y `src/lib/db/mp-oauth-cobro.test.ts`. Las credenciales manuales
(`payment_credentials`, MP-1) siguen funcionando igual. Guía: [MERCADOPAGO.md](MERCADOPAGO.md).*

- **MP-18** Con una conexión en `connected`, `/create`, `/verify` y `/webhook` usan su token (descifrado solo
  en el servidor) y `mp_user_id`; sin conexión `connected`, usan `payment_credentials` como antes. Cobrar con
  una conexión no depende de `MP_OAUTH_ENABLED` ni de `businesses.mp_oauth_enabled`: esos interruptores solo
  gobiernan conectar (MP-15). Si el token no se puede descifrar, esa conexión no se usa, no se cobra
  (`not_configured`) y no se cae a otra fuente; solo se registra el motivo, sin valores.
- **MP-19** Antes de usar el token, si `expires_at` vence en menos de 30 días (o ya venció), se renueva con
  `grant_type=refresh_token`. La respuesta tiene que traer `access_token`, `refresh_token` y `expires_in` y, si
  trae `user_id`, ser el de la conexión; si no, no se guarda nada. El token y el refresh nuevos se guardan
  cifrados en una sola operación.
- **MP-20** El `refresh_token` no se gasta dos veces: la renovación la hace quien toma un arriendo
  atómico (`refreshing_until`, de 30 segundos, con `UPDATE … WHERE … RETURNING`). Quien pierde la carrera relee la
  fila y usa el token que dejó el otro; si el token actual todavía no venció lo usa sin esperar, y si venció
  espera unos segundos acotados y, si no aparece uno nuevo, no cobra (`not_configured`) sin marcar la conexión.
- **MP-21** `needs_reconnect` lo marca únicamente un rechazo del `refresh_token`: la respuesta de Mercado Pago
  trae `error = invalid_grant`, y antes de marcar se relee la fila por si otro ya lo renovó. Cualquier otra cosa
  (`invalid_client` por un `client_secret` equivocado o rotado, `invalid_request`, un 400 o 401 sin código, red,
  5xx, tiempo agotado o perder la carrera) se trata como un problema de configuración o pasajero: no marca
  nada, se usa el token vigente si lo hay y solo se registra el código. Del error de Mercado Pago solo se
  conserva el campo `error` y solo si es uno de `invalid_grant`, `invalid_client`, `invalid_request`,
  `unauthorized_client` o `invalid_scope`; nunca el cuerpo ni el mensaje. No hay cron en esta etapa: se renueva
  al usarlo.
- **MP-22** Con la conexión en `needs_reconnect` (y sin credenciales manuales habilitadas) `/create` responde
  409 `not_configured`; `/verify` y `/webhook` no consultan a Mercado Pago con ese token y no fallan (el
  webhook con firma válida responde 200 `ignored`).
- **MP-23** `business_has_mp(business_id)` (interna, sin permisos para `anon` ni `authenticated`) es verdadera
  con credenciales manuales habilitadas o con una conexión `connected`; el menú público (`pagos`) y
  `create_public_order` (P0008) la usan en lugar de mirar `payment_credentials`. La opción exige además que
  el negocio tenga `mercadopago` en `payment_options`. Parada de emergencia de un negocio:
  `UPDATE payment_connections SET status = 'needs_reconnect'`.
- **MP-24** Para un negocio con conexión `connected`, el webhook valida la firma `x-signature` con
  `MP_OAUTH_WEBHOOK_SECRET` (leída al llamar) y, si no valida, con el secreto de `payment_credentials` si existe
  (un aviso viejo de antes de conectar). Si ninguna valida: 401, y antes de cualquier otra cosa.
- **MP-25** Con una conexión, el `collector_id` del pago consultado a la API tiene que ser igual al
  `mp_user_id` de la conexión; si no coincide o no viene, el aviso se ignora (200 `ignored`) y solo se registra
  "collector distinto". El resto sigue como MP-4: se consulta el pago con el token del negocio, ARS, pedido del
  negocio con Mercado Pago y monto de la API.
- **MP-26** Ningún token, `client_secret` ni clave de webhook aparece en una respuesta, un log o un mensaje de
  error del cobro (MP-7, MP-16).

## ENVIO — Envío con Repartos al Toque

*Aplicado por `supabase/migrations/*_envio_repartos_al_toque.sql` y `src/lib/orders/status.ts`. Cubierto
por `src/lib/db/delivery.test.ts` y `status.test.ts`. Esta etapa es solo la base de datos: el menú, el
panel del local y el del repartidor vienen después. `couriers` y `courier_zones` son tablas globales
(sin `business_id`): hay un solo repartidor y no hay precios distintos según el local.*

- **ENVIO-1** Repartos al Toque (`couriers`) arranca con sus 39 barrios y precios, que pasaron a ser zonas de la
  plataforma (`delivery_zones`, por `sort_order`, ENVIO-46). *Reemplazado en parte por ENVIO-45: ya puede haber
  varios repartidores activos.*
- **ENVIO-2** Solo un superadmin habilita el envío con el repartidor en un negocio (`businesses.courier_delivery`,
  falso por defecto); el dueño del negocio no puede cambiarlo.
- **ENVIO-3** Un usuario repartidor (`courier_users`) ve su repartidor y su fila; ya no edita barrios ni precios
  (ENVIO-46) y no se agrega solo como repartidor.
- **ENVIO-4** Un miembro de un negocio con `courier_delivery` lee los repartidores activos que cubren alguna de
  sus zonas (ENVIO-49); uno de un negocio sin envío y un visitante no leen nada de eso.
- **ENVIO-5** `create_public_order` con entrega `delivery` en un negocio con `courier_delivery` exige barrio activo,
  marcado por el local y cubierto por un repartidor activo (`P0016`, ENVIO-54) y dirección de 5 a 200 caracteres (`22023`).
  El teléfono (de 8 a 15 dígitos) se exige en todos los pedidos, con o sin envío (`P0018`, ENVIO-70).
- **ENVIO-6** *El estado inicial es `searching` desde ENVIO-95.* El pedido guarda barrio (id y nombre), el precio de lista y el precio final (iguales al crearse),
  teléfono (solo dígitos), dirección y `courier_status = 'waiting'`, sin repartidor (ENVIO-59); el navegador no
  manda el precio. Si algo falla no queda ningún pedido.
- **ENVIO-7** Un barrio en un negocio sin `courier_delivery`, o con una entrega que no es `delivery`, se rechaza
  (`P0016`). Un pedido sin envío queda sin repartidor y sigue su camino de siempre.
- **ENVIO-8** *Reemplazado por ENVIO-60 y ENVIO-69: ya no hace falta el OK del repartidor para confirmar (se retira
  `P0015`).* Antes: un pedido con envío no salía de Pendiente hasta que el envío estaba aceptado.
- **ENVIO-9** Un pedido con envío pasa por Pendiente, Confirmado, En preparación, Listo y Entregado al repartidor
  (`handed_to_courier`), y de ahí el repartidor lo lleva a En camino (`on_the_way`) y Entregado. El local no puede
  pasarlo a `on_the_way` ni a `delivered` (`P0004`); `canTransition` y `nextStatuses` reflejan las mismas reglas.
- **ENVIO-10** Un pedido sin envío no admite `handed_to_courier` ni `on_the_way` (`P0004`). Cancelar se puede
  siempre, salvo un pedido terminado.
- **ENVIO-11** *Reemplazado por ENVIO-63, 65 y 67: `set_order_courier` se borra.* Antes registraba la consulta y la
  respuesta del repartidor.
- **ENVIO-12** Cambiar el precio final del envío exige un motivo y guarda quién y cuándo; el precio de lista no
  cambia (hoy lo hace `courier_take_order`, ENVIO-64).
- **ENVIO-13** Cada cambio del envío deja un evento `kind = 'delivery'` con una nota legible; esos eventos no
  aparecen en la línea de tiempo pública (`public_order_tracking`).
- **ENVIO-14** `courier_set_status` solo la llama el repartidor del pedido y solo hace
  `handed_to_courier → on_the_way → delivered`, con su evento de estado y quién lo hizo.
- **ENVIO-15** `courier_orders` solo la llama el usuario repartidor y devuelve sus pedidos, los más nuevos
  primero, con negocio, cliente (nombre, teléfono, dirección), total del local, ítems y datos del envío.
- **ENVIO-16** `public_delivery_zones(slug)` devuelve los barrios con precio solo si el negocio está publicado,
  activo, con plan completo y `courier_delivery`, y algún repartidor activo cubre alguna de sus zonas; si no,
  `null`. Qué barrios, en ENVIO-51; que ya no trae repartidor, en ENVIO-75.
- **ENVIO-17** `public_order_delivery(code)` devuelve repartidor (si ya hay), barrio, precio de lista, precio, motivo
  del cambio, estado y nota del envío; nunca teléfono ni dirección del cliente (ENVIO-75).
- **ENVIO-44** El WhatsApp del repartidor es público una vez que lo tomó: `public_order_delivery` lo devuelve en
  `whatsapp` (y, si no hay uno cargado, la clave no va) y el seguimiento lo muestra con un link "Escribir a
  {repartidor}" cuando el envío está aceptado. *Ya no sale en `public_delivery_zones` ni en el mensaje de WhatsApp al
  local (ENVIO-75, ENVIO-88).*
- **ENVIO-18** El superadmin habilita o deshabilita el envío con Repartos al Toque por negocio desde su ficha
  (`updateCourierDeliveryAction`: exige superadmin y cambia solo `businesses.courier_delivery`).
- **ENVIO-19** El listado `/superadmin` marca con "Envío con Repartos al Toque" los negocios que lo tienen.
- **ENVIO-20** El checkout del menú interactivo pide barrio, dirección y teléfono (obligatorios) solo con entrega
  `delivery` y barrios disponibles (`lib/delivery-zones.js`, `public_delivery_zones`); debajo muestra el aviso con
  el precio del barrio elegido ("Envío a {barrio}: $…, lo hace Repartos al Toque, se paga al repartidor, no está
  incluido en el total"). Si los barrios fallan o vienen `null`, el checkout queda como antes.
- **ENVIO-21** `createOrder` manda `p_delivery_zone`, `p_customer_phone` y `p_delivery_address` solo cuando vienen
  (nunca un precio) y traduce `P0015` y `P0016` al motivo `invalid_zone`, que vuelve a pedir los barrios.
- **ENVIO-22** El mensaje de WhatsApp al local suma barrio, "Envío: $X (se paga al repartidor)", dirección y
  teléfono, siempre en español (IDIOMA-5); los textos nuevos de la interfaz están en es, en y pt y todo dato del
  negocio o del repartidor se pinta con `textContent`.
- **ENVIO-23** `src/lib/orders/courier.ts` arma el mensaje de WhatsApp a Repartos al Toque (local, número de pedido,
  barrio, dirección, nombre y teléfono del cliente, hora de listo, total del pedido, pago, precio final del envío y
  link de seguimiento) y su link (`api.whatsapp.com`, solo dígitos, 549 a un número argentino de 10 dígitos); sin
  WhatsApp cargado no hay link. La hora de listo sugerida es la del pedido programado o 20 minutos desde ahora.
- **ENVIO-24** *Reemplazado por ENVIO-80 a 83: se sacan "Pedir envío", "Volver a pedir", "Repartidor aceptó" y "No
  puede".*
- **ENVIO-25** *Reemplazado por ENVIO-82: el aviso de 10 minutos cuenta desde `offered_at` (la búsqueda abierta).*
- **ENVIO-26** La tarjeta y el detalle de un pedido con envío muestran barrio, estado del envío y precio (con el de
  lista y el motivo si cambió. Tras Listo, el paso del local es "Entregar al repartidor" (solo con el envío
  aceptado, ENVIO-84); En camino y Entregado se ven pero no son botones del local. *Confirmar ya no se bloquea por el
  envío (ENVIO-60).*
- **ENVIO-27** En el tablero, `handed_to_courier` y `on_the_way` van en la columna Listos, y pasan al historial al
  quedar `delivered`.
- **ENVIO-28** El seguimiento muestra los estados `handed_to_courier` ("Entregado al repartidor") y `on_the_way`
  ("En camino") en la línea de tiempo y, en un pedido con envío, un camino de siete pasos; "Listo" con envío no dice
  que pase a buscarlo. Los textos nuevos están en es, en y pt.
- **ENVIO-29** El seguimiento pide además `public_order_delivery` y muestra un bloque de envío según `estado`
  (ENVIO-91 y 92). Un error de esa consulta no borra el último envío visto; un pedido cancelado no lo muestra; todo
  con `textContent`, sin teléfono ni dirección.
- **ENVIO-30** `/repartidor` exige sesión como `/dashboard` y `/superadmin`; un usuario sin negocio que es el usuario
  repartidor (`my_courier_id()`) va a `/repartidor` en lugar de `/sin-negocio`, y quien no lo es vuelve a su panel
  (`courierAccess`). La contraseña temporal y `/cambiar-contrasena` funcionan igual que en cualquier cuenta.
- **ENVIO-31** `/repartidor` muestra los pedidos en grupos (`src/lib/courier/panel.ts`); desde la etapa 2 son
  Disponibles, Mis envíos en curso e Historial (ENVIO-76). Cada pedido lleva el local (nombre, dirección y WhatsApp), número y hora (y hora
  programada), cliente (nombre, teléfono con `tel:` y WhatsApp, dirección), barrio, precio de lista y final con el
  motivo, total del local y pago, productos con opciones y la nota del envío.
- **ENVIO-32** En `handed_to_courier` solo En camino y en `on_the_way` solo Entregado (`courier_set_status`).
  Aceptado antes de la entrega del local, terminado o rechazado: ninguna acción. Tomar, Rechazar y Devolver, en
  ENVIO-77.
- **ENVIO-33** El panel se refresca solo (`router.refresh()` cada 15 s) y avisa con sonido, y en el título de la
  pestaña, los pedidos nuevos por responder, con el mismo `alerts.ts` y `sound.ts` del tablero del local (el criterio
  de "pendiente" es un parámetro).
- **ENVIO-34** Las acciones de `/repartidor` empiezan por `requireCourier()` y nunca reciben un id de repartidor del
  navegador: lo toman de la sesión; la base comprueba de quién es cada pedido y cada barrio.
- **ENVIO-35** El menú del repartidor tiene Pedidos y Barrios y precios, y "Salir"; el panel usa la paleta del admin.
- **ENVIO-36** `/repartidor/zonas` permite alta, edición de nombre y precio, activar o desactivar, borrar con
  confirmación y ordenar arrastrando los barrios de su repartidor. Un precio nuevo vale para los pedidos nuevos: los
  hechos conservan su precio de lista.
- **ENVIO-37** `src/lib/courier/zones.ts` valida el barrio: nombre de 1 a 60 caracteres y único (sin mirar
  mayúsculas), precio de 0 en adelante ("4500", "4.500" o "4500,50").
- **ENVIO-38** En un pedido con envío pagado en efectivo, el repartidor cobra el pedido y el envío: lo del pedido
  (`orders.total`, sin el envío) lo rinde al local y el envío es suyo. Con otro medio de pago no hay nada que rendir.
  Solo se rinde un pedido ya entregado.
- **ENVIO-39** La rendición se marca pedido por pedido en dos pasos: `courier_mark_settled` (solo el repartidor del
  pedido: exige efectivo, entregado y sin marcar, si no `P0004`) y después `business_confirm_settlement` (solo un
  miembro del negocio: exige que el repartidor ya la haya marcado y que no esté confirmada, si no `P0004`). Cada marca
  guarda hora y quién, y deja un evento `delivery` ("Rendido al local: $X" / "Rendición recibida"). Las marcas son
  fijas: no se repiten ni se deshacen.
- **ENVIO-40** Las cuatro columnas (`settled_at`, `settled_by`, `settlement_received_at`, `settlement_received_by`) no se
  cambian por UPDATE directo (un trigger lo bloquea con `42501`): solo las dos funciones. `courier_orders()` las
  entrega en `rendicion`.
- **ENVIO-41** El mensaje de consulta al repartidor dice cuánto cobrar: en efectivo, "Cobrar al cliente: $pedido +
  $envío = $total (rendir $pedido al local)"; con otro medio, "Pagado con {medio}: cobrar solo el envío $envío".
  El panel del repartidor muestra lo mismo en cada pedido.
- **ENVIO-42** `src/lib/courier/settlements.ts` calcula el estado de la rendición (`none`, `to_settle`, `settled`,
  `received`), el botón que corresponde y los totales por local (pendiente de rendir, rendido sin confirmar y
  recibido) a partir de los pedidos de `courier_orders()`. `/repartidor` suma la pestaña Rendiciones y el botón
  Rendido (con confirmación) en cada pedido entregado en efectivo.
- **ENVIO-43** El panel del local muestra el estado de la rendición en la tarjeta y el detalle del pedido y, cuando
  el repartidor ya la marcó, el botón Recibido (con confirmación). `/dashboard/orders` resume lo pendiente de rendir
  y lo ya rendido de los pedidos que muestra el historial.

### Varios repartidores, etapa 1: repartidores y zonas (ENVIO-45 a 58)

*Aplicado por `supabase/migrations/20261021000000_varios_repartidores_zonas.sql`. Cubierto por
`src/lib/db/zones.test.ts` (base) y los tests de `src/lib/courier/`, `src/lib/settings/` y
`app/superadmin/`. Esta etapa prepara datos y pantallas: el circuito del pedido no cambia, y el pedido
sigue naciendo con un repartidor asignado (la TRANSICIÓN de ENVIO-54; la etapa 2 la reemplaza).*

- **ENVIO-45** Puede haber varios repartidores activos (se retira `couriers_one_active_idx`). La migración copia
  `courier_zones` a `delivery_zones` con los mismos `id` (los pedidos siguen apuntando a su zona), da a cada
  repartidor la cobertura de las zonas activas que ya tenía, marca todas las zonas activas en los negocios con
  `courier_delivery` y borra `courier_zones`.
- **ENVIO-46** `delivery_zones` es global: `name` de 1 a 60 y único, `price` desde 0, `sort_order`, `active`. La lee
  cualquier usuario con sesión (no un visitante); alta, cambio y baja, solo el superadmin. El repartidor ya no edita
  precios: los ajusta al aceptar un pedido (ENVIO-12).
- **ENVIO-47** `courier_zone_coverage` (repartidor, zona) dice qué zonas cubre cada repartidor. Es global, como
  `couriers`: cada repartidor ve, agrega y borra solo las suyas (`my_courier_id()`) y el superadmin todas; un local y
  un visitante no la leen.
- **ENVIO-48** `business_delivery_zones` (negocio, zona) dice a qué zonas envía cada local. Sus miembros ven, agregan
  y borran las de su negocio; el superadmin todas; otro negocio, un repartidor y un visitante, ninguna.
- **ENVIO-49** `couriers` solo lo escribe el superadmin. Un repartidor ve su fila; un miembro de un negocio con
  `courier_delivery` ve nombre y WhatsApp de los repartidores **activos** que cubren alguna de sus zonas
  (`courier_covers_my_zones`).
- **ENVIO-50** `create_courier_with_user(nombre, whatsapp, usuario)` crea el repartidor y su `courier_users` en una
  sola transacción y solo la llama un superadmin (`42501` si no). `courier_users` sigue sin políticas de escritura.
- **ENVIO-51** `zonas` de `public_delivery_zones(slug)` son las activas que el local marcó y que cubre al menos un
  repartidor activo, con el precio de referencia. Si no queda ninguna, `null`. *Desde la etapa 2 ya no trae
  `repartidor` ni `whatsapp` (ENVIO-75).*
- **ENVIO-52** *Los minutos para el favorito se quitaron en ENVIO-112.* `business_settings` gana `favorite_courier_id` (nulo = sin favorito; en la etapa 2 el pedido va a
  todos) y `favorite_minutes` (de 1 a 60, 5 por defecto). `set_courier_preferences(favorito, minutos)` los guarda
  con los permisos de quien llama: el favorito tiene que estar activo y cubrir al menos una zona del local
  (`P0017`), los minutos van de 1 a 60 (`22023`) y el negocio tiene que tener `courier_delivery` (`42501`). Un
  UPDATE directo de un miembro tampoco salta la validación del favorito.
- **ENVIO-53** `save_delivery_preferences(zonas, favorito, minutos)` guarda las zonas del local y el favorito en una
  sola transacción (el favorito se valida contra las zonas nuevas; si algo falla no queda nada a medias; una zona
  inexistente o de baja da `22023`). `business_delivery_options()` entrega a la pantalla las zonas activas (con
  `selected` y `covered`), los repartidores activos con las zonas que cubren, el favorito y los minutos.
- **ENVIO-54** `create_public_order` solo acepta una zona activa, marcada por el local y cubierta por un repartidor
  activo (`P0016`). *La TRANSICIÓN de la etapa 1 (el pedido nacía con el favorito o Repartos al Toque, y
  `my_delivery_courier()`) la reemplaza la búsqueda de la etapa 2: ENVIO-59.*
- **ENVIO-55** `/superadmin/repartidores` lista los repartidores (nombre, WhatsApp, activo, cuántas zonas cubre) y da
  de alta una cuenta con nombre, WhatsApp y email: crea el usuario con contraseña temporal, el repartidor y su
  usuario, y muestra las credenciales una sola vez. El email no puede ser de una cuenta que ya existe. La ficha
  edita nombre, WhatsApp y activo, y restablece la contraseña. Todo exige superadmin antes de usar la clave de
  servicio (`createCourierWithAccount`, con dependencias inyectadas).
- **ENVIO-56** `/superadmin/zonas` es el ABM de `delivery_zones`: alta, nombre y precio, activar o desactivar, borrar
  con confirmación y ordenar arrastrando. Una zona que ya usan pedidos no se borra: se desactiva y la pantalla lo
  avisa. Las validaciones son las de `src/lib/courier/zones.ts`.
- **ENVIO-57** `/repartidor/zonas` ("Mis zonas") lista las zonas activas con su precio de referencia y una casilla
  "La llevo" que guarda al tocar sobre `courier_zone_coverage`. No se editan nombres ni precios. El precio se
  rotula "Precio de referencia" y aclara que se puede cambiar al aceptar un pedido.
- **ENVIO-58** Configuración → Envíos (solo con `courier_delivery`): casillas de las zonas a las que envía el local
  (una zona sin repartidor muestra "Sin repartidor por ahora"), repartidor favorito (solo entre los que cubren alguna
  zona marcada, o "Sin favorito") y minutos para el favorito (5 por defecto, visibles solo con favorito). Se guarda
  con "Guardar cambios", junto al resto, con `save_delivery_preferences`.

### Varios repartidores, etapa 2: el circuito nuevo (ENVIO-59 a 92)

*Aplicado por `supabase/migrations/20261022000000_busqueda_de_repartidor.sql`. Cubierto por
`src/lib/db/offers.test.ts` y `delivery.test.ts` (base), `src/lib/courier/panel.test.ts`,
`src/lib/orders/courier.test.ts`, `web/apps/menu-app` y `web/apps/tracker`. Reglas del dueño (Herni): el
local confirma cuando quiere y ahí se abre la búsqueda de repartidor; primero lo ve solo el favorito, después
todos los que cubren la zona; el primero que toca Tomar se lo queda; si nadie lo toma, el local lo asigna o lo
lleva él. Errores nuevos: `P0018` (teléfono del cliente) y `P0019` (ya lo tomó otro o no está disponible).
`P0015` ya no existe en este circuito.*

- **ENVIO-59** Un pedido con envío nace con `courier_id` nulo y `courier_status = 'waiting'` ("todavía no
  confirmado"). `courier_status` admite además `searching` (búsqueda abierta) y `self` (lo lleva el local); se
  mantienen `requested` y `rejected` para los pedidos viejos. `orders` gana `offered_at`, `offer_favorite_id` y
  `offer_favorite_until`.
- **ENVIO-60** *Reemplazado por ENVIO-95: la búsqueda se abre al crear el pedido, no al confirmarlo.* Cuando un pedido con envío sale de Pendiente (confirmado, o salta directo a otro estado) la base abre
  la búsqueda: `courier_status = 'searching'`, `offered_at = now()` y, si el local tiene un favorito activo que
  cubre la zona del pedido, `offer_favorite_id` y `offer_favorite_until = now() + favorite_minutes`. Lo hace un
  trigger, así vale para `set_order_status` y para un UPDATE directo. Confirmar ya no depende del repartidor. Si el
  pedido se cancela mientras se busca, la búsqueda se cierra (vuelve a `waiting`, sin `offered_at`). Un pedido sin
  envío no abre nada. Los pedidos manuales nacen Pendientes y sin envío con repartidor.
- **ENVIO-61** *Reemplazado por ENVIO-112: ya no hay ventana exclusiva del favorito; su oferta va primero.* La ventana del favorito se calcula con la hora (`courier_sees_order`): un pedido buscando se ve si
  `offer_favorite_until` es nulo, ya pasó, o el repartidor es `offer_favorite_id`. Sin favorito, o con un favorito que
  no cubre la zona, no hay ventana. El favorito queda copiado en el pedido: cambiarlo después no lo altera.
- **ENVIO-62** *Cambia en ENVIO-101: sin ventana, y con las ofertas.* `courier_available_orders()` lista los pedidos en `searching`, activos, de una zona que el repartidor
  cubre, que no rechazó ni devolvió y que están fuera de la ventana del favorito o son de su ventana. Un repartidor
  dado de baja no ve nada. Se ordenan por `offered_at`. Solo la llama un repartidor.
- **ENVIO-63** *Reemplazado por ENVIO-98: el repartidor ya no toma, oferta.* `courier_take_order(pedido, precio, motivo, nota)` es un solo UPDATE condicional: el primero que toca
  Tomar se lo queda (`courier_id`, `accepted`, `courier_responded_at`, nota de hasta 120). Si no lo ve (ya lo tomó
  otro, no existe, no cubre la zona, está en la ventana de otro o se canceló), `P0019` y no cambia nada.
- **ENVIO-64** *Reemplazado por ENVIO-98 y 103: el precio y el motivo van en la oferta.* Al tomarlo puede ajustar el precio final: distinto del actual exige motivo (de 1 a 200) y guarda
  quién y cuándo; el precio de lista no cambia (`22023` si falta o el precio no es válido). Deja eventos `delivery`
  ("Envío tomado por {repartidor}…" y "Precio del envío: $a → $b (motivo)") que el seguimiento público no muestra.
- **ENVIO-65** `courier_decline_order(pedido)` deja una fila `rejected` en `courier_order_declines`: ese pedido
  deja de verse y de poder tomarse para ese repartidor, y sigue para los demás. Si no le era visible, `P0019`.
- **ENVIO-66** *Cambia en ENVIO-107: las ofertas de los demás siguen valiendo.* `courier_return_order(pedido, motivo)`: solo el repartidor asignado (`P0002` si no), solo antes de
  `handed_to_courier` (`P0004`), con motivo obligatorio de hasta 200 (`22023`). El pedido vuelve a `searching` con
  `courier_id` nulo, `offered_at = now()`, sin ventana del favorito, con el precio de lista y sin nota; guarda
  `returned` con el motivo (quien lo devolvió no lo vuelve a ver) y un evento `delivery`.
- **ENVIO-67** `business_assign_courier(pedido, repartidor, nota)`: un miembro del negocio del pedido (si no,
  `P0002`), con el pedido en `searching` (`P0004`) y un repartidor activo que cubre la zona (`22023`). Queda
  `accepted` y con evento. Vale durante toda la búsqueda, también dentro de la ventana del favorito.
- **ENVIO-68** `business_self_delivery(pedido)`: un miembro, con el pedido en `searching`; pasa a `self`, con evento.
  El pedido sigue el camino sin repartidor: el local lo entrega (`ready` → `delivered`).
- **ENVIO-69** `handed_to_courier` solo con `courier_status = 'accepted'` y `courier_id` no nulo (`P0004`), tanto en
  `set_order_status` como por UPDATE directo. Con el envío en `waiting` o `searching` el local no puede pasarlo a
  `delivered` (`P0004`): primero lo asigna o lo lleva él. Un miembro no cambia por UPDATE directo `courier_id`,
  `courier_status`, `courier_note`, `courier_responded_at`, `offered_at` ni `offer_favorite_*` (`42501`): solo las
  funciones del circuito.
- **ENVIO-70** `create_public_order` exige `p_customer_phone` (de 8 a 15 dígitos, solo se guardan los dígitos) en
  todos los pedidos, con o sin envío (`P0018`). Un negocio que no existe sigue dando `P0002`.
- **ENVIO-71** Antes de tomarlo el repartidor ve el local (nombre y dirección), número, `ofrecido_el`, hora
  programada, zona, precio de referencia, total y medio de pago; **no** el nombre, teléfono ni dirección del
  cliente, ni notas ni productos. Esos datos los recibe en `courier_orders()` recién cuando lo toma. `courier_orders()`
  sigue trayendo los pedidos viejos sin rendir.
- **ENVIO-72** Solo el repartidor llama a `courier_available_orders`, `courier_take_order`, `courier_decline_order`
  y `courier_return_order` (`42501`; sin sesión, rechazado). Un repartidor no lee `orders` directo.
- **ENVIO-73** `courier_order_declines` (pedido, repartidor, `rejected` o `returned`, motivo, hora; PK pedido +
  repartidor) no tiene escritura directa. El repartidor ve las suyas; los miembros, las de pedidos de su negocio;
  otro negocio y un visitante, ninguna.
- **ENVIO-74** La migración convierte los pedidos abiertos de la etapa 1 que esperaban el OK de un repartidor
  (`waiting`, `requested` o `rejected`, no entregados ni cancelados): quedan sin repartidor y en `waiting` (los que
  ya pasaron de Pendiente, en `searching`). Los `accepted` y los terminados no se tocan.
- **ENVIO-75** `public_delivery_zones` devuelve solo `zonas` (sin `repartidor` ni `whatsapp`). `public_order_delivery`
  usa `LEFT JOIN` a `couriers` y devuelve los estados `waiting`, `searching`, `accepted` (con nombre y WhatsApp del
  repartidor) y `self`, y los viejos tal cual; un pedido sin envío, `null`. Nunca teléfono ni dirección del cliente.
- **ENVIO-76** `/repartidor` agrupa en Disponibles (`courier_available_orders()`), Mis envíos en curso (los que tomó
  y siguen abiertos) e Historial (`src/lib/courier/panel.ts`); los viejos `waiting`/`requested` sin repartidor
  asignado no aparecen. Rendiciones queda como antes.
- **ENVIO-77** *Reemplazado por ENVIO-113 a 115: Ofertar, Cambiar y Retirar en lugar de Tomar.* En Disponibles, cada pedido tiene Tomar (nota opcional y precio final; si cambia, motivo
  obligatorio) y Rechazar (con confirmación). Si al tomarlo ya lo tenía otro (`P0019`), muestra "Lo tomó otro
  repartidor" y el pedido desaparece. En Mis envíos, Devolver (con motivo, solo antes de que el local lo entregue),
  En camino y Entregado como hasta ahora.
- **ENVIO-78** El sonido y el título de la pestaña avisan cuando aparece un pedido nuevo en Disponibles; `isToRespond`
  y `useNewOrderAlert` se generalizaron (el criterio de "pendiente" es un parámetro), no se duplicaron.
- **ENVIO-79** Las acciones de `/repartidor` (`takeOrderAction`, `declineOrderAction`, `returnOrderAction`) empiezan
  por `requireCourier()` y nunca reciben un id de repartidor; traducen `P0019` al motivo `taken`.
- **ENVIO-80** *Cambia en ENVIO-117 (búsqueda desde que se crea el pedido, sin ventana del favorito).* `CourierSection` (panel del local) muestra según `courier_status`: `waiting`, "Al confirmar se busca
  repartidor"; `searching`, "Buscando repartidor desde las HH:MM" y, durante la ventana, "Lo ve solo {favorito}
  hasta las HH:MM"; `accepted`, "Lo tomó {nombre}" con botón de WhatsApp a ese repartidor, precio de lista y final
  con el motivo; `self`, "Lo llevás vos".
- **ENVIO-81** Con `searching`, el local tiene **Asignar a mano** (un select con los repartidores activos que cubren
  la zona del pedido, nota opcional) y **Lo llevo yo**, disponibles durante toda la búsqueda
  (`assignCourierAction`, `selfDeliveryAction`).
- **ENVIO-82** *Reemplazado por ENVIO-118: "Nadie ofertó todavía".* A los 10 minutos de `offered_at`, la tarjeta y el detalle destacan "Nadie lo tomó todavía"; las dos
  acciones de ENVIO-81 no cambian, solo se destacan.
- **ENVIO-83** Se sacan del panel "Pedir envío", "Volver a pedir", "Repartidor aceptó" y "No puede", con
  `setOrderCourierAction`, `courierRequestMessage`, `courierWhatsappLink` y el aviso de falta de respuesta.
- **ENVIO-84** Confirmar no se bloquea por el envío. "Entregar al repartidor" solo aparece con el envío `accepted`;
  con `self` el local entrega él.
- **ENVIO-85** El teléfono del cliente se ve en la tarjeta y en el detalle de **todos** los pedidos, con link `tel:` y
  de WhatsApp.
- **ENVIO-86** En Configuración → Envíos, el select de favorito solo ofrece los repartidores que cubren alguna de las
  zonas tildadas en pantalla (sin guardar todavía).
- **ENVIO-87** El checkout del menú pide siempre el teléfono del cliente (obligatorio), con o sin envío; `createOrder`
  lo manda siempre y va en el mensaje de WhatsApp al local. `P0018` vuelve como motivo `invalid_phone`.
- **ENVIO-88** `lib/delivery-zones.js`: `repartidor` y `whatsapp` son opcionales en `normalizeZones`. El aviso del
  envío queda "Envío: $…, se paga al repartidor", sin nombre ni teléfono, y el mensaje de WhatsApp al local no
  agrega el teléfono del repartidor.
- **ENVIO-89** Los textos nuevos del menú y del seguimiento están en es, en y pt; el mensaje de WhatsApp al local
  sigue en español.
- **ENVIO-90** *(reservado)*
- **ENVIO-91** El seguimiento muestra el bloque de envío según `estado`: `waiting`, nada nuevo; `searching`,
  "Buscando repartidor"; `accepted`, "Lo lleva {repartidor}" con su teléfono, el botón para escribirle, la nota, el
  precio y, si cambió, "Precio de lista {precio_lista} · {motivo}" (ENVIO-125); `self`, "Lo lleva el local".
- **ENVIO-92** Los estados viejos (`requested`, `rejected`) o desconocidos no rompen la página: se muestran como
  "Buscando repartidor" o no muestran el bloque, sin error.
- **ENVIO-93** El menú lateral del superadmin lista, después de "Nuevo negocio" y antes de "Imágenes",
  **Repartidores** (`/superadmin/repartidores`) y **Zonas** (`/superadmin/zonas`).
- **ENVIO-94** El link activo es el de la ruta más específica: `/superadmin/repartidores/nuevo` y
  `/superadmin/repartidores/<id>` marcan Repartidores; `/superadmin` y `/superadmin/negocios/<id>` marcan Negocios;
  `/superadmin/negocios/nuevo` marca Nuevo negocio. Cubierto por `src/lib/layout/nav-active.test.ts`.

### Varios repartidores, etapa 2b: el cliente elige entre ofertas (ENVIO-95 a 120)

*Aplicado por `supabase/migrations/20261023000000_ofertas_de_repartidor.sql`. Cubierto por
`src/lib/db/courier-offers.test.ts` (base), `src/lib/courier/panel.test.ts`, `src/lib/orders/courier.test.ts`,
`app/repartidor`, `app/dashboard/orders`, `web/apps/menu-app` y `web/apps/tracker`. Reglas del dueño (Herni):
desde que se crea el pedido los repartidores que cubren la zona ofertan; el cliente elige desde su
seguimiento (el favorito del local va primero); si no elige, a los 5 minutos de la primera oferta se elige
sola la más barata; en paralelo el local acepta la comanda. Errores nuevos: `P0020` (el pedido ya no
recibe ofertas), `P0021` (falta el motivo del precio) y `P0022` (la oferta cambió). `P0019` ya no se usa.*

- **ENVIO-95** *Reemplazado en parte por ENVIO-121: los anticipados y programados nacen `waiting` y se ofrecen al
  confirmar.* Un pedido con envío nace sin repartidor y con `courier_status = 'searching'` y `offered_at = now()`:
  no hay que esperar a que el local lo confirme, y ningún trigger abre la búsqueda. La migración pasa a
  `searching` los pedidos abiertos que estaban en `waiting`.
- **ENVIO-96** `courier_offers` guarda una oferta por pedido y repartidor (única; se borra con el pedido):
  `price` desde 0, `reason` de 3 a 140 caracteres y `closed_at` (nulo = abierta).
- **ENVIO-97** Un repartidor lee solo sus ofertas, un miembro las de pedidos de su negocio y el superadmin todas; otro
  negocio, otro repartidor y un visitante, ninguna. Nadie escribe directo: solo las funciones.
- **ENVIO-98** `courier_make_offer(pedido, precio, motivo)` crea o cambia la oferta propia. Con un precio distinto del de
  lista exige motivo de 3 a 140 caracteres (`P0021`); con el de lista no guarda motivo; un precio negativo o
  desmedido da `22023`.
- **ENVIO-99** No puede ofertar (`P0020`, sin cambiar nada) un repartidor que no cubre la zona, está dado de baja, ya
  rechazó o devolvió ese pedido, ni sobre un pedido que ya tiene repartidor, está cancelado, entregado, lo lleva el
  local o es de Mercado Pago sin pagar.
- **ENVIO-100** `courier_withdraw_offer(pedido)` retira la propia mientras el cliente no eligió; después, `P0020`.
- **ENVIO-101** `courier_available_orders()` lista los pedidos buscando de las zonas del repartidor, sin los que
  rechazó o devolvió, con `ofertas` (cuántas, sin nombres ni precios de los demás), `mi_oferta` y el precio de lista;
  sin datos del cliente. Suma, por unos minutos, los pedidos donde su oferta se cerró, con `resultado`
  (`chosen_other`, `cancelled` o `closed`).
- **ENVIO-102** `courier_decline_order` oculta el pedido para ese repartidor y retira su oferta; `courier_take_order`
  ya no existe.
- **ENVIO-103** `public_choose_courier(código, oferta[, precio])`, sin sesión, en un solo UPDATE condicional: el pedido
  queda con `courier_id`, `delivery_fee` = precio de la oferta, `delivery_fee_reason` = su motivo y
  `courier_status = 'accepted'`, y las ofertas abiertas se cierran.
- **ENVIO-104** No elige con el código de otro pedido ni con una oferta de otro pedido o ya cerrada (`P0020`); si el
  repartidor cambió el precio que el cliente estaba mirando, `P0022`; un código inválido o inexistente, `P0002`. Dos
  elecciones a la vez: gana una y la otra da `P0020`.
- **ENVIO-105** `settle_courier_offers(pedido)`: pasados 5 minutos desde la primera oferta, y si el pedido sigue
  buscando, elige la oferta más barata; a igual precio, la del favorito del local; después, la más vieja. Solo cuenta a
  repartidores activos. Es idempotente y no usa ningún proceso programado.
- **ENVIO-106** Se resuelve de forma perezosa antes de leer: `public_order_delivery`, `courier_available_orders`,
  `settle_due_courier_offers` y `business_order_offers`; también antes de ofertar, retirar o elegir, así una oferta
  tardía no cambia lo ya elegido. Los 5 minutos están solo en `courier_offers_window()`.
- **ENVIO-107** `courier_return_order` vuelve el pedido a `searching`, borra la oferta de quien lo devolvió (que no puede
  volver a ofertar), reabre las de los demás (siguen valiendo) y la cuenta de 5 minutos arranca de nuevo desde la
  devolución.
- **ENVIO-108** Cuando el pedido pasa a `cancelled`, sus ofertas abiertas se cierran sin borrarse (el repartidor ve
  "Cancelado por el local").
- **ENVIO-109** `business_assign_courier` y `business_self_delivery` siguen funcionando durante la búsqueda y cierran
  las ofertas abiertas.
- **ENVIO-110** `public_order_delivery` suma, mientras busca, `ofertas` (id, repartidor, precio, motivo y `favorito`,
  con el favorito primero y después por precio y antigüedad) y `cierra_en` (cuándo se elige sola). El WhatsApp del
  repartidor es solo del elegido; nunca el teléfono ni la dirección del cliente.
- **ENVIO-111** `business_order_offers()` entrega al local, por pedido que busca, las ofertas con nombre y precio y
  `cierra_en`; solo de los pedidos de su negocio.
- **ENVIO-112** Se borran `orders.offer_favorite_id`, `orders.offer_favorite_until` y
  `business_settings.favorite_minutes`: `set_courier_preferences(favorito)` y `save_delivery_preferences(zonas,
  favorito)` ya no reciben minutos. `favorite_courier_id` queda para ordenar y desempatar.
- **ENVIO-113** En Disponibles de `/repartidor`, cada pedido muestra barrio, local, precio de lista, hora (programada o
  de creación) y "N ofertas", con el botón Ofertar y el precio de lista ya cargado; si lo cambia, pide el motivo.
- **ENVIO-114** Con oferta hecha: "Tu oferta: $X, esperando al cliente", con Cambiar y Retirar. Rechazar sigue.
- **ENVIO-115** Cuando lo eligen, el pedido pasa a Mis envíos en curso (ahí recién ve los datos del cliente). Si
  eligieron a otro: "El cliente eligió otro repartidor"; si se canceló: "Cancelado por el local". Esos avisos
  desaparecen solos pasados unos minutos.
- **ENVIO-116** Suena un aviso cuando entra un pedido nuevo a Disponibles y otro, distinto, cuando lo eligen.
- **ENVIO-117** En un pedido con envío buscando, el local ve "Esperando ofertas" o "N ofertas, el cliente está
  eligiendo (se elige sola en m:ss)", con nombres y precios. Asignar a mano y Lo llevo yo siguen disponibles.
- **ENVIO-118** A los 10 minutos de abierta la búsqueda sin ninguna oferta, la tarjeta y el detalle destacan "Nadie
  ofertó todavía".
- **ENVIO-119** Configuración → Envíos ya no pide minutos para el favorito; dice que su oferta le aparece primero al
  cliente, marcada "Recomendado por el local".
- **ENVIO-120** El menú, al confirmar un pedido que se guardó en el sistema, va directo al seguimiento y guarda el link de
  WhatsApp con `rememberHandoff` para ofrecerlo ahí; si no se pudo guardar, sigue solo por WhatsApp.
- **ENVIO-121** Un pedido con envío con `preorder = true` o `scheduled_for` no nulo nace `courier_status = 'waiting'`,
  sin `offered_at`: no se ofrece al crearse. Un pedido común sigue naciendo `searching` (ENVIO-95).
- **ENVIO-122** Cuando el local lo saca de pendiente sin cancelarlo (confirmado, o salta a otro estado), el pedido
  `waiting` pasa a `searching` con `offered_at = now()` (trigger `orders_open_courier_search_on_confirm`). Cancelarlo no
  abre la búsqueda. Mientras está `waiting`, `courier_available_orders` no lo muestra y `courier_make_offer` da
  `P0020`. Los 5 minutos de la elección automática cuentan desde la primera oferta, también sin seguimiento.
- **ENVIO-123** El panel del local, en un pedido pendiente `waiting`, dice "Se ofrece a los repartidores cuando lo
  confirmes".
- **ENVIO-124** La migración pasa a `waiting` los pedidos anticipados o programados que estaban `searching`, siguen
  pendientes y no tienen ofertas.
- **ENVIO-125** La oferta con precio distinto al de lista dice "Precio de lista {precio} · {motivo}" (sin motivo, solo
  "Precio de lista {precio}") en el seguimiento (es, en y pt) y en el panel del local. *Reemplaza el "Antes {precio}:
  {motivo}" de ENVIO-91 y SEGUIMIENTO-28.*
- **ENVIO-126** El título del panel del repartidor es el nombre del repartidor que entró, y "Repartidor" si no tiene.
- **ENVIO-127** Los textos del superadmin y del tablero ya no nombran a un solo repartidor: "Envío con repartidores"
  (habilitado y deshabilitado) y "Rendiciones de repartidores". Si el resumen de rendiciones junta pedidos de más de un
  repartidor, muestra un renglón por cada uno con su nombre ("Repartidor" si no se lo puede leer).
- **ENVIO-128** Cuando un negocio pasa a `courier_delivery = true` (o nace con eso) y no tiene ninguna fila en
  `business_delivery_zones`, la base le carga todas las zonas activas (trigger en `businesses`: vale para la pantalla
  del superadmin, para SQL o para lo que venga). Si ya tenía zonas tildadas, no las toca.
- **ENVIO-129** La migración `*_envio_listo_al_activar.sql` carga todas las zonas activas a los negocios que ya tenían
  `courier_delivery = true` y cero zonas.
- **ENVIO-130** `default_courier_id()` es el único lugar con el id de Repartos al Toque.
  `effective_favorite_courier(negocio)` devuelve `business_settings.favorite_courier_id` y, si es nulo (o el negocio
  no tiene fila de ajustes), Repartos al Toque mientras esté activo; si no, nulo. No escribe en `favorite_courier_id`.
- **ENVIO-131** En `public_order_delivery` y `business_order_offers` la marca `favorito` y el orden usan el favorito
  efectivo: sin favorito elegido, la oferta de Repartos al Toque sale primera y marcada "Recomendado por el local".
- **ENVIO-132** El desempate a igual precio de `settle_courier_offers` (y por lo tanto el de `run_order_timers`) usa el
  favorito efectivo.
- **ENVIO-133** Con otro favorito elegido vale el del local. Con Repartos al Toque inactivo y sin favorito elegido, no
  hay favorito.
- **ENVIO-134** `business_delivery_options` entrega `default_courier` (`{id, name}` de Repartos al Toque si está
  activo, o nulo). Configuración → Envíos muestra, sin favorito elegido, "Sin elegir: se recomienda {nombre}" (sin
  nombre, "Sin elegir"); el nombre sale de ese dato.
- **ENVIO-135** Si el local tiene el envío activo y ninguna zona tildada, Configuración → Envíos muestra arriba de la
  sección: "Todavía no elegiste a qué zonas enviás: tus clientes no ven el envío".
- **ENVIO-136** El detalle del negocio en el superadmin, junto a "Envío con repartidores", dice cuántas zonas tiene
  tildadas el local ("39 zonas", "1 zona", "Sin zonas").
- **ENVIO-137** El pedido manual con `delivery` en un negocio con `courier_delivery` lleva barrio (`p_delivery_zone`: activo,
  tildado por el local y cubierto por algún repartidor activo; si no, P0016), dirección de 5 a 200 caracteres y modo
  (`p_courier_mode`: `favorite`, `offers` o `self`; sin él, 22023). Guarda el barrio, el precio de lista y el precio del
  envío igual que el menú.
- **ENVIO-138** Con `offers` el pedido nace `confirmed` y `searching` con `offered_at = now()`: lo ven los repartidores que
  cubren el barrio, ofertan y el cliente elige desde el seguimiento (o a los 5 minutos se elige sola la más barata), como
  cualquier pedido. El webhook de avisos lo trata como un pedido ofertable nuevo.
- **ENVIO-139** Con `favorite` el pedido va directo al favorito efectivo (`effective_favorite_courier`, ENVIO-130): nace
  `accepted` con ese `courier_id` y `courier_responded_at`, sin ofertas, y deja el evento de envío "Envío asignado a
  {nombre}, HH:MM". Si el favorito no está activo o no cubre el barrio, P0016.
- **ENVIO-140** Con `self` el pedido nace `self` (lo lleva el local, sin repartidor) y deja el evento "Lo lleva el local,
  HH:MM". No se ofrece a nadie.
- **ENVIO-141** `delivery` en un negocio sin `courier_delivery` no lleva barrio (P0016 si lo manda) ni circuito: el
  pedido queda sin `courier_status`, con teléfono obligatorio y la dirección si la cargaron.
- **ENVIO-142** El aviso `courier_chosen` también sale cuando el pedido nace ya asignado (INSERT con `courier_status =
  'accepted'` y `courier_id`): el favorito al que el local asignó un pedido manual recibe "te asignó un envío". Un
  pedido manual `self` no avisa a nadie.
- **ENVIO-143** El diálogo del pedido manual ofrece los barrios que el local tildó y algún repartidor cubre, con su precio
  de referencia (aparte del total), y "Asignar a {favorito}" solo si el favorito efectivo (`manualDeliveryContext`)
  cubre el barrio elegido; "Buscar repartidor" y "Lo llevo yo" siempre. Al cambiar de barrio se desmarca un favorito
  que ya no lo cubre. El modo se elige explícitamente: no hay uno por defecto.
- **ENVIO-144** Las acciones del repartidor que cambian algo (ofertar, cambiar la oferta, retirar, rechazar, devolver,
  rendido, En camino y Entregado) usan el botón con espera de ADMIN-PEDIDOS-51: grises, con spinner y en gerundio
  ("Ofertando…", "Retirando…", "Rechazando…", "Devolviendo…"), y no se pueden tocar dos veces. Los diálogos de
  confirmación quedan abiertos hasta que vuelve la respuesta.
- **ENVIO-145** El superadmin elige para toda la plataforma el **modo de envíos**: `fixed` (precio fijo: toma el primero
  que llega) u `offers` (ofertas, como ENVIO-95 en adelante). Vive en `platform_settings` (una fila, arranca en
  `fixed`); lo cambia solo `is_super_admin()`. Todo el código lee el modo por `effective_delivery_mode(negocio)`, que
  hoy devuelve el de la plataforma, para poder volverlo por local sin tocar nada más.
- **ENVIO-146** Cada pedido con circuito de repartidor copia el modo al nacer (`orders.delivery_mode`) y lo conserva:
  mover el interruptor no cambia los pedidos en curso. Los que estaban abiertos al migrar quedan en `offers`. El
  navegador no puede escribir la columna.
- **ENVIO-147** En `fixed`, `courier_take_order(pedido)` lo toma al precio de lista de la zona, sin cambiar precio ni
  poner motivo: un solo UPDATE condicional, así que de dos que tocan a la vez gana uno y al otro le da P0019 ("Ya lo
  tomó otro repartidor"). Deja el evento de envío. En un pedido `offers` da P0023.
- **ENVIO-148** Ofertar, retirar la oferta, elegir una oferta (`public_choose_courier`) y la elección automática solo
  valen en pedidos `offers`: en uno `fixed` dan P0023 ("este pedido no acepta ofertas"), y la elección automática no
  lo toca.
- **ENVIO-149** `courier_available_orders()` trae `modo` en cada pedido, y `public_order_delivery()` trae `modo`; en
  `fixed` esta última no manda lista de ofertas ni cuenta regresiva.
- **ENVIO-150** Devolver un pedido `fixed` lo vuelve a `searching` para todos menos para quien lo devolvió, sin
  ofertas. En `offers` queda como en ENVIO-95 en adelante.
- **ENVIO-151** Igual en los dos modos: sin repartidor a los 10 minutos el local ve el aviso y puede asignar a mano o
  llevarlo él; cancelar cierra la búsqueda; el repartidor ve los datos del cliente solo cuando el pedido es suyo.
- **ENVIO-152** `/superadmin/zonas` muestra el selector "Modo de envíos" con una línea por modo, cuántos pedidos están
  buscando repartidor, y pide confirmar: "Los pedidos en curso siguen con el modo anterior. Los nuevos usan {modo}."
- **ENVIO-153** `/repartidor`: un pedido `fixed` muestra barrio, local, precio y **Tomar** (botón con espera); si lo
  tomó otro, "Ya lo tomó otro repartidor" y sale de la lista. Un pedido `offers` queda como hoy. Rechazar vale en los dos.
- **ENVIO-154** Panel del local, pedido `fixed` buscando: "Buscando repartidor desde las HH:MM" (sin conteo de ofertas)
  y, a los 10 minutos, "Nadie lo tomó todavía". Seguimiento `fixed`: "Buscando repartidor" y después quien lo tomó,
  con el precio de lista, sin lista de ofertas ni cuenta regresiva (es/en/pt).
- **ENVIO-155** La búsqueda de repartidor se abre cuando el local acepta el pedido (`pending → confirmed`), en los dos
  modos y sea común, anticipado o programado. Mientras está pendiente el pedido con envío queda `waiting`: ningún
  repartidor lo ve, lo toma ni oferta. El pedido manual, que nace confirmado, busca al crearse. Los 10 minutos de
  "nadie lo tomó" cuentan desde que se abre la búsqueda. Los que hoy buscan en `pending`, sin repartidor, vuelven a
  `waiting` y se les borran las ofertas.
- **ENVIO-156** Cada pedido que ve el repartidor trae `listo_a` (la hora estimada de listo) y `demora_min`. Salen de
  lo que cargó el local; si no cargó nada, de `default_prep_minutes` desde que aceptó. Un pedido programado o
  anticipado muestra su hora y sin demora.
- **ENVIO-157** El repartidor carga dos tiempos con `courier_set_eta()`: "Llego al local en X min" (pedido suyo, antes
  de retirar) y "Llego al cliente en X min" (ya retirado). De 1 a 120 minutos; un pedido ajeno da P0002, un rango
  fuera de lugar o un tipo desconocido, 22023, y un estado que no corresponde, P0004. Se borran al devolver el pedido.
- **ENVIO-158** Aviso previo: 10 minutos antes de la hora estimada de listo, `run_order_timers()` marca una sola vez
  `pickup_reminder_sent_at` en el pedido con repartidor que todavía no está listo; esa marca dispara el aviso push
  "Pasá a retirar". Si el local cambia la demora, la marca se reinicia y el aviso se rearma. La constante es
  `pickup_reminder_lead()`.
- **ENVIO-159** Si el local cambia la demora de un pedido con repartidor, queda el evento de la demora, la base guarda
  la hora anterior (`ready_was_at`) y al repartidor le llega "El local cambió la demora: listo a las HH:MM". Si no le
  sirve, lo devuelve y vuelve a aparecerles a los otros repartidores.
- **ENVIO-160** Cuando el local marca Listo un pedido con repartidor, le llega "Listo para retirar en {local}".
- **ENVIO-161** `public_order_delivery()` trae `llega_a` (la hora que cargó el repartidor para llegar al cliente) una vez
  retirado el pedido; no trae ningún dato del repartidor que no mostrara.
- **ENVIO-162** Los miembros del local no escriben `courier_eta_pickup_at`, `courier_eta_dropoff_at`,
  `pickup_reminder_sent_at` ni `ready_was_at`: solo las funciones del circuito y el cron.
- **ENVIO-163** `/repartidor`: cada pedido disponible muestra "Listo para retirar a las HH:MM · Demora 45 min"; al
  tomarlo (o ser elegido) pide "Llego al local en…" con 5, 10, 15, 20 y 30 minutos más un campo libre de 1 a 120; en
  curso muestra la hora de listo y, si cambió, "Cambió" con la anterior tachada; al marcar En camino pide "Llego al
  cliente en…". Los botones tienen espera.
- **ENVIO-164** Panel del local: el pedido con repartidor muestra "Llega al local a las HH:MM" si lo cargó; si el
  repartidor lo devolvió, dice el motivo que eligió (ENVIO-166) y vuelve a "Buscando repartidor".
- **ENVIO-165** Seguimiento: pendiente con envío, "Esperando que el local confirme"; en camino, "Llega aprox. a las
  HH:MM" si el repartidor cargó el tiempo (es/en/pt).
- **ENVIO-166** *Reemplaza la deducción de ENVIO-164.* Al tocar Devolver, el repartidor elige "Cambió la demora",
  "Problema con el vehículo" u "Otro" (con texto de 3 a 140 caracteres). `courier_return_order(pedido, tipo, texto)`
  guarda `orders.returned_reason_kind` (`delay_changed`, `vehicle`, `other`) y `returned_reason` (solo con "Otro");
  un tipo inválido o "Otro" sin texto da `22023`, y solo devuelve el repartidor asignado (`P0002`). El local ve "Lo
  devolvió: cambió la demora", "Lo devolvió: problema con el vehículo" o "Lo devolvió: {texto}" mientras el pedido
  vuelve a buscar; al tomarlo otro repartidor el motivo se limpia. Si el repartidor tiene un cambio de demora sin
  ver, "Cambió la demora" es el primer botón. `returned_prep_changed` se elimina.
- **ENVIO-167** El aviso "El local cambió la demora" compara las horas como instantes (`timestamptz`), no como
  texto: la misma hora escrita distinto (`Z` o `+00:00`, con o sin milisegundos, otra zona) no avisa.
- **ENVIO-168** Aceptar un pedido es **un solo diálogo**: mientras el selector de la demora está abierto, la tarjeta
  de "Nuevo pedido" no queda debajo, y el único botón principal es "Aceptar con X min". `PendingButton` se bloquea en
  el mismo toque, con una marca sincrónica y antes de llamar a la acción, aunque la acción no devuelva una promesa:
  dos toques seguidos en el mismo instante llaman una sola vez. Vale en el panel del local y en el del repartidor.
- **ENVIO-169** El seguimiento dice "Listo aprox. a las HH:MM" (es/en/pt), con la hora marcada por el local (ver
  SEGUIMIENTO-39); cuando el local la cambia, la hora nueva. Sigue dependiendo de `show_prep_time` del negocio.
- **ENVIO-170** Con el panel abierto, al repartidor le avisan (sonido y cartel) tres cambios del local en un pedido
  que ya tomó: Listo, otra demora (otro instante, no otro texto) y cancelado. Los demás cambios de estado no avisan,
  y un pedido que ya estaba al abrir no cuenta. Son los mismos que el push (ENVIO-159, 160 y `order_cancelled`), y en
  el service worker suenan y vibran aunque haya un aviso anterior en pantalla.
- **ENVIO-171** El segundo toque de un doble click rápido no hace nada en el selector de la demora: el botón que lo
  abre no abre un segundo (hay un solo selector por pedido) y el toque que llega al selector dentro de los primeros
  600 ms como segundo click de una misma secuencia (`event.detail > 1`) no confirma ni cierra. Un toque deliberado
  después sí cuenta.
- **ENVIO-172** Con el panel abierto, el del local y el del repartidor piden los datos nuevos apenas la base cambia un
  pedido (`orders`) o una oferta (`courier_offers`), por Supabase Realtime, juntando los cambios que llegan casi a
  la vez (250 ms) en una sola actualización; no esperan a la consulta periódica, que queda de respaldo. Los avisos
  que suenan siguen saliendo de comparar lo que la pantalla ya tenía con lo nuevo. El RLS decide qué cambios llegan
  a cada uno. Si el canal no se puede abrir, la pantalla funciona igual.
- **ENVIO-173** El webhook de avisos pide el nombre del local, el del repartidor y si lo asignó el local **mientras**
  resuelve a quién avisar, no después, y responde (y registra) `lagMs` (del cambio en la base a la llegada del
  webhook) y `handlerMs` (lo que tardó en resolver y mandar). Los avisos por cambio de estado (Listo, demora,
  cancelado) salen del webhook sobre `orders` en el momento del `UPDATE`; `pg_cron` solo marca los plazos
  (elección automática, sin ofertas, recordatorios y "10 minutos antes de retirar").
- **ENVIO-174** El repartidor carga su vehículo en "Mi perfil": casillas **Moto** y **Auto**, una o las dos, al
  menos una (`couriers.moto`, `couriers.auto`, con `CHECK`). Los repartidores que ya existían quedan con Moto. Solo
  el propio repartidor lo cambia (`courier_save_vehicles()`); el superadmin lo ve. No cambia el precio: zonas y
  ofertas siguen igual. Solo hay moto y auto.
- **ENVIO-175** El superadmin tiene el interruptor "Vehículo del repartidor (moto/auto)" en `platform_settings`
  (`vehicle_enabled`), junto al modo de envíos. **Arranca apagado.** Lo lee el servidor con `vehicle_enabled()`,
  no solo la pantalla, y solo el superadmin lo cambia. Apagado: no se ven las casillas del perfil, ni "Necesita
  auto", ni los íconos, y el servidor ignora `needs_car` (no filtra a nadie). Los datos cargados se conservan.
- **ENVIO-176** Al aceptar un pedido con envío, el local puede prender "Necesita auto" (`orders.needs_car`, por
  defecto apagado). Se carga antes de confirmar, para que la búsqueda nazca ya filtrada, y se puede cambiar
  mientras no haya repartidor asignado (`set_order_needs_car()`); con repartidor, o en un pedido cerrado o sin
  envío con repartidor, da error. Solo lo cambia un miembro del negocio del pedido: ni el cliente ni el repartidor.
- **ENVIO-177** Con el interruptor prendido, un pedido que necesita auto **solo lo ve el repartidor que marcó
  Auto**: en la lista de pedidos disponibles, al tomarlo (precio fijo), al ofertar y en la asignación a mano del
  local. Lo decide el servidor (`courier_sees_order()`, `courier_take_order()`, `courier_make_offer()`,
  `business_assign_courier()`): un repartidor sin auto recibe el error `P0024` ("Este pedido necesita auto"). Los
  avisos push de "pedido nuevo" tampoco le llegan. Si nadie con auto cubre la zona, el aviso de "sin ofertas" a los
  10 minutos sale igual.
- **ENVIO-178** Con el interruptor prendido se ve el vehículo del repartidor con un ícono propio (SVG, no emoji):
  junto a su nombre en la tarjeta y el detalle del pedido del local, en cada oferta, y en el seguimiento del cliente
  (`public_order_delivery()` suma `vehiculo` del repartidor asignado y de cada oferta). En la tarjeta del
  repartidor, el chip "Necesita auto" cuando el pedido lo pide. El texto accesible del seguimiento va en es/en/pt.
- **ENVIO-179** Los términos para repartidores tienen una versión (arranca en 1, vive en `platform_settings.courier_terms_version`
  y la lee el servidor con `courier_terms_version()`). El texto vive en `admin/src/content/terminos-repartidores.md`
  con su número al lado; un test comprueba que el archivo y la base dicen la misma versión, así que cambiar los
  términos es editar el archivo, subir el número y una migración que actualice la versión.
- **ENVIO-180** Cada aceptación es una fila de `courier_terms_acceptances` (repartidor, versión y `accepted_at` del
  servidor), que no se pisa ni se borra: es la prueba. Se crea solo con `courier_accept_terms(versión)`, que exige la
  versión vigente. El repartidor lee solo las suyas, no ve ni crea las de otro, y el superadmin las lee todas.
- **ENVIO-181** El superadmin tiene el interruptor "Exigir términos a repartidores" en `platform_settings`
  (`courier_terms_required`), junto al modo de envíos y al vehículo. **Arranca prendido.** Lo lee el servidor con
  `courier_terms_required()` y solo el superadmin lo cambia. Apagado no se muestra la pantalla ni se bloquea nada.
- **ENVIO-182** Con el interruptor prendido, el repartidor que no aceptó la versión vigente no ve pedidos disponibles
  (`courier_available_orders()` devuelve vacío y `courier_sees_order()` es falso), y tomar u ofertar da el error
  `P0025` ("Tenés que aceptar los términos para repartidores"). Aceptar lo habilita; subir la versión vuelve a
  bloquear a todos hasta que acepten otra vez.
- **ENVIO-183** Al entrar al panel del repartidor sin haber aceptado la versión vigente, en lugar del panel se ve la
  pantalla de términos: el texto, la casilla "Leí y acepto los términos" y el botón "Aceptar" (deshabilitado hasta
  marcar la casilla). Los textos de la pantalla van en es/en/pt (según el idioma del navegador); los términos, solo
  en español.
- **ENVIO-184** En "Mi perfil" el repartidor tiene el link "Términos para repartidores" para releerlos
  (`/repartidor/terminos`), con "Versión N, aceptada el …".
- **ENVIO-185** En la lista de repartidores del superadmin, cada uno muestra "Términos": la versión aceptada y la fecha,
  o "Pendiente" (con el interruptor prendido y la versión vigente sin aceptar).
- **ENVIO-186** Con "Exigir términos a repartidores" prendido, el aviso push de pedido nuevo no le llega al repartidor que
  no aceptó la versión vigente (`courier_push_eligible()`, que usa el endpoint del webhook). Apagado, les llega a todos.
- **ENVIO-187** Con el interruptor prendido, la elección automática de ofertas (`settle_courier_offers`) ignora las
  ofertas de quien no aceptó la versión vigente (pasa si se sube la versión con ofertas abiertas). Apagado, elige entre todas.
- **ENVIO-188** Con el interruptor prendido, el local no puede asignar a mano un pedido a un repartidor que no aceptó la
  versión vigente (error `P0026`, "todavía no aceptó los términos") y ese repartidor no aparece en la lista para elegir
  (`business_delivery_options`). Apagado, se asigna a cualquiera.
- **ENVIO-189** Si falla la consulta del estado de los términos, el panel del repartidor no se cae: se muestra igual y la
  base sigue exigiéndolos al ver, tomar y ofertar.
- **ENVIO-190** En la lista de repartidores del superadmin, con el interruptor apagado la columna "Términos" dice "No se
  exige" (en lugar de "Pendiente") a quien no aceptó la versión vigente.
- **ENVIO-191** El repartidor tiene junto al título de su panel un estado chico que también es el interruptor: un
  círculo verde con "Conectado" o rojo con "No conectado" (la hora "Disponible desde las HH:MM" y la regla de las 4 horas
  van en el tooltip, para no ocupar lugar). Todos arrancan No conectado (sin fila en
  `courier_availability`). Solo el propio repartidor lo cambia (`courier_set_available()`); nadie escribe la tabla
  directo. Cada repartidor lee solo su fila y el superadmin las ve todas.
- **ENVIO-192** Cada vez que el estado cambia de verdad se guarda un registro en `courier_availability_events`
  (repartidor, disponible sí/no, `at` del servidor y `reason`: `manual` o `auto_off`). Nadie lo edita ni lo borra: es
  para medir la prueba. El repartidor lee los suyos y el superadmin todos.
- **ENVIO-193** El superadmin tiene el interruptor "Disponibilidad de repartidores" en `platform_settings`
  (`courier_availability_enabled`), junto a los otros. **Arranca prendido.** Lo lee el servidor con
  `courier_availability_enabled()` y solo el superadmin lo cambia. Apagado: no se ve el interruptor del repartidor ni
  ningún aviso (menú, seguimiento, local), prender da `P0027`, y el aviso push de pedido nuevo les llega a todos
  como antes.
- **ENVIO-194** Un repartidor disponible se apaga solo a las 4 horas sin actividad. Actividad es prender el interruptor,
  tomar u ofertar un pedido, o cambiar el estado de un pedido propio (no cuenta lo que haga el local ni el cliente).
  `courier_availability_expire()`, con pg_cron cada minuto, lo apaga y deja un registro `auto_off`; y como cuenta
  disponible solo con actividad en las últimas 4 horas, el conteo es correcto aunque el cron se atrase. Si tiene
  avisos push activados, se le avisa: "Te pusimos como No disponible porque pasaron 4 horas sin actividad".
  El aviso sale de un Database Webhook de Supabase sobre `courier_availability_events` (solo Insert) que llama al mismo
  endpoint y con el mismo secreto que el de `orders`; sin él, el repartidor se apaga igual pero no se entera.
- **ENVIO-195** Un repartidor No disponible igual ve los pedidos de su panel y puede tomarlos u ofertar, pero no recibe
  el aviso push de pedido nuevo (`courier_push_eligible()`). Los avisos de pedidos que ya son suyos (listo, cambio
  de demora, cancelado, faltan 10 minutos) le llegan siempre.
- **ENVIO-196** Un repartidor cuenta como disponible para una zona si está disponible (con actividad en las últimas 4
  horas), está activo, cubre esa zona y, con "Exigir términos a repartidores" prendido, aceptó la versión vigente.
- **ENVIO-197** Para el público hay dos funciones que solo responden sí o no, sin nombres ni cantidades:
  `public_zone_has_couriers(zona)` y `public_order_has_couriers(código)` (nulo si el pedido ya no busca repartidor).
  Con el interruptor apagado, o con una zona que no existe, no hay nada que avisar. Las tablas no se leen sin sesión.
- **ENVIO-198** En el menú, si el cliente eligió envío y su zona no tiene repartidores disponibles, antes de confirmar
  ve el aviso "Ahora puede que no haya repartidores disponibles para tu zona. Podés pedir igual o elegir retiro en
  el local." Puede pedir igual. Si hay alguno, o si falla la consulta, no se muestra nada. Va en es/en/pt.
- **ENVIO-199** En el seguimiento, mientras el pedido busca repartidor y su zona sigue sin disponibles, se ve "Puede
  que tarde en aparecer un repartidor"; se va solo cuando aparece uno o el pedido tiene repartidor. Va en es/en/pt.
- **ENVIO-200** En la pantalla de pedidos del local hay un indicador "Repartidores disponibles ahora: N" (solo la
  cantidad, de los que cubren al menos una de sus zonas de envío); con 0 se ve en ámbar: "Ningún repartidor
  disponible". Cada pedido con envío sin repartidor cuya zona está en 0 lleva la misma marca. No hay push al local
  por esto. Lo calcula `business_courier_availability(negocio)` con el negocio que pone el servidor, y solo lo
  contesta a un miembro de ese negocio.
- **ENVIO-201** El superadmin ve la lista de repartidores disponibles ahora, con desde qué hora y qué zonas cubren.
- **ENVIO-202** El interruptor del repartidor, el indicador del local y el aviso del seguimiento se actualizan sin
  recargar: `courier_availability_pulse` (un contador sin datos de nadie, en la publicación de Realtime) sube con cada
  cambio de disponibilidad y los paneles vuelven a pedir los datos; el seguimiento lo consulta en cada vuelta.
- **ENVIO-203** En Configuración, en Envíos, el negocio elige "Vehículos con los que trabajo": Moto y Auto, al menos uno
  (`business_settings.vehicle_moto` / `vehicle_auto`; la base lo exige con un CHECK y `save_business_vehicles()` da
  `22023`). Los negocios que ya existían quedan con los dos. Solo se ve con el interruptor "Vehículo del repartidor"
  del superadmin prendido, y se guarda con "Guardar cambios" junto con las zonas. Cada negocio cambia solo los suyos
  (el negocio sale de la sesión).
- **ENVIO-204** Con el interruptor prendido, un repartidor ve, toma, oferta y recibe por asignación a mano un pedido
  solo si tiene al menos uno de los vehículos del negocio (`courier_vehicle_ok()`, usada por `courier_sees_order()`);
  si lo intenta igual, la base da `P0024`. Un negocio solo Moto no le muestra sus pedidos a un repartidor solo Auto.
  El aviso push de pedido nuevo respeta lo mismo (`withBusinessVehicles`). Apagado el interruptor, no se filtra nada.
- **ENVIO-205** "Necesita auto" por pedido (ENVIO-176) sigue igual, pero el botón solo aparece si el negocio trabaja con
  Moto y con Auto: si trabaja solo con Auto, todos sus pedidos ya van solo a repartidores con auto.
- **ENVIO-206** Al cambiar los vehículos del negocio, las ofertas abiertas de repartidores que ya no le sirven se cierran.
- **ENVIO-207** El conteo de repartidores disponibles (ENVIO-196 a 202) respeta el vehículo: el panel del local, el
  aviso del seguimiento y, si recibe el negocio, el del menú (`public_zone_has_couriers(zona, negocio)`) cuentan solo a
  quienes sirven a ese negocio.
- **ENVIO-208** El panel del repartidor se entera al instante de un cambio que le importa. Como `orders` solo la lee el
  negocio (el RLS no le manda a la cuenta repartidor ningún evento de esa tabla), la base sube un pulso en
  `courier_order_pulse` (migración `*_pulso_de_pedidos_del_repartidor.sql`): una fila por repartidor con el último
  pedido que lo tocó y la hora, sin datos del cliente ni de nadie más. Cada repartidor lee solo su fila; nadie escribe
  desde la app (solo los triggers de `orders`); un upsert por repartidor, así que no crece. La tabla está en la
  publicación `supabase_realtime` y el panel la escucha (`useCourierOrderChanges`) junto con sus ofertas y la
  disponibilidad. ENVIO-172 vale para el local; el repartidor usa esto.
- **ENVIO-209** Quién recibe el pulso: el repartidor asignado (y el anterior, si el pedido se devolvió), los que ven el
  pedido en Disponibles según `courier_sees_order()` —la misma regla de `courier_available_orders()`— y los que
  ofertaron. Cuando un pedido deja de estar en búsqueda (lo toma otro, se cancela, se elige otro), el pulso va a quienes
  lo veían antes del cambio, para que se les retire de Disponibles. Un pedido sin envío con repartidor no pulsa a nadie.
  La consulta periódica del panel del repartidor, que queda de respaldo si Realtime se corta, pasa de 15 a 5 segundos.
- **ENVIO-210** Los pedidos de datos nuevos de un panel (`router.refresh()`) no se amontonan: mientras uno sigue en
  camino, el pulso de Realtime, la consulta periódica y el resto de las fuentes no lanzan otro sino que dejan uno
  pendiente, que sale apenas llega la respuesta (`useSerialRefresh`). Apilados, cada respuesta tarda más que el
  intervalo, Next los encadena en una sola transición que no se muestra hasta que termina el último, y el pedido
  aceptado no aparecía nunca aunque el servidor ya lo devolvía. Si la respuesta no llega en 10 segundos se libera
  igual. Lo usan el panel del repartidor y el tablero del local.



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
- **ADMIN-PLAN-4** Sin `plan_pdf` (`hasPdf()`), Configuración no muestra la sección "Menú en
  PDF": ese servicio no responde, aunque el negocio tenga `plan_completo`.

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

### Imagen y vigencia (`*_promociones_imagen_y_vigencia.sql`)

- **ADMIN-PROMO-1** Una promoción puede llevar `image_url` (imagen propia) o `image_product_id` (la imagen de uno de sus
  productos: una referencia, no una copia). El menú público resuelve en este orden: la propia, la del producto elegido
  (su imagen o, si no tiene, la ilustrativa que ya resuelve `public_menu`, con `imagenIlustrativa`), la primera de un
  producto de la promoción (una foto del negocio gana a una ilustrativa) y, si no hay, ninguna. Cada promo del menú lleva
  `imagen` e `imagenIlustrativa`.
- **ADMIN-PROMO-2** La imagen propia y la de un producto son excluyentes: lo exige un check de la tabla y
  `save_promotion` (22023). La imagen elegida tiene que ser de un producto de la promoción. Si se borra ese producto,
  la referencia queda nula (`ON DELETE SET NULL (image_product_id)`) y la promoción no se borra.
- **ADMIN-PROMO-3** En el editor, la sección "Imagen" tiene el cargador de imagen y, debajo, "o usar la foto de" con los
  productos de la promoción (con su miniatura y la elegida marcada). Elegir una descarta la otra. Sin ninguna, el menú usa
  la del primer producto con foto.
- **ADMIN-PROMO-4** La sección "Vigencia" tiene "Válida hasta" (fecha y hora opcional, con atajos "Hoy" y "Este fin de
  semana", y "Sin fecha de fin") y "Unidades disponibles" (vacío es sin límite).
- **ADMIN-PROMO-5** La fecha y la hora son de Argentina (UTC-3): sin hora vale hasta las 23:59 de ese día, y la base guarda
  un instante (`valid_until`). Una fecha de fin nueva tiene que ser futura (`validatePromotion` y 22023 en
  `save_promotion`); guardar otra cosa de una promoción ya vencida, sin tocar la fecha, no se bloquea.
- **ADMIN-PROMO-6** Una promoción vencida (`now() > valid_until`) no se devuelve en `public_menu` ni en `menu_preview`, y
  `create_public_order` y `create_manual_order` la rechazan con `P0001` ("ya no está disponible"). Hasta la hora exacta
  sigue vigente. Cada promo con fin lleva `validaHasta` (ISO UTC).
- **ADMIN-PROMO-7** `stock` (entero de 1 en adelante, o nulo) son las unidades disponibles. Lo que queda es `stock` menos
  la suma de `order_items.quantity` de esa promoción en pedidos no cancelados creados desde `stock_set_at`
  (`promotion_remaining`, nulo sin stock). Con 0 restantes la promoción está agotada: no se entrega y se rechaza (`P0001`).
  El menú trae `quedan` solo cuando quedan 5 o menos.
- **ADMIN-PROMO-8** La validación es del servidor, en `resolve_order_lines` (la usan el menú y el pedido manual): bloquea la
  fila de la promoción (`SELECT … FOR UPDATE`) y cuenta las unidades de las líneas del propio pedido, así dos pedidos a la
  vez, o dos líneas de la misma promo, no venden más de lo que queda. Un pedido que se pasa se rechaza entero.
- **ADMIN-PROMO-9** No se descuenta ni se restituye nada: un pedido cancelado libera la unidad solo (`set_order_status` no
  cambia). `save_promotion` mueve `stock_set_at` a `now()` cada vez que cambia el valor del stock (lo vendido antes ya no
  cuenta); guardar el mismo valor no reinicia el conteo y sacar el stock lo deja sin tope.
- **ADMIN-PROMO-10** El editor y la lista muestran cuántas quedan y cuántas se vendieron (`promotion_stock_stats`). Las
  funciones `promotion_sold`, `promotion_remaining` y `promotion_stock_stats` corren con los permisos de quien llama: un
  miembro solo ve las de su negocio.
- **ADMIN-PROMO-11** La lista de promociones muestra su miniatura (propia, la del producto elegido o la del primero con
  foto) y su estado: Vigente, Vence hoy, Vence mañana (por día de Argentina), Vencida o Agotada, con "Hasta dd/mm a las
  hh:mm" y "Quedan N de M · K vendidas".
- **ADMIN-PROMO-12** Las columnas nuevas siguen el RLS de `promotions` (un negocio no lee ni escribe las de otro) y el
  trigger de suspensión (`P0010`) las cubre. Una promoción sin imagen, vigencia ni stock no cambia.

## ADMIN-OPCIONES — Opciones y extras de producto

*Parte A (base de datos y panel); el menú público y los pedidos van en una parte B.
Aplicado por `supabase/migrations/*_opciones_y_extras.sql`, `src/lib/menu/options.ts`,
`src/lib/db/options.ts`, `app/dashboard/menu`. Cubierto por: `src/lib/db/options.test.ts`
(ADMIN-OPCIONES-1 a 11), `src/lib/menu/options.test.ts` (reglas puras, ADMIN-OPCIONES-1 a 6)
`src/components/menu/options-ui.test.tsx` (ADMIN-OPCIONES-13 y 14) y
`app/dashboard/menu/actions/options.test.ts` (ADMIN-OPCIONES-15 y 16).*

Un grupo de opciones ("Extras", "Sabores", "Toppings") se define una vez por negocio y se
asocia a varios productos. Un helado con 2 toppings incluidos es un grupo con máximo 2 y
precios en 0; no existe "incluye N y el resto cuesta X".

- **ADMIN-OPCIONES-1** Un grupo tiene nombre, `min_select` (0 = opcional, 1 o más = obligatorio),
  `max_select` (mayor o igual que el mínimo y que 1), `allow_repeat` (elegir la misma opción más
  de una vez) y `active`; la base rechaza (23514) uno que no cumple y el panel dice por qué.
- **ADMIN-OPCIONES-2** Una opción tiene nombre, `price_delta` (0 o más; nunca negativo), `active`
  y `sold_out`.
- **ADMIN-OPCIONES-3** Guardar un grupo con sus opciones es atómico (`save_option_group`): si algo
  falla no queda un grupo a medias. Al editar, las opciones con `id` se conservan, las que ya no
  vienen se borran y el orden es el enviado.
- **ADMIN-OPCIONES-4** Un grupo tiene de 1 a 30 opciones.
- **ADMIN-OPCIONES-5** Si el grupo no permite repetir, su mínimo no puede superar la cantidad de
  opciones (sería imposible de cumplir).
- **ADMIN-OPCIONES-6** Un producto tiene hasta 6 grupos, sin repetir; se asocian con
  `set_product_option_groups`, que reemplaza los anteriores y guarda el orden elegido.
- **ADMIN-OPCIONES-7** Un negocio solo ve, crea, edita y borra sus propios grupos, opciones y
  asociaciones, y no puede asociar un grupo o un producto de otro negocio.
- **ADMIN-OPCIONES-8** Borrar un grupo borra sus opciones y sus asociaciones con productos; borrar
  una opción o un producto no toca nada más.
- **ADMIN-OPCIONES-9** Reordenar los grupos guarda la posición de cada uno (0, 1, 2…) solo dentro
  del negocio.
- **ADMIN-OPCIONES-10** Un producto con algún grupo obligatorio no puede estar en una promoción:
  la base rechaza (P0014, con un mensaje claro) asociar un grupo obligatorio a un producto que está
  en una promoción, agregar a una promoción un producto con grupo obligatorio, y volver obligatorio
  un grupo asociado a un producto que está en una promoción.
- **ADMIN-OPCIONES-11** Un negocio suspendido no puede crear ni editar grupos, opciones ni
  asociaciones (mismo bloqueo que el resto del panel).
- **ADMIN-OPCIONES-12** En Menú, la sección "Opciones y extras" lista los grupos (con su regla,
  p. ej. "Obligatorio: elegí 1" o "Opcional, hasta 3"), permite crearlos, editarlos y borrarlos con
  confirmación, y reordenarlos arrastrando. El diálogo del grupo permite ordenar las opciones
  arrastrando, y fijar su precio extra, si están activas y si están sin stock.
- **ADMIN-OPCIONES-13** El formulario del producto tiene un selector múltiple "Opciones y extras"
  con el orden de los grupos (hasta 6), y la tarjeta del producto muestra el chip "Con opciones" si
  tiene algún grupo.
- **ADMIN-OPCIONES-14** En el editor de promociones, un producto con grupo obligatorio aparece
  deshabilitado y con el motivo, y no se puede agregar.
- **ADMIN-OPCIONES-15** Todo esto solo existe si el negocio tiene menú digital (`hasDigitalMenu()`).
- **ADMIN-OPCIONES-16** Las acciones del servidor toman el negocio de la sesión
  (`requireBusiness()`) y rechazan un `businessId` distinto.

---

## ADMIN-METRICAS — Métricas de pedidos

*Aplicado por `src/lib/dates.ts` y `src/lib/orders/metrics.ts`. Cubierto por
`src/lib/dates.test.ts` y `src/lib/orders/metrics.test.ts`, en JS puro.*

- **ADMIN-METRICAS-1** Los días y las horas de las métricas se calculan en hora de Argentina
  (UTC-3 fijo), nunca en la zona del servidor: un pedido de las 23:30 argentinas (02:30 UTC del
  día siguiente) cuenta en su día y en su hora.
- **ADMIN-METRICAS-2** "Vendido" son los pedidos `confirmed`, `preparing`, `ready` o `delivered`:
  los cancelados no suman y los `pending` se cuentan aparte como "sin confirmar".
  `summarize()` devuelve cantidad, total vendido, ticket promedio (redondeado, 0 sin pedidos),
  cancelados, sin confirmar y cuántos vendidos vinieron del menú web (`source` "web") y cuántos
  se cargaron a mano ("manual"). Una lista vacía no divide por cero.
- **ADMIN-METRICAS-3** `comparePeriods()` separa los pedidos de los últimos N días (incluido hoy)
  de los N días anteriores; `deltaPercent()` da la variación en % entera, o `null` si el período
  anterior es 0.
- **ADMIN-METRICAS-4** `topProducts()` suma las unidades de los pedidos vendidos por producto y
  ordena por cantidad descendente y, en empate, por nombre ascendente; `byHour()` (24 valores) y
  `byWeekday()` (7 valores, lunes a domingo) cuentan solo pedidos vendidos.
- **ADMIN-METRICAS-5** `listOrdersForMetrics()` trae solo los pedidos del negocio pedido con
  `created_at` desde la fecha indicada, del más nuevo al más viejo, con sus productos (nombre y
  cantidad).
- **ADMIN-METRICAS-6** Como Supabase corta en 1000 filas por consulta, la lectura se pagina de a
  1000 hasta 5000 pedidos; si hay más, devuelve los 5000 más nuevos con `truncated: true`.
- **ADMIN-METRICAS-7** Los textos de las tarjetas se arman con funciones puras
  (`src/lib/orders/metrics-format.ts`): el dinero en pesos argentinos sin decimales; la
  variación como "↑ 12 % vs semana anterior" o "↓ 5 % …" (con "Sin cambios vs …" si no cambió) y
  ninguna si el período anterior es 0; y "8 de 10 pedidos vinieron por tu menú web".
- **ADMIN-METRICAS-8** El Resumen, solo si el plan tiene pedidos (`hasOrders()`), muestra debajo de
  las tarjetas actuales "Pedidos (7 días)" con su variación contra la semana anterior, "Vendido
  (7 días)", "Ticket promedio" y "Por tu menú". Sin pedidos vendidos en 14 días muestra "Todavía no
  hay pedidos esta semana" en lugar de tarjetas en cero. Si la lectura se truncó, no muestra la
  variación.
- **ADMIN-METRICAS-9** `/dashboard/metrics` (con enlace "Métricas" en el menú lateral) solo existe
  si el plan tiene pedidos (`hasOrders()`); sin él redirige a `/dashboard`. El período sale de
  `?dias=7` (por defecto) o `?dias=30`: cualquier otro valor se toma como 7. Se elige con dos
  enlaces, sin JS. Muestra las mismas tarjetas del Resumen para ese período, comparadas con el
  período anterior.
- **ADMIN-METRICAS-10** Las barras de "Lo más pedido", "Horarios" y "Días de la semana" miden su
  valor contra el mayor del gráfico (en %, entero) y llevan su cantidad escrita, no solo el color.
  El texto destacado es "Tu hora fuerte: 21 h" (la hora con más pedidos; en empate, la más
  temprana) y no aparece sin pedidos.
- **ADMIN-METRICAS-11** Sin pedidos vendidos en el período, la página dice que todavía no hay
  pedidos en vez de dibujar gráficos vacíos; si la lectura se truncó, avisa "Mostrando los últimos
  5000 pedidos" y no muestra variaciones.

---

## ADMIN-PWA — Panel instalable y avisos push

*Aplicado por `app/manifest.ts`, `public/sw.js`, `src/lib/push/` y `app/api/push/order/route.ts`, con la migración
`20261025000000_avisos_push.sql`. Cubierto por `src/lib/db/push.test.ts`, `src/lib/push/*.test.ts` y
`app/api/push/routes.test.ts`. No es la PWA del menú público (PWA-1 a 3): esta es la del panel.*

**Suscripciones y tareas por tiempo (base)**

- **ADMIN-PWA-1** `push_subscriptions` es de la persona, no del negocio: cada usuario lee y borra solo sus
  suscripciones (por `user_id`), no hay INSERT ni UPDATE directos y `anon` no puede nada.
- **ADMIN-PWA-2** `save_push_subscription(endpoint, p256dh, auth, user_agent)` guarda la suscripción del
  usuario con sesión y, si ese `endpoint` ya estaba con otra cuenta (el mismo celular), la pasa a la actual.
- **ADMIN-PWA-3** `save_push_subscription` rechaza lo que no tiene sesión, un `endpoint` que no empieza con
  `https://` y cualquier dato vacío.
- **ADMIN-PWA-4** `delete_push_subscription(endpoint)` borra la suscripción propia y nunca la de otro.
- **ADMIN-PWA-5** `run_order_timers()` resuelve la elección automática de todos los pedidos con ofertas
  vencidas, aunque nadie tenga el panel ni el seguimiento abierto.
- **ADMIN-PWA-6** `run_order_timers()` marca en `orders.no_offers_alerted_at`, una sola vez, los pedidos con
  envío que buscan repartidor hace más de 10 minutos sin ninguna oferta; no marca los que tienen ofertas, los
  que llevan menos de 10 minutos ni los que esperan un pago de Mercado Pago.
- **ADMIN-PWA-7** Cuando un pedido vuelve a buscar repartidor (una devolución), `no_offers_alerted_at` se limpia
  y puede avisar de nuevo.
- **ADMIN-PWA-8** `run_order_timers()` no la puede llamar `anon` ni `authenticated`, y si existe `pg_cron` queda
  programada cada minuto.

**Instalar y registrar**

- **ADMIN-PWA-9** El manifest del panel se llama "SMA a la Carta" (corto "SMA Panel"), se acota en `/admin/`
  (su `id` también), arranca en `/admin/dashboard` (ver ADMIN-PWA-31), se muestra `standalone` con los colores
  de la marca y trae los íconos de 192, 512 y maskable.
- **ADMIN-PWA-10** El service worker (`/admin/sw.js`) no guarda nada en caché: solo muestra los avisos
  (`title`, `body`, `tag`, `url`) y, al tocarlos, enfoca una ventana del panel y navega a la `url`, o abre una.
- **ADMIN-PWA-11** El `proxy` no pide sesión a `sw.js`, al manifest, a `icons/` ni a `api/push/`.
- **ADMIN-PWA-12** "Instalar app" se ve cuando el navegador ofreció instalar (`beforeinstallprompt`) y, en
  iPhone/iPad sin instalar, abre un diálogo con los pasos "Tocá Compartir → Agregar a inicio"; no se ve si la
  app ya está instalada ni en navegadores que no permiten instalar.
- **ADMIN-PWA-13** "Activar avisos" se ve si hay service worker y `PushManager` y el aparato no está suscripto;
  suscripto dice "Avisos activados" con opción de desactivar.
- **ADMIN-PWA-14** Con el permiso bloqueado dice "Los avisos están bloqueados: habilitalos en los ajustes del
  navegador"; en iPhone sin instalar, "Instalá la app para recibir avisos".
- **ADMIN-PWA-15** El panel del repartidor muestra, mientras no tenga avisos activados, un recuadro arriba:
  "Activá los avisos para enterarte de los pedidos nuevos".
- **ADMIN-PWA-16** Los controles solo se ven donde el layout pasa `showAppControls` (panel del negocio y del
  repartidor), no en `/superadmin`.

**Avisos (los dispara un Database Webhook sobre `orders`)**

- **ADMIN-PWA-17** `POST /admin/api/push/order` responde 401 y no hace nada si falta `x-webhook-secret` o no
  coincide con `PUSH_WEBHOOK_SECRET` (comparación de tiempo constante).
- **ADMIN-PWA-18** Pedido nuevo para ofertar: cuando un pedido con envío pasa a ser ofertable (nace buscando,
  el local confirma un anticipado o programado, vuelve por una devolución o se paga) avisa a los repartidores
  activos que cubren la zona y no lo rechazaron ni lo devolvieron: "Pedido nuevo para ofertar" ·
  "{local} · {barrio} · ${precio de lista}" → `/admin/repartidor`.
- **ADMIN-PWA-19** Te eligieron: cuando el pedido pasa a `accepted` avisa al elegido "¡Te eligieron!" ·
  "{local} · #{número} · {barrio}", o "{local} te asignó un envío" si lo asignó el local.
- **ADMIN-PWA-20** Eligieron a otro: a los repartidores con oferta que no fueron elegidos (también cuando el
  local lo lleva él) "Eligieron otro repartidor" · "{local} · {barrio}".
- **ADMIN-PWA-21** Cancelado por el local: al repartidor elegido y a los que tenían oferta, "Pedido cancelado" ·
  "{local} · #{número}".
- **ADMIN-PWA-22** Pedido nuevo: a los miembros del negocio "Pedido nuevo #{número}" · "{cliente} · {entrega}"
  → `/admin/dashboard/orders`; no avisa los pedidos cargados por el propio local (`source = 'manual'`).
- **ADMIN-PWA-23** El cliente eligió repartidor: al local "#{número}: lo lleva {repartidor}" · "${precio}",
  solo si lo eligió el cliente o la elección automática, no si lo asignó el local.
- **ADMIN-PWA-24** Nadie ofertó en 10 minutos: al local "#{número}: nadie ofertó todavía" · "Asignalo a mano o
  llevalo vos", cuando `no_offers_alerted_at` pasa de vacío a marcado.
- **ADMIN-PWA-25** Una actualización que no cambia nada de lo anterior (otro estado, una nota) no manda ningún
  aviso, y cada aviso lleva `tag` `order-<id>-<evento>` para no repetirse.
- **ADMIN-PWA-26** Si un aparato responde 404 o 410 su suscripción se borra; un error con un aparato no frena
  a los demás, y la ruta responde 200 aunque algún push falle.
- **ADMIN-PWA-27** Los destinatarios y las claves salen del servidor con la clave de servicio, solo después de
  comprobar el secreto del webhook; las claves VAPID se leen al llamar, no al cargar el módulo.
- **ADMIN-PWA-28** "Avisos activados" solo se muestra si la base tiene la suscripción de este aparato en la cuenta
  actual: si el navegador sigue suscripto de otra cuenta que usó el mismo aparato, vuelve a ofrecer "Activar
  avisos" (un toque, sin pedir permiso de nuevo) y la suscripción pasa a la cuenta nueva.
- **ADMIN-PWA-29** Al salir, la suscripción de ese aparato se saca de la cuenta (el navegador sigue con el
  permiso): quien se fue no sigue recibiendo avisos ahí, y al volver a entrar activa con un toque.
- **ADMIN-PWA-30** El ícono de la pestaña y del acceso directo del panel es el de SMA a la Carta (`app/favicon.ico` y
  `public/favicon.ico`), no el que trae Next.
- **ADMIN-PWA-31** La app instalada abre en el panel, no en un 404: `start_url` es una página real
  (`/admin/dashboard`, dentro del `scope`) y `landing/vercel.json` reescribe también `/admin/` (con barra final,
  que el comodín `/admin/:path*` no cubre) hacia el panel.
- **ADMIN-PWA-32** Una dirección inexistente bajo `/admin` muestra la 404 del panel (`app/not-found.tsx`):
  con la marca, "No encontramos esta página" y un botón "Volver al panel" que lleva a la raíz del panel.

**Recordatorios de pedido nuevo sin atender** (migración `20261030000000_recordatorios_pedido_nuevo.sql`)

- **ADMIN-PWA-33** `run_order_timers()` suma un recordatorio (`orders.new_order_reminders`, con la hora en
  `new_order_reminded_at`) a cada pedido por menú que sigue Pendiente, cada 2 minutos desde que llegó o desde
  el último, hasta 5. Ese UPDATE dispara el evento `local_new_order_reminder`, que avisa a los miembros del
  negocio "Pedido #N sin atender hace X min" → `/admin/dashboard/orders`; el aviso lleva el mismo `tag` que el
  del pedido nuevo, así lo reemplaza en vez de apilarse.
- **ADMIN-PWA-34** Un pedido que sale de Pendiente (confirmado, cancelado…) deja de recibir recordatorios, y
  si el contador sube cuando ya no está Pendiente no sale ningún aviso.
- **ADMIN-PWA-35** No se recuerdan los pedidos cargados por el local (`manual`) ni los de Mercado Pago con el
  pago esperando o fallido; los recordatorios no tocan `courier_status` ni `no_offers_alerted_at`.
- **ADMIN-PWA-36** El service worker muestra el pedido nuevo y su recordatorio con `requireInteraction`,
  vibración `[300, 150, 300, 150, 300]`, `renotify`, `silent: false` y un `tag` por pedido (siempre lleva
  uno, porque `renotify` lo exige), con el total en el cuerpo; el resto de los avisos se muestran igual que
  antes.
- **ADMIN-PWA-37** El payload push lleva `kind` y `urgent` (y `number` y `total` en los urgentes); los
  urgentes salen con urgencia alta y TTL de 60 s, y los demás avisos conservan sus 10 minutos.


### Panel en el celular (ADMIN-MOVIL)

- **ADMIN-MOVIL-1** En pantallas menores a `lg` el header muestra solo el nombre y un botón "Más opciones"
  (⋯); los controles (avisos, instalar, accesos rápidos, cambiar contraseña, salir) pasan a ese menú. Desde
  `lg` el header queda como estaba.
- **ADMIN-MOVIL-2** El menú ⋯ lista, según lo que pase el layout: los accesos rápidos (en pestaña nueva), los
  avisos, "Instalar app" (si no está oculto), el enlace de Superadmin, "Cambiar contraseña" y, al final y
  separado, "Salir" (con la dirección de este aparato, para sacarlo de la cuenta).
- **ADMIN-MOVIL-3** El menú ⋯ se cierra con Escape y al tocar afuera, y cada ítem mide al menos 44 px de alto.
- **ADMIN-MOVIL-4** Al entrar al panel (negocio o repartidor), en pantallas menores a `lg`, aparece un aviso
  "Instalá SMA a la Carta" solo si la app se puede instalar o explicar cómo; no aparece si ya está instalada
  o el navegador no la ofrece.
- **ADMIN-MOVIL-5** "Ahora no" cierra el aviso y no vuelve a aparecer en esa visita (`sessionStorage`); en la
  próxima visita sí.
- **ADMIN-MOVIL-6** "Instalar" dispara la instalación del navegador o, en iPhone, muestra los pasos de
  Compartir → Agregar a inicio.
- **ADMIN-MOVIL-7** El panel del repartidor, en pantallas menores a `lg`, tiene una barra fija abajo con
  Pedidos, Rendiciones (con el contador de pendientes de rendir) y Mis zonas, con el ítem activo marcado.
- **ADMIN-MOVIL-8** La pestaña del repartidor sale de la URL: `/repartidor?tab=rendiciones` abre Rendiciones y
  cualquier otro valor, Pedidos.
- **ADMIN-MOVIL-9** Sin scroll horizontal en la página: las rendiciones del repartidor (menores a `sm`) y el
  historial de pedidos del negocio (menores a `md`, porque tiene más columnas) se ven como tarjetas apiladas;
  desde ahí siguen siendo tabla.
- **ADMIN-MOVIL-10** El panel usa Instrument Sans para el texto y Bricolage Grotesque para los títulos, y los
  colores de la marca (`--color-action` verde para la acción principal) están en los tokens de `globals.css`.
- **ADMIN-MOVIL-11** En el celular, las acciones de las tarjetas de pedidos (negocio y repartidor) hacen wrap y
  miden al menos 44 px de alto; las direcciones, notas y nombres largos se parten (`break-words`) en vez de
  empujar el ancho, y los títulos de página son más chicos (`text-2xl`, `text-3xl` desde `sm`).
- **ADMIN-MOVIL-12** El detalle del pedido sube como hoja desde abajo en el celular, con scroll interno y el
  botón de cerrar de 44 px; desde `sm` sigue siendo un diálogo centrado.

---

## WEB-ENTORNO — Los menús leen la base según el entorno de Vercel

*Aplicado por `web/apps/menu-app/lib/supabase-env.js`, `web/api/supabase-config.js` y
`web/apps/menu-app/supabase-config.js`. Cubierto por `supabase-env.test.js`. Solo URL y publishable key.*

- **WEB-ENTORNO-1** Con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` definidas, la
  configuración de Supabase usa esos valores (en Preview, la base de prueba).
- **WEB-ENTORNO-2** Sin las variables (o si falta una), usa los de producción, sin mezclar bases.
- **WEB-ENTORNO-3** En el navegador, `supabase-config.js` pide `/api/supabase-config`; si falla o la
  respuesta no es válida, usa los de producción. Las funciones de `api/` leen `process.env` directo.

---

## No especificado deliberadamente

Lo que está fuera a propósito. Un requisito para cualquiera de estas cosas se
escribe acá antes de construirse.

- Pagos online: el pedido termina en WhatsApp.
- Cuentas de cliente final: quien pide no se registra.

## Brechas conocidas

Cosas que no cumplen lo que deberían, o que no se pueden testear acá. Cada una
se resuelve en su propia rama `fix/`.

- **Colores, ventana de WhatsApp y selector del seguimiento (a mano).** El CSS del panel
  "Pedido registrado" (SEGUIMIENTO-13), el comportamiento real de `window.open` en PC
  (SEGUIMIENTO-14, salvo las funciones puras, que sí tienen test) y la ubicación del selector de
  idioma en el encabezado (IDIOMA-15) solo se comprueban mirándolos en un navegador.
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
  sin un SMTP propio no le sirve a un cliente, así que se quitó (`/recuperar`,
  `/restablecer` y `/auth/callback` ya no existen). El restablecimiento lo hace el
  superadmin (ADMIN-SUPER-11, ADMIN-AUTH-16). La marca de "contraseña
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
  contacto es `smaalacarta@gmail.com` hasta que exista un buzón en el dominio propio.
