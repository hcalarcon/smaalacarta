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

*Aplicado por `src/lib/get-current-business.ts`, `src/lib/auth/`, `proxy.ts`,
`app/(auth)` y las políticas de RLS en `supabase/migrations/`. Cubierto por:
`src/lib/auth/*.test.ts` (ADMIN-AUTH-4 a 8); las políticas de RLS y el resto del
flujo, pendiente (ver Brechas conocidas).*

- **ADMIN-AUTH-1** Al registrarse un usuario se le crea un perfil con su email.
  Nadie ve ni edita el perfil de otro.
- **ADMIN-AUTH-2** Un usuario solo puede ver, crear, editar y borrar categorías,
  productos, promociones y pedidos de los negocios de los que es miembro, y no
  puede mover una fila a un negocio del que no es miembro. Un producto solo
  puede pertenecer a una categoría de su mismo negocio.
- **ADMIN-AUTH-3** Un usuario solo ve los negocios de los que es miembro y sus
  propias membresías. Crear negocios y asignar miembros no se hace desde el
  admin.
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

## ADMIN-MENU — Categorías y productos

*Aplicado por `src/lib/db/categories.ts`, `src/lib/db/products.ts`,
`src/lib/menu/product-fields.ts`, `app/dashboard/menu`. Cubierto por:
`src/lib/menu/product-fields.test.ts` (ADMIN-MENU-1 y 2).*

- **ADMIN-MENU-1** Un producto se crea siempre dentro de una categoría; la
  descripción vacía se guarda como nula y un producto nuevo nace activo.
- **ADMIN-MENU-2** Editar un producto conserva su categoría, salvo que se indique
  otra de forma explícita.

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
- **Las políticas de RLS no tienen tests.** ADMIN-AUTH-1 a 3 viven en la base.
  Testearlas pide `supabase test db` (pgTAP) sobre una base local, y eso
  necesita Docker, que no está en la máquina de desarrollo. Hasta entonces se
  verifican a mano contra el proyecto de desarrollo.
- **Admin: `role` no limita nada.** Cualquier miembro de un negocio puede
  editar `businesses`, incluido el `slug`, sea cual sea su `role` en
  `business_users`. Falta definir qué puede hacer cada rol.
- **Menú público sin acceso a Supabase.** No hay políticas para `anon`: hoy el
  menú web lee JSON y no lo necesita, pero cuando lea de Supabase va a hacer
  falta permitir leer negocios, categorías y productos activos.
- **Admin: un usuario con varios negocios no puede entrar.** El esquema permite
  varias membresías por usuario, pero `getCurrentBusiness()` usa
  `.maybeSingle()`: con más de una falla, devuelve `null` y manda a `/login`.
- **Admin: sin superadmin.** Las cuentas las crea el equipo de SMA a la Carta,
  pero todavía no hay un superadmin: cada cuenta se crea a mano en el panel de
  Supabase y cada negocio con su primer miembro, con SQL. Además, el registro
  público de Supabase (`Allow new users to sign up`) hay que apagarlo a mano: con
  la clave pública, cualquiera puede crear cuentas aunque el admin no tenga
  pantalla para eso. Ver Etapa 4 de [PLAN.md](PLAN.md).
- **Landing: texto del botón principal** dice "Solicitá tu sitio ahoras".
- **Landing: imagen para compartir.** `twitter:image` apunta a
  `assets/og-image.jpg`, que no existe, y `og:image` usa `favicon.svg` (2,5 MB).
- **Landing: enlace "Twitter"** del pie muestra un ícono de email y apunta a `#`.
- **Dominios mezclados.** Demos y canonical usan `smaalacarta.com.ar`; el plan
  Subdominio y el email usan `smaalacarta.online`.
- **Menú web: resolución de negocio duplicada.** `app.js` tiene
  `resolveAppConfig`, `getSlug` y `getAppContext`; solo la primera se usa, y los
  dominios de producción están escritos a mano en ella.
