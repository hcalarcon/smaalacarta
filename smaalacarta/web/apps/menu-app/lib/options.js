// Opciones y extras de un producto (PUBLICO-44): lógica pura, sin DOM. El menú trae en cada
// producto `opciones: [{ id, nombre, min, max, repetir, opciones: [{ id, nombre, precio, agotado }] }]`
// (solo grupos y opciones activos). La elección del cliente es un objeto `{ [idOpción]: cantidad }`.
// El servidor vuelve a validar todo y calcula los precios: acá solo se guía al cliente.

export const hasOptions = (item) => Array.isArray(item?.opciones) && item.opciones.length > 0;

// El producto no se puede agregar sin elegir (algún grupo pide al menos una opción).
export const requiresOptions = (item) => hasOptions(item) && item.opciones.some((g) => g.min >= 1);

const groupOptions = (group) => (Array.isArray(group?.opciones) ? group.opciones : []);

// Cuántas opciones se eligieron en un grupo, contando las repeticiones.
export function groupCount(group, selection) {
  return groupOptions(group).reduce((sum, option) => sum + (Number(selection?.[option.id]) || 0), 0);
}

// Valida la elección contra cada grupo. Devuelve `{ ok, errors }`; `errors` dice, por id de grupo, qué
// falla: `min` (faltan), `max` (sobran), `repeat` (repetida donde no se puede) o `soldOut` (agotada).
// Una opción que no es de ningún grupo es `unknown`, bajo la clave `_`.
export function validateSelection(groups, selection) {
  const errors = {};
  const known = new Set();

  for (const group of groups ?? []) {
    const count = groupCount(group, selection);
    const chosen = groupOptions(group).filter((option) => (Number(selection?.[option.id]) || 0) > 0);

    for (const option of groupOptions(group)) known.add(option.id);

    if (chosen.some((option) => option.agotado === true)) errors[group.id] = "soldOut";
    else if (count < group.min) errors[group.id] = "min";
    else if (count > group.max) errors[group.id] = "max";
    else if (!group.repetir && chosen.some((option) => Number(selection[option.id]) > 1)) {
      errors[group.id] = "repeat";
    }
  }

  for (const [id, quantity] of Object.entries(selection ?? {})) {
    if (Number(quantity) > 0 && !known.has(id)) errors._ = "unknown";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// Lo elegido como lista, en el orden del menú: la foto que se guarda en el carrito
// (`{ id, grupo, nombre, cantidad, precio }`, igual que `order_items.options` más el id).
export function chosenOptions(groups, selection) {
  const chosen = [];

  for (const group of groups ?? []) {
    for (const option of groupOptions(group)) {
      const cantidad = Number(selection?.[option.id]) || 0;
      if (cantidad > 0) {
        chosen.push({
          id: option.id,
          grupo: group.nombre,
          nombre: option.nombre,
          cantidad,
          precio: Number(option.precio) || 0,
        });
      }
    }
  }

  return chosen;
}

// De la lista del carrito otra vez a una elección `{ id: cantidad }`.
export function selectionFromChosen(chosen) {
  return Object.fromEntries((chosen ?? []).map((c) => [c.id, c.cantidad]));
}

export function extrasTotal(chosen) {
  return (chosen ?? []).reduce((sum, c) => sum + (Number(c.precio) || 0) * c.cantidad, 0);
}

// Precio de una unidad: el del producto más los extras elegidos (PUBLICO-42, el mismo cálculo del servidor).
export function unitPrice(basePrice, chosen) {
  return (Number(basePrice) || 0) + extrasTotal(chosen);
}

// Cantidad máxima de unidades de un producto que se elige desde la hoja.
export const MAX_QUANTITY = 99;

// La cantidad de la hoja: entera, de 1 a MAX_QUANTITY; cualquier otra cosa da 1.
export function clampQuantity(quantity) {
  const n = Math.floor(Number(quantity));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_QUANTITY);
}

// Lo que dice el botón "Agregar $total" de la hoja: (producto + extras) × cantidad.
export function sheetTotal(basePrice, chosen, quantity) {
  return unitPrice(basePrice, chosen) * clampQuantity(quantity);
}

const chosenParts = (chosen) =>
  [...(chosen ?? [])]
    .filter((c) => c.cantidad > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => `${c.id}x${c.cantidad}`)
    .join(",");

// Identifica una línea del carrito: el mismo producto con la misma elección da la misma firma, sin
// importar el orden en que se eligió; otra elección, otra firma (PUBLICO-46). En una promoción con
// componentes (`[{ id, nombre, elegidas }]`, uno por unidad) también cuenta lo elegido en cada unidad,
// sin importar el orden de las unidades (PUBLICO-3).
export function lineSignature(id, chosen, components) {
  const units = (components ?? [])
    .map((component) => `${component.id}=${chosenParts(component.elegidas)}`)
    .sort()
    .join(";");

  return `${id}|${chosenParts(chosen)}${units ? `#${units}` : ""}`;
}

// Lo único que viaja al servidor: ids y cantidades, nunca precios (PUBLICO-48).
export function toOrderOptions(chosen) {
  return (chosen ?? []).map((c) => ({ id: c.id, quantity: c.cantidad }));
}

// Texto corto de lo elegido, para el carrito: "Queso, Frutilla ×2".
export function describeChosen(chosen) {
  return (chosen ?? []).map((c) => (c.cantidad > 1 ? `${c.nombre} ×${c.cantidad}` : c.nombre)).join(", ");
}

// ---------------------------------------------------------------------------------------------------
// Promociones con productos que tienen opciones (PUBLICO-3). El menú trae en cada promoción
// `componentes: [{ id, nombre, cantidad, opciones }]`: qué productos lleva, cuántas unidades de cada uno
// y los grupos de cada producto. El cliente elige las opciones de cada unidad.
// ---------------------------------------------------------------------------------------------------

// ¿La promoción tiene algo que elegir? Si ningún producto tiene grupos se agrega directo, como siempre.
export const promoHasChoices = (item) =>
  item?.esPromo === true &&
  Array.isArray(item.componentes) &&
  item.componentes.some((component) => hasOptions(component));

// Lo que abre la hoja al tocar un producto o una promoción.
export const needsSheet = (item) => hasOptions(item) || promoHasChoices(item);

// Una unidad por cada unidad de cada producto, en el orden de la promoción: `{ id, nombre, indice, de, opciones }`
// (`indice` y `de` son "1 de 3"; `de` vale 1 si el producto va una sola vez).
export function promoUnits(item) {
  if (!Array.isArray(item?.componentes)) return [];

  return item.componentes.flatMap((component) => {
    const total = Math.max(1, Math.floor(Number(component.cantidad)) || 1);

    return Array.from({ length: total }, (_, index) => ({
      id: component.id,
      nombre: component.nombre,
      indice: index + 1,
      de: total,
      opciones: Array.isArray(component.opciones) ? component.opciones : [],
    }));
  });
}

// Lo elegido en cada unidad (`selections[i]` es la elección `{ id: cantidad }` de la unidad i) como lista de
// componentes: la foto que se guarda en el carrito (`{ id, nombre, elegidas }`).
export function chosenComponents(units, selections) {
  return units.map((unit, index) => ({
    id: unit.id,
    nombre: unit.nombre,
    elegidas: chosenOptions(unit.opciones, selections?.[index] ?? {}),
  }));
}

// ¿Cada unidad cumple las reglas de sus grupos?
export function validateUnits(units, selections) {
  return units.every((unit, index) => validateSelection(unit.opciones, selections?.[index] ?? {}).ok);
}

// Los extras de todas las unidades.
export function componentsExtras(components) {
  return (components ?? []).reduce((sum, component) => sum + extrasTotal(component.elegidas), 0);
}

// Precio de una unidad de la promoción: el de la promoción más los extras de todos sus componentes.
export function promoPrice(basePrice, components) {
  return (Number(basePrice) || 0) + componentsExtras(components);
}

// Lo único que viaja al servidor: ids y cantidades, nunca precios.
export function toOrderComponents(components) {
  return (components ?? []).map((component) => ({
    product_id: component.id,
    options: toOrderOptions(component.elegidas),
  }));
}

// Una línea de texto por grupo de unidades iguales: "2× Empanada clásica: Carne", "Gaseosas: Coca".
export function describeComponents(components) {
  const counts = new Map();

  for (const component of components ?? []) {
    const chosen = describeChosen(component.elegidas);
    const text = chosen ? `${component.nombre}: ${chosen}` : component.nombre;
    counts.set(text, (counts.get(text) ?? 0) + 1);
  }

  return [...counts].map(([text, count]) => (count > 1 ? `${count}× ${text}` : text));
}

// De los componentes del carrito a las selecciones de la hoja, unidad por unidad: sirve para reabrir la hoja y
// editar una línea. Un producto que cambió de cantidad conserva lo que se pueda, en orden.
export function selectionsFromComponents(units, components) {
  const byProduct = new Map();
  for (const component of components ?? []) {
    byProduct.set(component.id, [...(byProduct.get(component.id) ?? []), component.elegidas]);
  }

  const seen = new Map();

  return units.map((unit) => {
    const position = seen.get(unit.id) ?? 0;
    seen.set(unit.id, position + 1);
    return selectionFromChosen(byProduct.get(unit.id)?.[position]);
  });
}
