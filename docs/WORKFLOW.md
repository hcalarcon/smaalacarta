# Cómo trabajar en este proyecto

La regla: **el comportamiento se especifica antes de construirse, y cada
requisito está sostenido por un test.** [SPEC.md](SPEC.md) es la fuente de
verdad; la suite de tests es la prueba.

## El ciclo

1. **Escribir el requisito.** Agregarlo en la sección que corresponde de
   [SPEC.md](SPEC.md), con el siguiente id libre. Una oración testeable. Si no
   entra en una oración, es más de un requisito.
2. **Escribir el test.** Tiene que fallar por la razón correcta — correrlo y
   leer el error antes de escribir código. Un test que pasa antes de que exista
   la funcionalidad no está probando nada.
3. **Escribir el código.** El cambio más chico que hace pasar el test.
4. **Correr la suite completa**, no solo tu archivo.
5. **Correr lint y build** de la app que tocaste.

Dónde vive ese trabajo — de qué rama salir, qué tiene que pasar antes de
mergear y cómo llega a producción — está en [BRANCHING.md](BRANCHING.md).

Cambiar comportamiento existente es el mismo ciclo, empezando por editar el
requisito. Spec, test y código van en el mismo commit: un requisito que ya no
coincide con el código es peor que no tener requisito.

## Las tres apps

| App | Qué es | Dónde se publica |
| --- | --- | --- |
| `smaalacarta/landing` | Sitio de venta: planes, demos, contacto. HTML, CSS y JS sin build | Vercel `smaalacarta` |
| `smaalacarta/web` | Los menús que ve el cliente final: app con carrito, menús HTML, visor de PDF. Sin build; rutas en `vercel.json` | Vercel `democlientes` |
| `smaalacarta/admin` | Panel para que cada negocio gestione su menú, pedidos y promociones. Next.js 16 + Supabase | todavía no se publica |

## Dónde va cada cosa

| Qué | Dónde | Por qué |
| --- | --- | --- |
| Lógica del menú web (horarios, carrito, pedido, rutas) | Módulos ES puros junto a la app, p. ej. `web/apps/menu-app/lib/carrito.js` | Se testea sin navegador ni `fetch` |
| Conectar esa lógica con la página | El script de entrada, p. ej. `web/apps/menu-app/app.js` | Solo lee el DOM, llama a la lógica y pinta |
| Datos de un cliente o demo | `web/data/{clientes,demos}/<slug>/config.json` y `menu.json` | Una carpeta por negocio |
| Rutas públicas de los menús | `web/vercel.json` | Un solo lugar decide qué URL abre qué app |
| Acceso a datos del admin | `admin/src/lib/db/*.ts` | Toda consulta pasa por acá, filtrada por negocio |
| Reglas y derivaciones del admin | `admin/src/lib/` | Las ven los tests y el resto de la app |
| Server actions | `admin/app/dashboard/**/actions/` | Delgadas: validan, llaman a `lib/db`, revalidan |
| Presentación del admin | `admin/app/**/components/`, `admin/src/components/` | Sin reglas |
| Esquema de la base | `admin/supabase/migrations/` | Migraciones nuevas; una migración aplicada no se edita |

Consecuencias que conviene decir en voz alta:

- **Un componente nunca decide una regla.** Si en un componente aparece
  `precio * cantidad` o una comparación de horarios, eso va a un módulo de
  lógica donde los tests lo ven.
- **Toda consulta del admin se filtra por `business_id`.** Un negocio nunca lee
  ni escribe datos de otro. Una consulta nueva sin ese filtro es un bug aunque
  la base tenga RLS.
- **Después de una migración**, regenerar los tipos: `npm run db:types` en
  `admin/`, y commitear `src/types/database.ts` junto con la migración.
