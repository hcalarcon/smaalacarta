# Vitrina de menús extraordinarios

Cinco menús muy llamativos pensados para pegar en redes (reels, historias) y que a la vez se pueden
visitar con un link real. Son el gancho: lo que se vende después es un menú a medida para cada local.
Siempre muestran el menú de **Santa Julia Resto** (`santa-julia-resto`), en solo lectura, en cualquier
subdominio. Requisitos: `WEB-VITRINA-*` en `docs/SPEC.md`.

## 1. Qué quedó hecho

Los cinco temas están hechos. Ninguno quedó como "Próximamente" (si alguno se rompe, se vuelve a marcar
con `listo: false` en `lib/vitrina.js` y desaparece el link de la galería).

| Tema | Ruta | Fuentes | Librería |
| --- | --- | --- | --- |
| Galería | `/vitrina` | Bricolage Grotesque, Instrument Sans | ninguna |
| Arcade | `/vitrina/arcade` | Press Start 2P, VT323 | ninguna |
| Floral delicado | `/vitrina/floral` | Cormorant Garamond, Great Vibes | ninguna |
| Futurista | `/vitrina/futurista` | Orbitron, Space Grotesk | ninguna |
| Natural | `/vitrina/natural` | Fraunces, Source Sans 3 | ninguna |
| Fantasía | `/vitrina/fantasia` | Cinzel, EB Garamond | ninguna |

**No usé ninguna librería.** CSS (`@keyframes`, transiciones, animación de trazo SVG), `IntersectionObserver`,
`requestAnimationFrame` y WebAudio alcanzaron para todo; así `web/` sigue sin build ni dependencias de CDN
(solo Google Fonts, con `display=swap`).

## 1.b Cambios después de la primera prueba

- **Solo celulares** (`WEB-VITRINA-18`): con más de 480 px de ancho, todas las páginas muestran «Usá tu celu para ver
  este menú». Está en `lib/barra.css`. Si querés otro corte, es el `481px` de ese archivo.
- **Se ve como un menú real** (`WEB-VITRINA-20`): `data/santa-julia.json` trae 7 categorías, 31 productos con foto
  (las del banco de imágenes de `landing/assets/defaults`, Pexels), opciones, ES/EN/PT y precios de 2026 (hamburguesa
  Santa Julia $26.900, pizza muzzarella $15.900, bife de chorizo $32.900, café $3.900). Se usa **solo si la base no
  tiene publicado a Santa Julia** (en la base de producción hoy no está). Si la base responde, se ve lo que tenga la
  base: sus fotos y sus precios.
- **Natural sin el SVG feo** (`WEB-VITRINA-19`): el relieve ya no es un dibujo fijo. `natural/relieve.js` genera las
  crestas con ruido (las lejanas en punta y con nieve, las del medio suaves, un bosque de pinos delante), con niebla
  entre capas y nubes lentas. No lo pude mirar en pantalla. Otras opciones, si no te convence:
  1. **Fotos reales** de la cordillera (Pexels, licencia libre) en capas recortadas: es lo más natural, pero hay que
     elegirlas y bajarlas a mano.
  2. **Un video corto** en loop de un lago o el bosque de fondo (pesa, y mal en 4G).
  3. **Capas de papel recortado** (estilo ilustración plana, como los juegos de montaña): se parece a lo actual pero
     más estilizado.

## 2. Cómo probarlo

**En la Preview de Vercel de `dev-herni`** (la forma buena, con los rewrites y la base de prueba):
`<preview>/vitrina`, `/vitrina/arcade`, `/vitrina/floral`, `/vitrina/futurista`, `/vitrina/natural`,
`/vitrina/fantasia`.

**En local** (los rewrites de `vercel.json` no existen en un servidor estático, así que se entra por la ruta real):

```bash
cd smaalacarta/web
python -m http.server 8124      # o cualquier servidor estático
# http://localhost:8124/apps/vitrina/index.html
# http://localhost:8124/apps/vitrina/arcade/index.html   (y floral, futurista, natural, fantasia)
```

Un `?lang=en` o `?lang=pt` en el link abre el tema en ese idioma.

**Prueba de humo automática** (texto, sin capturas; hace falta el Chromium de Playwright):
`npm run vitrina:humo` desde la raíz. Abre cada tema en 360 px, con y sin "reducir movimiento", con un menú de
ejemplo simulado, y revisa que no haya errores de consola ni desborde horizontal, que se pinten productos,
que cambie el idioma y que el WhatsApp apunte al número correcto. `npm test` corre los tests de lógica.

## 3. El "momento reel" de cada tema

Todos se graban mejor **recargando la página con la grabación de pantalla ya andando**, en vertical.

- **Arcade** (≈ 6 s, con sonido): aparece "INSERT COIN" titilando → tocá la pantalla (antes, prendé el sonido
  con **SND OFF** de la esquina para que suene la moneda) → "PLAYER 1 READY" → barra de carga → la carta entra.
  Después, scrolleá: el HI-SCORE sube y el ítem legendario brilla.
- **Floral** (≈ 4 s, sin sonido): al cargar, las ramas se dibujan solas alrededor de "Santa Julia", las flores
  brotan y los pétalos empiezan a caer. Después, scrolleá despacio: cada separador floral se abre al llegar.
- **Futurista** (≈ 5 s, sin sonido): una línea de luz escanea la pantalla y una terminal escribe sola
  ("INICIANDO SISTEMA…"). Después, inclinar el celular (o mover el mouse en la compu) hace que las fichas se
  inclinen en 3D; al scrollear rápido también se mueven.
- **Natural** (≈ 8 s, sin sonido): scrolleá la carta de punta a punta con calma: las montañas se mueven a
  distinta velocidad y el cielo pasa de la hora real (amanecer, día o atardecer) a la noche con estrellas y luna.
