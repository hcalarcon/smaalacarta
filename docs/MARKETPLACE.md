# Marketplace — "un lugar donde encontrar de todo para comer"

> **Estado: en análisis.** Este documento es de planificación, no de trabajo
> tomado. Nada de lo que describe está implementado ni tiene tareas abiertas en
> `docs/PLAN.md` todavía. No tomar nada de acá sin que Herni lo decida primero.

## Objetivo

Un directorio público de locales de comida, propio de SMA a la Carta, que
combine:

- **Negocios clientes** (con menú digital en la plataforma): la ficha enlaza a
  su menú real (`<slug>.smaalacarta.com.ar`) — "Ver menú" / "Pedir".
- **Negocios que no son clientes**: una ficha básica (nombre, rubro,
  dirección, WhatsApp opcional), sin login ni cuenta propia.

**Objetivo principal: embudo de ventas.** La prioridad, al menos para
arrancar, no es ser el mejor directorio de comida de la ciudad — es que un
no-cliente que aparece ahí (con una ficha pobre, sin menú digital) tenga un
motivo para hacerse cliente. El CTA de una ficha no-cliente es "¿Sos el dueño?
Sumate con tu menú digital", no "dejá tu reseña" ni nada que compita con esa
idea.

## Por qué es una superficie nueva

Hoy no hay nada de esto en el proyecto:

- `businesses` no tiene rubro/categoría de negocio (las categorías que existen
  son de menú: "Bebidas", "Comidas", por negocio). Rubro de negocio ("pizzería",
  "parrilla") es un concepto nuevo.
- No hay geolocalización (`lat`/`lng`) en ningún lado, solo una dirección en
  texto libre con un link a Google Maps armado a mano (`mapsUrl`).
- `landing/` es, hoy, 100 % una landing de ventas B2B estática (features,
  planes, demos, contacto) — cero descubrimiento para el consumidor final.

## Arquitectura

Un **cuarto proyecto de Vercel**, con subdominio propio fijo — propuesta:
`explorar.smaalacarta.com.ar` (a confirmar el nombre exacto con Herni). Un
dominio exacto le gana al comodín `*.smaalacarta.com.ar` que hoy tiene
`web/` completo, así que no choca con el ruteo por slug de negocio que ya
existe — mismo mecanismo que ya se usa para separar `/admin` del resto.

Ese nombre elegido se suma a la lista de slugs reservados, en los **tres
lugares que ya se mantienen sincronizados** (con un test que lo comprueba):
la migración de `businesses`, `src/lib/superadmin/validation.ts` y
`web/apps/menu-app/lib/hostname.js`. Así ningún negocio real puede registrarse
con ese slug.

## Datos

Tabla nueva `directory_listings`, **separada de `businesses`**: esa tabla está
atada a cuentas, auth, RLS y planes de un cliente real que paga; una ficha de
directorio no tiene dueño, ni login, ni necesita nada de eso.

Columnas pensadas:

- `name`, `rubro` (un enum chico tipo `pizzeria` / `parrilla` / `cafeteria` /
  `heladeria` / `panaderia` / `comida-rapida` / `otro` — mismo patrón que
  `THEMES` en `src/lib/settings/validation.ts`: una lista fija, se amplía
  agregando valores, no una tabla aparte),
- `address` (texto libre, como `business_settings.address`),
- `whatsapp` (opcional: contacto directo si el no-cliente quiere),
- `photo_url` (opcional),
- `slug` (por si hace falta una ficha propia con URL, más abajo),
- `business_id` **opcional** (`references businesses(id)`): si está seteado,
  la ficha es de un cliente real.

Con `business_id` seteado, la ficha se arma con los datos **vivos** del
negocio (nombre, logo, dirección, si está publicado) — no se duplican a mano.
Sin `business_id`, los datos son los que se cargaron a mano en el directorio.

**Pregunta abierta:** ¿un cliente aparece automático en el directorio (por
ejemplo, con `published && active`, que ya son señales que existen), o necesita
optar por aparecer (un check nuevo en Configuración, "aparecer en el
explorador")? No está decidido.

## Carga de datos (no-clientes)

**Curado a mano por Herni, para empezar.** Nada de scraping/importación ni
autocarga pública todavía — eso escala mejor pero es mucho más trabajo (y en
el caso de importar de otra fuente, con implicancias legales) para una
primera versión chica.

## Superadmin

Sección nueva, "Directorio": alta y edición manual de fichas no-cliente
(`directory_listings` sin `business_id`), mismo patrón que
`/superadmin/negocios/nuevo`. No hace falta nada más sofisticado para
arrancar.

## Página pública

- Buscador de texto + filtro por rubro + grilla de fichas (foto, nombre,
  rubro, dirección).
- CTA distinto según el tipo de ficha (cliente vs no-cliente, ver arriba).
- **Sin geolocalización ("cerca mío") en el MVP**: no hay `lat`/`lng` en
  ningún lado hoy: el filtro por rubro y texto alcanza para arrancar.
- Cada ficha de cliente enlaza directo a su subdominio real (no hace falta una
  página de detalle propia). Para no-clientes, a definir si alcanza con la
  tarjeta sola o hace falta una ficha de detalle (más fotos, horario, mapa).

## Fuera de alcance (por ahora)

- Geolocalización / "cerca mío".
- Que el propio negocio no-cliente reclame o edite su ficha.
- Reseñas o calificaciones.
- Importación automática de datos de otra fuente.

## Próximos pasos

1. Confirmar el nombre del subdominio.
2. Decidir la pregunta abierta de arriba (cliente automático vs. opt-in).
3. Recién ahí: pasar esto a tareas concretas en `docs/PLAN.md`, con requisitos
   en `docs/SPEC.md` (ID a definir, por ejemplo `MARKETPLACE-1` en adelante) y
   seguir el flujo de siempre (`docs/WORKFLOW.md`).