- **Nunca se commitea un `.env`**, solo las plantillas `.env*.example`. El
  admin lee `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  de `.env.local`; la CLI de Supabase lee su token y la contraseña de la base de
  `.env.supabase`, a través de los scripts `db:*`.
- **Antes de tocar APIs de Next en el admin**, leer la guía correspondiente en
  `admin/node_modules/next/dist/docs/`: esta versión cambia convenciones (ver
  `admin/AGENTS.md`).

## Escribir tests

Los tests van al lado de lo que prueban (`lib/carrito.js` → `lib/carrito.test.js`,
`src/lib/db/products.ts` → `src/lib/db/products.test.ts`).

**Nombrar el comportamiento, no la función.**
`it("suma una unidad si el producto ya está en el carrito")` es mejor que
`it("addToCart con existente")`. Leídos en fila, los nombres describen el
sistema, que es la idea.

**Decir por qué cuando no es obvio.** Un comentario corto sobre qué se rompería
si se sacara la regla es lo que evita que alguien la "simplifique" más adelante.

**Elegir el nivel correcto:**

- **Lógica pura** — llamar a la función. Rápido, y la mayor parte de la suite
  vive acá.
- **HTML estático** (landing, menús HTML) — cargar el archivo en jsdom y
  consultar el DOM: enlaces, textos, assets referenciados.
- **Acceso a datos del admin** — mockear `@/lib/supabase-server` y verificar la
  consulta que se arma (tabla, filtros, payload) y qué pasa con los errores.
  Nunca contra la base real.
- **Componentes del admin** — Testing Library, interactuando como lo haría una
  persona.

**Cosas que hacen tropezar:**

- **Horarios dependen del reloj.** `vi.useFakeTimers()` y `vi.setSystemTime(...)`
  para fijar día y hora; si no, el test pasa o falla según cuándo se corra.
- **`localStorage` en Node 24 o más nuevo.** Node trae su propio Web Storage y
  tapa al de jsdom con algo que no es un `Storage` completo. CI usa Node 22,
  donde no pasa; en una máquina con Node reciente los tests de persistencia
  fallan todos por la misma causa. Si aparece, se resuelve en el archivo de
  setup de vitest, no en cada test.
- **Los scripts del menú web se ejecutan al cargar.** Por eso la lógica se saca
  a módulos: un test no puede importar `app.js` sin disparar `init()`.

## Comandos

En la raíz — tests de `web/` y `landing/`:

```bash
npm install
```

```bash
npm test
```

En `smaalacarta/admin`:

```bash
npm install
```

```bash
npm test && npm run lint && npm run build
```

```bash
npm run dev
```

Mientras se trabaja, en cualquiera de las dos:

```bash
npx vitest
```

Un solo archivo o un solo test:

```bash
npx vitest run smaalacarta/web/apps/menu-app/lib/horario.test.js -t "nocturno"
```

## Un ejemplo completo

Mostrar "Cierra pronto" cuando falta poco para cerrar.

**1 — Especificar.** En [SPEC.md](SPEC.md), sección `HORARIO`:

> - **HORARIO-7** Faltando 30 minutos o menos para el fin de la franja en curso,
>   el estado es "Cierra pronto" en lugar de "Abierto".
> - **HORARIO-8** En una franja nocturna (`20:00-02:00`) la cuenta regresiva
>   cruza la medianoche: a la 01:40 el estado es "Cierra pronto".

**2 — Test, y verlo fallar.** En `web/apps/menu-app/lib/horario.test.js`:

```js
it("avisa que cierra pronto a media hora del cierre", () => {
  vi.setSystemTime(new Date(2026, 8, 14, 14, 40)); // lunes 14:40
  expect(estadoDelLocal(config({ lunes: ["12:00-15:00"] }))).toBe("cierra-pronto");
});
```

**3 — Construirlo.** La regla en `lib/horario.js`; `app.js` solo traduce el
estado a texto y color.

**4 — Cubrir el resto.** HORARIO-8 en el mismo archivo, con una hora pasada la
medianoche.

**5 — Verificar.** `npm test` en la raíz, y abrir el PR a `development`.

## Antes de abrir un pull request

- Todo comportamiento nuevo o cambiado tiene un id en [SPEC.md](SPEC.md).
- Cada requisito agregado o cambiado tiene un test que falla sin tu código.
- Pasan `npm test` en la raíz, y `npm test`, `npm run lint` y `npm run build`
  en `admin/` si lo tocaste.
- Ninguna regla quedó dentro de un componente o del código que toca el DOM.
- Si cambió la forma de `config.json` o `menu.json`, los clientes existentes
  siguen cargando.
- Si un requisito resultó imposible de testear acá, quedó escrito en
  `Brechas conocidas` de [SPEC.md](SPEC.md) en vez de quedar implícito.
