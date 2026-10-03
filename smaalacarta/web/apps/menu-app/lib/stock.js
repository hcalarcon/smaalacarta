// Productos sin stock (PUBLICO-26): el menú los muestra con `agotado: true` pero no se pueden
// pedir. Lógica pura: `app.js` solo pinta y avisa.

export const isSoldOut = (item) => item?.agotado === true;

// Deja en el carrito solo lo que todavía se puede pedir según el menú que acaba de cargar: quita
// los productos que ahora están sin stock y las promociones que el menú ya no ofrece (una
// promoción con un producto sin stock deja de entregarse). Un ítem sin id (menú de JSON) no se
// toca. Devuelve el carrito nuevo y los nombres de lo quitado, para avisarle al cliente.
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
    const gone = line?.id && (current ? isSoldOut(current) : Boolean(line.esPromo));

    if (gone) removed.push(line.nombre);
    else kept.push(line);
  }

  return { cart: kept, removed };
}
