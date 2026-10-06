// Líneas del carrito (PUBLICO-46 y 48): lógica pura para agregar, sumar y armar el detalle del
// mensaje de WhatsApp. `app.js` solo guarda el resultado y pinta.

import { lineSignature, unitPrice } from "./options.js";

// Agrega una unidad de `product` con la elección `chosen` (lista de `chosenOptions`) y devuelve el
// carrito nuevo. La misma elección del mismo producto suma cantidad; otra elección es otra línea. Con
// id (menú de Supabase) se agrupa por id y elección; los menús de JSON, por nombre. Sin opciones la
// línea es igual a la de siempre, así los carritos viejos de localStorage siguen funcionando.
export function addLine(cart, product, chosen = []) {
  if (!product) return cart;

  const signature = product.id ? lineSignature(product.id, chosen) : null;

  const index = cart.findIndex((line) =>
    product.id ? lineSignature(line.id, line.elegidas) === signature : line.nombre === product.nombre,
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

  return [...cart, line];
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

    text += `  $${formatPrice(precio)} c/u → $${formatPrice(lineSubtotal(line))}\n\n`;
  }

  return { text, total: cartTotal(cart) };
}
