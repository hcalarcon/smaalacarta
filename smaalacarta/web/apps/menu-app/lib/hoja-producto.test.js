import { afterEach, describe, expect, it, vi } from "vitest";

import { openOptionsSheet } from "./options-sheet.js";
import { DICTIONARY } from "./i18n.js";
import { formatPrice } from "./price.js";

// Hoja de producto con notas (PUBLICO-62 a 66): foto, cantidad, nota y "Agregar $total". Se prueba aparte
// de options-sheet.test.js, que cubre las opciones (PUBLICO-45).

const t = (key, vars) => {
  let text = DICTIONARY.es[key] ?? key;
  for (const [name, value] of Object.entries(vars ?? {})) text = text.replace(`{${name}}`, value);
  return text;
};

const punto = {
  id: "g-punto", nombre: "Punto", min: 1, max: 1, repetir: false,
  opciones: [
    { id: "o-jugoso", nombre: "Jugoso", precio: 0, agotado: false },
    { id: "o-cocido", nombre: "Cocido", precio: 0, agotado: false },
  ],
};
const extras = {
  id: "g-extras", nombre: "Extras", min: 0, max: 2, repetir: false,
  opciones: [{ id: "o-queso", nombre: "Queso", precio: 500, agotado: false }],
};
const hamburguesa = { id: "p-hamb", nombre: "Hamburguesa", precio: 1000, opciones: [punto, extras] };
const gaseosa = { id: "p-gas", nombre: "Gaseosa", precio: 500 };

let sheet;
function open(item, extra = {}) {
  const onAdd = vi.fn();
  sheet = openOptionsSheet({ doc: document, item, t, formatPrice, onAdd, notesEnabled: true, ...extra });
  return { onAdd };
}

afterEach(() => {
  sheet?.close();
  sheet = undefined;
  document.body.innerHTML = "";
});

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const click = (node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const inputOf = (id) => q(`[data-opcion="${id}"] input`);
const add = () => q(".opciones-agregar");
const field = () => q(".opciones-nota-campo");
const plus = () => q(".opciones-unidades-mas");
const minus = () => q(".opciones-unidades-menos");
const type = (text) => {
  field().value = text;
  field().dispatchEvent(new Event("input"));
};
const tab = (shiftKey) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));