- **Fantasía** (≈ 5 s, sin sonido): un libro cerrado con el sello "SJ" entre dos velas que parpadean →
  tocarlo → se abre la tapa y entra el mapa del reino. Tocar un lugar del mapa "viaja" hasta esa sección.

## 4. Para probar a mano en el celular

1. La **entrada animada** de cada tema (arriba), y que no te deje trabado: si la carta no carga, la entrada se abre sola.
2. **Cambio de idioma** (ES / EN / PT): cambian los textos de la interfaz y los nombres/descripciones traducidos; el
   idioma queda guardado para la próxima visita.
3. **Saltar a una categoría** desde la navegación de cada tema (mundos, categorías, sectores, senderos, mapa).
4. **Ver las opciones** de la hamburguesa Santa Julia ("Guarnición: …") y el destacado de cada tema.
5. **Botón de WhatsApp** de la barra de abajo: abre el chat de Herni con el texto
   "Hola Herni, vi el menú \<tema\> y quiero uno así para mi local. Mi local se llama: ".
6. Con **"reducir movimiento"** activado en el teléfono: cada tema se tiene que ver completo y quieto (sin
   pétalos, sin escaneo, sin parallax, sin entrada animada).
7. Con **4G lento** (modo "Slow 4G" en las herramientas del navegador): la carta tiene que aparecer aunque las
   fuentes tarden (`display=swap`) y las fotos se ven al llegar (`loading="lazy"`).
8. Que los **precios** se lean bien (con el `$` y el punto de miles) en todos, aunque el fondo sea llamativo.

## 5. Decisiones que tomé

- **Los cinco temas**, no solo dos: los dos primeros (Arcade, Floral) quedaron terminados, testeados y
  commiteados antes de tocar los otros tres.
- **Sin librerías**: ver arriba. Eso evita cargar GSAP o partículas desde un CDN en celulares con 4G.
- **Un módulo común por función**: `lib/vitrina.js` (secciones, WhatsApp, barra, idiomas, galería),
  `lib/arranque.js` (carga, idioma, barra), `lib/navegacion.js` (categoría actual), `lib/sonido.js`. Cada tema
  arma su HTML en `<tema>/piezas.js` (puro, con `escapeHtml`, testeado) y solo el DOM va en `<tema>/tema.js`.
- **Ids de categoría con prefijo `cat-`** (`cat-pizzas`) para no chocar con los ids fijos de cada tema.
- **La regla de `vercel.json` nombra los cinco temas** (`/vitrina/:tema(arcade|floral|…)`): una URL como
  `/vitrina/otra-cosa` cae en el menú de siempre en vez de dar un 404 de Vercel.
- **Imagen para compartir (Open Graph)**: usé el logo de SMA a la Carta
  (`https://www.smaalacarta.com.ar/assets/logo.png`) en todos. Una imagen por tema en SVG no sirve porque
  WhatsApp, Instagram y X no leen SVG; hacerlas bien pide PNG exportados (menos de 150 KB) y no los armé.
- **El título y la descripción de cada tema quedan en español** aunque se cambie el idioma de la interfaz (lo
  que se comparte es el link).
- **Arcade**: el puntaje HI-SCORE sube con el scroll hasta 999.990. Los precios van siempre en pesos reales
  (`$26.900`), con una moneda de adorno al lado.
- **Fantasía**: una moneda de oro = $1.000 (se avisa en pantalla). Los nombres de fantasía se reconocen por una
  palabra de la categoría (hamburguesas, pizzas, entradas, pastas, postres, bebidas, ensaladas, parrilla) en
  los tres idiomas; el resto se llama "Las Tierras de \<nombre\>". El nombre real siempre se ve debajo.
- **Natural**: el momento del día sale de la hora del teléfono, no de la de San Martín de los Andes. Con
  movimiento reducido el cielo queda quieto en ese momento.
- **Futurista**: el giroscopio se usa solo donde el navegador lo da sin pedir permiso (Android); en iPhone quedan
  el scroll y el toque. La terminal de entrada se retira sola a los 4 s y se puede saltar tocándola.
- **Pruebas en navegador**: no saqué capturas ni miré pantallas; sí corrí `npm run vitrina:humo` (texto) para
  detectar errores de consola y desbordes. Lo visual lo tiene que mirar Herni.

## 6. Pendiente o raro

- **El JSON de Santa Julia no coincide con la base.** `web/data/clientes/santa-julia-resto/` es un menú de
  ejemplo viejo (Entradas, Parrilla, Bebidas, sin fotos, sin opciones ni traducciones); el menú completo (con
  fotos de Pexels, opciones y ES/EN/PT) está solo en la base. Lo dejé como estaba, como pidió la tarea: la vitrina
  usa la base y, si no responde, ese JSON. En local sin base se ve ese menú chico, y los temas lucen mucho menos.
  Conviene actualizar el JSON si se quiere una vitrina que funcione sin conexión a la base.
- **Hay que revisar que `santa-julia-resto` esté publicado** en la base que usa cada entorno (en la Preview de
  `dev-herni` es la base de prueba): `public_menu` solo entrega lo publicado y activo.
- **Prueba en móvil real pendiente.** No pude probar en un Android ni en un iPhone: el parallax del Natural, la
  inclinación del Futurista y el libro del Fantasía son lo primero para mirar de cerca.
- **Imágenes OG** por tema (ver arriba).
- **La galería arma las tarjetas con JavaScript**: un rastreador que no ejecute JS (algunas vistas previas de
  redes) ve la página vacía. Si el link de la galería se va a compartir mucho, conviene generar el HTML estático.
- **Sin sonido en los otros temas.** Solo el Arcade tiene sonido (apagado por defecto).
