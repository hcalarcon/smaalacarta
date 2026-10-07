import { chosenOptions, hasOptions, selectionFromChosen, unitPrice, validateSelection } from "./options.js";

// Productos sin stock (PUBLICO-26): el menú los muestra con `agotado: true` pero no se pueden
// pedir. Lógica pura: `app.js` solo pinta y avisa.

export const isSoldOut = (item) => item?.agotado === true;

// Deja en el carrito solo lo que todavía se puede pedir según el menú que acaba de cargar: quita
// los productos que ahora están sin stock y las promociones que el menú ya no ofrece (una
// promoción con un producto sin stock deja de entregarse). También quita las líneas cuyas opciones ya
// no existen, se agotaron o dejaron de cumplir el mínimo y el máximo, y las de un producto que ahora
// exige opciones y no las tiene (PUBLICO-47); las que siguen valiendo se vuelven a precificar con el
// menú actual. Un ítem sin id (menú de JSON) no se toca. Devuelve el carrito nuevo y los nombres de
// lo quitado, para avisarle al cliente.
export function reconcileCart(cart, menu) {
  if (!Array.isArray(cart)) return { cart: [], removed: [] };

  const offered = new Map();
  for (const category of menu?.categorias ?? []) {
    for (const item of category.items ?? []) {
      if (item?.id) offered.set(item.id, item);
    }
  }

  const kept = [];
  const removed = [];

  for (const line of cart) {
    const current = line?.id ? offered.get(line.id) : null;
    let gone = line?.id && (current ? isSoldOut(current) : Boolean(line.esPromo));
    let next = line;

    if (!gone && current && !line.esPromo) {
      const chosen = Array.isArray(line.elegidas) ? line.elegidas : [];

      if (hasOptions(current)) {
        const selection = selectionFromChosen(chosen);

        if (validateSelection(current.opciones, selection).ok) {
          if (chosen.length > 0) {
            const fresh = chosenOptions(current.opciones, selection);
            next = { ...line, precio: unitPrice(current.precio, fresh), precioBase: current.precio, elegidas: fresh };
          }
        } else {
          gone = true;
        }
      } else if (chosen.length > 0) {
        // El producto ya no tiene opciones: la elección guardada no vale.
        gone = true;
      }
    }

    if (gone) removed.push(line.nombre);
    else kept.push(next);
  }

  return { cart: kept, removed };
}