describe("hoja de producto — PUBLICO-65", () => {
  it("un producto sin grupos también abre la hoja, con cantidad, nota de 2 líneas y 'Agregar $total'", () => {
    open(gaseosa);

    expect(q('[role="dialog"]')).not.toBeNull();
    expect(qa(".opciones-grupo")).toHaveLength(0);
    expect(field().tagName).toBe("TEXTAREA");
    expect(field().rows).toBe(2);
    expect(field().maxLength).toBe(140);
    expect(q("label[for='opciones-nota-campo']").textContent).toBe("Nota para este producto (opcional)");
    expect(add().textContent).toBe("Agregar $500");
    expect(add().disabled).toBe(false);
    expect(q(".opciones-total")).toBeNull();
  });

  it("el precio del botón es (producto + extras) × cantidad, en vivo", () => {
    open(hamburguesa);

    click(inputOf("o-jugoso"));
    click(inputOf("o-queso"));
    expect(add().textContent).toBe("Agregar $1.500");

    click(plus());
    click(plus());
    expect(q(".opciones-unidades-valor").textContent).toBe("3");
    expect(add().textContent).toBe("Agregar $4.500");

    click(minus());
    expect(add().textContent).toBe("Agregar $3.000");
  });

  it("la cantidad no baja de 1 ni sube de 99", () => {
    open(gaseosa);

    expect(minus().disabled).toBe(true);
    for (let i = 0; i < 120; i += 1) click(plus());
    expect(q(".opciones-unidades-valor").textContent).toBe("99");
    expect(plus().disabled).toBe(true);
  });

  it("agregar con nota entrega elección, nota limpia y cantidad", () => {
    const { onAdd } = open(hamburguesa);

    click(inputOf("o-cocido"));
    click(plus());
    type("  sin   cheddar,\ncon mostaza ");
    click(add());

    expect(onAdd).toHaveBeenCalledWith(
      [{ id: "o-cocido", grupo: "Punto", nombre: "Cocido", cantidad: 1, precio: 0 }],
      "sin cheddar, con mostaza",
      2,
    );
    expect(q(".opciones-overlay")).toBeNull();
  });

  it("con el interruptor apagado es la hoja de siempre: sin cantidad, sin nota, sin foto, con 'Total'", () => {
    const { onAdd } = open(hamburguesa, { notesEnabled: false, image: { kind: "photo", src: "https://cdn.example.com/h.jpg" } });

    expect(q(".opciones-unidades")).toBeNull();
    expect(field()).toBeNull();
    expect(q(".opciones-foto")).toBeNull();
    expect(q(".opciones-total").textContent).toBe("Total $1.000");

    click(inputOf("o-jugoso"));
    click(add());
    expect(onAdd).toHaveBeenCalledWith(expect.any(Array), "", 1);
  });

  it("editar desde el carrito: llega precargada y confirma con 'Guardar'", () => {
    const initial = {
      chosen: [
        { id: "o-cocido", grupo: "Punto", nombre: "Cocido", cantidad: 1, precio: 0 },
        { id: "o-queso", grupo: "Extras", nombre: "Queso", cantidad: 1, precio: 500 },
        { id: "o-viejo", grupo: "Extras", nombre: "Ya no existe", cantidad: 1, precio: 100 },
      ],
      quantity: 3,
      note: "sin cheddar",
    };
    const { onAdd } = open(hamburguesa, { initial, confirmKey: "options.save" });

    expect(inputOf("o-cocido").checked).toBe(true);
    expect(inputOf("o-queso").checked).toBe(true);
    expect(q(".opciones-unidades-valor").textContent).toBe("3");
    expect(field().value).toBe("sin cheddar");
    expect(q(".opciones-nota-contador").textContent).toBe("11/140");
    expect(add().textContent).toBe("Guardar $4.500");

    type("con mostaza");
    click(add());

    const [chosen, note, quantity] = onAdd.mock.calls[0];
    expect(chosen.map((c) => c.id)).toEqual(["o-cocido", "o-queso"]);
    expect(note).toBe("con mostaza");
    expect(quantity).toBe(3);
  });

  it("muestra la foto del producto, asignada como propiedad", () => {
    open(gaseosa, { image: { kind: "photo", src: "https://cdn.example.com/g.jpg" } });

    const photo = q(".opciones-foto");
    expect(photo.getAttribute("src")).toBe("https://cdn.example.com/g.jpg");
    expect(photo.classList.contains("ilustrativa")).toBe(false);
  });

  it("Enter no escribe un salto de línea en la nota", () => {
    open(gaseosa);
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    field().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("el foco queda atrapado: Tab desde el último vuelve al primero y Mayús+Tab al revés", () => {
    open(gaseosa);
    const nodes = [...q(".opciones-hoja").querySelectorAll("button, textarea")].filter((n) => !n.disabled);

    nodes.at(-1).focus();
    tab(false);
    expect(document.activeElement).toBe(nodes[0]);

    tab(true);
    expect(document.activeElement).toBe(nodes.at(-1));
  });

  it("al cerrar con Escape, el foco vuelve a quien abrió la hoja", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);

    open(gaseosa, { returnFocus: opener });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(q(".opciones-overlay")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("lo que escribe el cliente y el nombre del producto nunca se interpolan como HTML", () => {
    open({ ...gaseosa, nombre: "<b>Gaseosa</b>" }, { initial: { note: "<img src=x onerror=alert(1)>" } });

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(field().value).toBe("<img src=x onerror=alert(1)>");
  });
});
