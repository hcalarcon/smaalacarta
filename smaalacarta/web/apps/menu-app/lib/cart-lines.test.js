import { describe, expect, it } from "vitest";

import { addLine, cartTotal, lineSubtotal, setLineNote, stripNotes, whatsappDetail } from "./cart-lines.js";
import { chosenOptions } from "./options.js";
import { formatPrice } from "./price.js";

const grupos = [
  {
    id: "g-extras", nombre: "Extras", min: 0, max: 3, repetir: true,
    opciones: [
      { id: "o-queso", nombre: "Queso", precio: 500, agotado: false },
      { id: "o-huevo", nombre: "Huevo", precio: 0, agotado: false },
    ],
  },
];
const hamb = { id: "p-hamb", nombre: "Hamburguesa", precio: 1000, opciones: grupos };
const gaseosa = { id: "p-gas", nombre: "Gaseosa", precio: 500 };
const elegir = (selection) => chosenOptions(grupos, selection);

describe("addLine — PUBLICO-46", () => {
  it("un producto sin opciones se comporta como siempre: suma cantidad por id", () => {
    let cart = addLine([], gaseosa);
    cart = addLine(cart, gaseosa);

    expect(cart).toEqual([{ id: "p-gas", nombre: "Gaseosa", precio: 500, cantidad: 2 }]);
  });

  it("los menús de JSON, sin id, se agrupan por nombre", () => {
    const cart = addLine(addLine([], { nombre: "Milanesa", precio: 5000 }), { nombre: "Milanesa", precio: 5000 });
    expect(cart).toEqual([{ nombre: "Milanesa", precio: 5000, cantidad: 2 }]);
  });

  it("la misma elección suma cantidad y no guarda la definición de los grupos", () => {
    let cart = addLine([], hamb, elegir({ "o-queso": 1 }));
    cart = addLine(cart, hamb, elegir({ "o-queso": 1 }));

    expect(cart).toHaveLength(1);
    expect(cart[0].cantidad).toBe(2);
    expect(cart[0]).not.toHaveProperty("opciones");
  });

  it("otra elección del mismo producto es otra línea", () => {
    let cart = addLine([], hamb, elegir({ "o-queso": 1 }));
    cart = addLine(cart, hamb, elegir({ "o-queso": 2 }));
    cart = addLine(cart, hamb, []);

    expect(cart).toHaveLength(3);
  });

  it("el orden en que se eligieron las opciones no crea otra línea", () => {
    let cart = addLine([], hamb, elegir({ "o-queso": 1, "o-huevo": 1 }));
    cart = addLine(cart, hamb, [...elegir({ "o-queso": 1, "o-huevo": 1 })].reverse());

    expect(cart).toHaveLength(1);
    expect(cart[0].cantidad).toBe(2);
  });

  it("el precio de la línea incluye los extras y recuerda el precio base", () => {
    const [line] = addLine([], hamb, elegir({ "o-queso": 2 }));

    expect(line.precio).toBe(2000);
    expect(line.precioBase).toBe(1000);
    expect(line.elegidas).toEqual(elegir({ "o-queso": 2 }));
  });

  it("un carrito viejo, sin opciones, sigue sumando como antes", () => {
    const viejo = [{ id: "p-hamb", nombre: "Hamburguesa", precio: 1000, cantidad: 1 }];

    expect(addLine(viejo, { ...hamb, opciones: undefined })[0].cantidad).toBe(2);
    expect(addLine(viejo, hamb, [])[0].cantidad).toBe(2);
  });

  it("no modifica el carrito que recibe", () => {
    const cart = [{ id: "p-gas", nombre: "Gaseosa", precio: 500, cantidad: 1 }];
    addLine(cart, gaseosa);
    expect(cart[0].cantidad).toBe(1);
  });

  it("sin producto no hace nada", () => {
    expect(addLine([], null)).toEqual([]);
  });
});

describe("subtotales", () => {
  it("el subtotal de una línea con extras es precio con extras por cantidad", () => {
    const cart = addLine(addLine([], hamb, elegir({ "o-queso": 1 })), hamb, elegir({ "o-queso": 1 }));
    expect(lineSubtotal(cart[0])).toBe(3000);
  });

  it("el total suma todas las líneas", () => {
    const cart = addLine(addLine([], hamb, elegir({ "o-queso": 1 })), gaseosa);
    expect(cartTotal(cart)).toBe(1500 + 500);
    expect(cartTotal([])).toBe(0);
  });
});

