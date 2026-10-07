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

// Identifica una línea del carrito: el mismo producto con la misma elección da la misma firma, sin
// importar el orden en que se eligió; otra elección, otra firma (PUBLICO-46).
export function lineSignature(id, chosen) {
  const parts = [...(chosen ?? [])]
    .filter((c) => c.cantidad > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((c) => `${c.id}x${c.cantidad}`);

  return `${id}|${parts.join(",")}`;
}

// Lo único que viaja al servidor: ids y cantidades, nunca precios (PUBLICO-48).
export function toOrderOptions(chosen) {
  return (chosen ?? []).map((c) => ({ id: c.id, quantity: c.cantidad }));
}

// Texto corto de lo elegido, para el carrito: "Queso, Frutilla ×2".
export function describeChosen(chosen) {
  return (chosen ?? []).map((c) => (c.cantidad > 1 ? `${c.nombre} ×${c.cantidad}` : c.nombre)).join(", ");
}
