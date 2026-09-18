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

*Aplicado por `web/vercel.json` y la resolución de negocio de
`web/apps/menu-app`. Cubierto por: pendiente.*

_Sin requisitos todavía._

## HORARIO — Abierto o cerrado

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## MENU — Armado del menú

*Destacados, ofertas y categorías. Aplicado por: pendiente. Cubierto por:
pendiente.*

_Sin requisitos todavía._

## BUSQUEDA — Buscador

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## CARRITO — Carrito de compra

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## PEDIDO — Envío del pedido por WhatsApp

*Aplicado por: pendiente. Cubierto por: pendiente.*

_Sin requisitos todavía._

## PDF — Menú en PDF

*Aplicado por `web/apps/pdf`. Cubierto por: pendiente.*

_Sin requisitos todavía._

---

# Landing — `smaalacarta/landing`

## LANDING — Sitio de venta

*Planes, enlaces de contacto, demos. Aplicado por `landing/index.html`,
`landing/landing.js`. Cubierto por: pendiente.*

_Sin requisitos todavía._

---

# Admin — `smaalacarta/admin`

## ADMIN-AUTH — Acceso y negocio actual

*Aplicado por `src/lib/get-current-business.ts`, `app/login`. Cubierto por:
pendiente.*

_Sin requisitos todavía._

## ADMIN-MENU — Categorías y productos

*Aplicado por `src/lib/db/categories.ts`, `src/lib/db/products.ts`,
`app/dashboard/menu`. Cubierto por: pendiente.*

_Sin requisitos todavía._

## ADMIN-PEDIDOS — Pedidos

*Aplicado por `src/lib/db/orders.ts`, `app/dashboard/orders`. Cubierto por:
pendiente.*

_Sin requisitos todavía._

## ADMIN-PROMOS — Promociones

*Aplicado por `src/lib/db/promotions.ts`, `app/dashboard/promotions`. Cubierto
por: pendiente.*

_Sin requisitos todavía._

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
- **Admin no compila.** `main` tiene 2 errores de lint
  (`react-hooks/set-state-in-effect` en `CategoryDialog` y `ProductDialog`) y 7
  de TypeScript: el agregado de `category_id` a productos quedó a medias
  (`MenuClient` no le pasa `categoryId` a `ProductDialog`, la edición no envía
  `category_id`, `products/page.tsx` usa la firma vieja) y `src/lib/db/resources.ts`
  pasa un argumento de tipo donde supabase-js espera dos. Mientras tanto, lint y
  build del admin no bloquean CI. Se resuelve en `fix/admin-productos`, que
  además vuelve a hacerlos obligatorios.
- **Landing: texto del botón principal** dice "Solicitá tu sitio ahoras".
- **Landing: imagen para compartir.** `twitter:image` apunta a
  `assets/og-image.jpg`, que no existe, y `og:image` usa `favicon.svg` (2,5 MB).
- **Landing: enlace "Twitter"** del pie muestra un ícono de email y apunta a `#`.
- **Dominios mezclados.** Demos y canonical usan `smaalacarta.com.ar`; el plan
  Subdominio y el email usan `smaalacarta.online`.
- **Menú web: resolución de negocio duplicada.** `app.js` tiene
  `resolveAppConfig`, `getSlug` y `getAppContext`; solo la primera se usa, y los
  dominios de producción están escritos a mano en ella.