describe("whatsappDetail — PUBLICO-48", () => {
  it("lista cada opción bajo su ítem y suma los extras al subtotal y al total", () => {
    let cart = addLine([], hamb, elegir({ "o-queso": 2, "o-huevo": 1 }));
    cart = addLine(cart, hamb, elegir({ "o-queso": 2, "o-huevo": 1 }));
    cart = addLine(cart, gaseosa);

    const { text, total } = whatsappDetail(cart, formatPrice);

    expect(text).toBe(
      "• Hamburguesa x2\n  + Queso x2\n  + Huevo x1\n  $2.000 c/u → $4.000\n\n" +
        "• Gaseosa x1\n  $500 c/u → $500\n\n",
    );
    expect(total).toBe(4500);
  });

  it("un ítem sin opciones se ve exactamente como antes", () => {
    const { text } = whatsappDetail([{ id: "x", nombre: "Café", precio: 1000, cantidad: 3 }], formatPrice);
    expect(text).toBe("• Café x3\n  $1.000 c/u → $3.000\n\n");
  });

  it("usa el nombre en español si el menú está traducido", () => {
    const { text } = whatsappDetail([{ nombre: "Coffee", nombreEs: "Café", precio: 1, cantidad: 1 }], formatPrice);
    expect(text).toContain("• Café x1");
  });
});

describe("nota por producto — PUBLICO-65 y 66", () => {
  it("la misma nota suma cantidad; otra nota es otra línea", () => {
    let cart = addLine([], hamb, elegir({ "o-queso": 1 }), "sin cheddar");
    cart = addLine(cart, hamb, elegir({ "o-queso": 1 }), "  sin   cheddar ");
    cart = addLine(cart, hamb, elegir({ "o-queso": 1 }), "con mostaza");
    cart = addLine(cart, hamb, elegir({ "o-queso": 1 }));

    expect(cart.map((l) => [l.nota, l.cantidad])).toEqual([
      ["sin cheddar", 2],
      ["con mostaza", 1],
      [undefined, 1],
    ]);
  });

  it("una línea sin nota no lleva la clave, y un carrito viejo sigue sumando", () => {
    const viejo = [{ id: "p-gas", nombre: "Gaseosa", precio: 500, cantidad: 1 }];
    const cart = addLine(viejo, gaseosa);

    expect(cart).toEqual([{ id: "p-gas", nombre: "Gaseosa", precio: 500, cantidad: 2 }]);
    expect(cart[0]).not.toHaveProperty("nota");
  });

  it("los menús de JSON también distinguen por nota", () => {
    const m = { nombre: "Milanesa", precio: 5000 };
    const cart = addLine(addLine([], m, [], "sin sal"), m);

    expect(cart).toHaveLength(2);
  });

  it("setLineNote cambia la nota, sin tocar el carrito original", () => {
    const cart = addLine([], gaseosa);
    const next = setLineNote(cart, 0, "sin hielo");

    expect(next[0].nota).toBe("sin hielo");
    expect(cart[0]).not.toHaveProperty("nota");
  });

  it("setLineNote junta la línea con otra igual y suma cantidad", () => {
    let cart = addLine([], gaseosa, [], "sin hielo");
    cart = addLine(cart, gaseosa);
    cart = addLine(cart, gaseosa);

    const next = setLineNote(cart, 1, "sin hielo");

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ nota: "sin hielo", cantidad: 3 });
  });

  it("setLineNote con texto vacío quita la nota", () => {
    const cart = addLine([], gaseosa, [], "sin hielo");

    expect(setLineNote(cart, 0, " \n ")[0]).not.toHaveProperty("nota");
  });

  it("stripNotes saca las notas y junta lo que queda igual", () => {
    let cart = addLine([], gaseosa, [], "sin hielo");
    cart = addLine(cart, gaseosa);

    expect(stripNotes(cart)).toEqual([{ id: "p-gas", nombre: "Gaseosa", precio: 500, cantidad: 2 }]);
  });

  it("el mensaje de WhatsApp lista la nota bajo el ítem", () => {
    const cart = addLine(addLine([], gaseosa, [], "sin hielo"), hamb, elegir({ "o-queso": 1 }), "sin cheddar");
    const { text } = whatsappDetail(cart, formatPrice);

    expect(text).toContain("• Gaseosa x1\n  📝 sin hielo\n");
    expect(text).toContain("  + Queso x1\n  📝 sin cheddar\n");
  });
});
