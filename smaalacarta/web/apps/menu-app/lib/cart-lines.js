// Líneas del carrito (PUBLICO-46 y 48): lógica pura para agregar, sumar y armar el detalle del
// mensaje de WhatsApp. `app.js` solo guarda el resultado y pinta.

import { cleanNote } from "./item-notes.js";
import { lineSignature, unitPrice } from "./options.js";

// Agrega una unidad de `product` con la elección `chosen` (lista de `chosenOptions`) y devuelve el
// carrito nuevo. La misma elección del mismo producto suma cantidad; otra elección es otra línea. Con
// id (menú de Supabase) se agrupa por id y elección; los menús de JSON, por nombre. Sin opciones la
// línea es igual a la de siempre, así los carritos viejos de localStorage siguen funcionando.
//
// La nota del cliente (PUBLICO-65) entra en la firma: mismo producto y mismas opciones con distinta nota
// son líneas distintas; con la misma nota, suman cantidad. Una línea sin `nota` (carritos viejos) es la
// de nota vacía.
export function addLine(cart, product, chosen = [], note = "") {
  if (!product) return cart;

  const nota = cleanNote(note);
  const signature = product.id ? lineSignature(product.id, chosen) : null;

  const index = cart.findIndex((line) =>
    product.id
      ? lineSignature(line.id, line.elegidas) === signature && cleanNote(line.nota) === nota
      : line.nombre === product.nombre && cleanNote(line.nota) === nota,
  );

  if (index !== -1) {
    return cart.map((line, i) => (i === index ? { ...line, cantidad: line.cantidad + 1 } : line));
  }

  // La definición de los grupos no se guarda en el carrito: solo lo elegido.
  const { opciones: _definition, ...rest } = product;

  const line =
    chosen.length > 0
      ? { ...rest, precio: unitPrice(product.precio, chosen), precioBase: product.precio, elegidas: chosen, cantidad: 1 }
      : { ...rest, cantidad: 1 };

  return [...cart, nota ? { ...line, nota } : line];
}

// Cambia la nota de la línea `index`. Si queda igual a otra línea (mismo producto, opciones y nota), se
// juntan y suman cantidad. Devuelve un carrito nuevo; el original no se toca.
export function setLineNote(cart, index, note) {
  const target = cart[index];
  if (!target) return cart;

  const nota = cleanNote(note);
  if (nota === cleanNote(target.nota)) return cart;

  const { nota: _old, ...base } = target;
  const next = nota ? { ...base, nota } : base;

  const sameLine = (a, b) =>
    (a.id ? lineSignature(a.id, a.elegidas) === lineSignature(b.id, b.elegidas) : a.nombre === b.nombre) &&
    cleanNote(a.nota) === cleanNote(b.nota);

  const twin = cart.findIndex((line, i) => i !== index && sameLine(line, next));

  if (twin === -1) return cart.map((line, i) => (i === index ? next : line));

  return cart
    .map((line, i) => (i === twin ? { ...line, cantidad: line.cantidad + target.cantidad } : line))
    .filter((_, i) => i !== index);
}

// El carrito sin notas, para cuando el negocio las desactivó: las líneas que quedan iguales se juntan.
export function stripNotes(cart) {
  return cart.reduce((out, line) => {
    const { nota: _nota, ...base } = line;
    const same = out.findIndex((other) =>
      base.id
        ? lineSignature(other.id, other.elegidas) === lineSignature(base.id, base.elegidas) && !cleanNote(other.nota)
        : other.nombre === base.nombre && !cleanNote(other.nota),
    );

    if (same === -1) return [...out, base];
    return out.map((other, i) => (i === same ? { ...other, cantidad: other.cantidad + base.cantidad } : other));
  }, []);
}

export const lineSubtotal = (line) => (Number(line.precio) || 0) * line.cantidad;

export const cartTotal = (cart) => cart.reduce((sum, line) => sum + lineSubtotal(line), 0);

// El detalle del pedido para WhatsApp (siempre en español): cada ítem, sus opciones debajo
// (`  + Queso x1`) y el precio por unidad (que ya incluye los extras) y el subtotal.
export function whatsappDetail(cart, formatPrice) {
  let text = "";

  for (const line of cart) {
    const precio = line.precio || 0; // importante si algún ítem no lo tiene

    text += `• ${line.nombreEs ?? line.nombre} x${line.cantidad}\n`;

    for (const option of line.elegidas ?? []) {
      text += `  + ${option.nombre} x${option.cantidad}\n`;
    }

    const nota = cleanNote(line.nota);
    if (nota) text += `  📝 ${nota}\n`;

    text += `  $${formatPrice(precio)} c/u → $${formatPrice(lineSubtotal(line))}\n\n`;
  }

  return { text, total: cartTotal(cart) };
}
