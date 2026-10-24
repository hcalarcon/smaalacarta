// Líneas del carrito (PUBLICO-46 y 48): lógica pura para agregar, sumar y armar el detalle del
// mensaje de WhatsApp. `app.js` solo guarda el resultado y pinta.

import { cleanNote } from "./item-notes.js";
import { clampQuantity, lineSignature, promoPrice, unitPrice } from "./options.js";

// ¿Son la misma línea? Mismo producto (por id, o por nombre en los menús de JSON), mismas opciones y
// misma nota. Una línea sin `nota` (carritos viejos) es la de nota vacía.
function sameLine(a, b) {
  const sameProduct = a.id
    ? lineSignature(a.id, a.elegidas, a.componentes) === lineSignature(b.id, b.elegidas, b.componentes)
    : a.nombre === b.nombre;
  return sameProduct && cleanNote(a.nota) === cleanNote(b.nota);
}

// La línea nueva de `product` con la elección `chosen`, la nota y la cantidad. La definición de los
// grupos no se guarda en el carrito: solo lo elegido. Sin opciones la línea es igual a la de siempre, así
// los carritos viejos de localStorage siguen funcionando; sin nota no lleva la clave `nota`.
//
// En una promoción con opciones (PUBLICO-3), `components` es lo elegido en cada unidad
// (`[{ id, nombre, elegidas }]`): la línea lleva `componentes` y su precio suma los extras de todos.
function buildLine(product, chosen, note, quantity, components = []) {
  const nota = cleanNote(note);
  const { opciones: _definition, componentes: _components, ...rest } = product;

  let line;

  if (components.length > 0) {
    line = {
      ...rest,
      precio: promoPrice(product.precio, components),
      precioBase: product.precio,
      componentes: components,
      cantidad: quantity,
    };
  } else if (chosen.length > 0) {
    line = { ...rest, precio: unitPrice(product.precio, chosen), precioBase: product.precio, elegidas: chosen, cantidad: quantity };
  } else {
    line = { ...rest, cantidad: quantity };
  }

  return nota ? { ...line, nota } : line;
}

// Agrega `quantity` unidades (1 por defecto) de `product` con la elección `chosen` (lista de
// `chosenOptions`) y devuelve el carrito nuevo. La misma elección del mismo producto suma cantidad; otra
// elección es otra línea.
//
// La nota del cliente (PUBLICO-65) entra en la firma: mismo producto y mismas opciones con distinta nota
// son líneas distintas; con la misma nota, suman cantidad.
export function addLine(cart, product, chosen = [], note = "", quantity = 1, components = []) {
  if (!product) return cart;

  const units = clampQuantity(quantity);
  const line = buildLine(product, chosen, note, units, components);
  const index = cart.findIndex((other) => sameLine(other, line));

  if (index !== -1) {
    return cart.map((other, i) => (i === index ? { ...other, cantidad: other.cantidad + units } : other));
  }

  return [...cart, line];
}

// Reemplaza la línea `index` por la que sale de editarla en la hoja (PUBLICO-65): otras opciones, otra
// nota u otra cantidad. Si queda igual a otra línea del carrito, se juntan y suman cantidad; si no, ocupa
// el lugar de la editada. Devuelve un carrito nuevo; el original no se toca.
export function replaceLine(cart, index, product, chosen = [], note = "", quantity = 1, components = []) {
  if (!product || !cart[index]) return cart;

  const line = buildLine(product, chosen, note, clampQuantity(quantity), components);
  const rest = cart.filter((_, i) => i !== index);
  const twin = rest.findIndex((other) => sameLine(other, line));

  if (twin !== -1) {
    return rest.map((other, i) => (i === twin ? { ...other, cantidad: other.cantidad + line.cantidad } : other));
  }

  return [...rest.slice(0, index), line, ...rest.slice(index)];
}

// El carrito sin notas, para cuando el negocio las desactivó: las líneas que quedan iguales se juntan.
export function stripNotes(cart) {
  return cart.reduce((out, line) => {
    const { nota: _nota, ...base } = line;
    const same = out.findIndex((other) =>
      base.id
        ? lineSignature(other.id, other.elegidas, other.componentes) ===
            lineSignature(base.id, base.elegidas, base.componentes) && !cleanNote(other.nota)
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

    // Una promoción con opciones: cada unidad con lo que eligió (PUBLICO-3).
    for (const component of line.componentes ?? []) {
      const chosen = (component.elegidas ?? []).map((o) => (o.cantidad > 1 ? `${o.nombre} x${o.cantidad}` : o.nombre));
      text += `  - ${component.nombre}${chosen.length > 0 ? `: ${chosen.join(", ")}` : ""}\n`;
    }

    const nota = cleanNote(line.nota);
    if (nota) text += `  📝 ${nota}\n`;

    text += `  $${formatPrice(precio)} c/u → $${formatPrice(lineSubtotal(line))}\n\n`;
  }

  return { text, total: cartTotal(cart) };
}
