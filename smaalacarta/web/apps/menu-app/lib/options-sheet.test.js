import { afterEach, describe, expect, it, vi } from "vitest";

import { DICTIONARY, LANGS } from "./i18n.js";
import { controlKind, openOptionsSheet, ruleText } from "./options-sheet.js";
import { formatPrice } from "./price.js";

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
  opciones: [
    { id: "o-queso", nombre: "Queso", precio: 500, agotado: false },
    { id: "o-panceta", nombre: "Panceta", precio: 800, agotado: false },
    { id: "o-huevo", nombre: "Huevo", precio: 50, agotado: true },
  ],
};
const sabores = {
  id: "g-sabores", nombre: "Sabores", min: 1, max: 3, repetir: true,
  opciones: [
    { id: "o-frutilla", nombre: "Frutilla", precio: 0, agotado: false },
    { id: "o-limon", nombre: "Limón", precio: 100, agotado: false },
  ],
};

const hamburguesa = { id: "p-hamb", nombre: "Hamburguesa", precio: 1000, opciones: [punto, extras] };
const helado = { id: "p-hel", nombre: "Helado", precio: 3000, opciones: [sabores] };

let sheet;
function open(item, extra = {}) {
  const onAdd = vi.fn();
  sheet = openOptionsSheet({ doc: document, item, t, formatPrice, onAdd, ...extra });
  return { onAdd };
}

afterEach(() => {
  sheet?.close();
  sheet = undefined;
  document.body.innerHTML = "";
});

const q = (sel) => document.querySelector(sel);
const qa = (sel) => [...document.querySelectorAll(sel)];
const inputOf = (optionId) => q(`[data-opcion="${optionId}"] input`);
const click = (node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
const add = () => q(".opciones-agregar");
const total = () => q(".opciones-total").textContent;

describe("reglas de cada grupo — PUBLICO-45", () => {
  it.each([
    [{ min: 0, max: 1 }, "Opcional, hasta 1"],
    [{ min: 0, max: 3 }, "Opcional, hasta 3"],
    [{ min: 1, max: 1 }, "Obligatorio"],
    [{ min: 2, max: 2 }, "Obligatorio: elegí 2"],
    [{ min: 1, max: 3 }, "Obligatorio: elegí de 1 a 3"],
  ])("%j dice '%s'", (group, text) => {
    expect(ruleText(group, t)).toBe(text);
  });

  it("radio si el máximo es 1, casillas si es mayor, contador si permite repetir", () => {
    expect(controlKind(punto)).toBe("radio");
    expect(controlKind(extras)).toBe("checkbox");
    expect(controlKind(sabores)).toBe("counter");
    expect(controlKind({ max: 1, repetir: true })).toBe("radio");
  });
});

describe("la hoja — PUBLICO-45", () => {
  it("muestra un grupo por bloque con su título y su regla, y el producto como título", () => {
    open(hamburguesa);

    expect(q('[role="dialog"]').getAttribute("aria-label")).toBe("Hamburguesa");
    expect(qa(".opciones-grupo-titulo").map((n) => n.textContent)).toEqual(["Punto", "Extras"]);
    expect(qa(".opciones-regla").map((n) => n.textContent)).toEqual(["Obligatorio", "Opcional, hasta 2"]);
    expect(qa('[data-grupo="g-punto"] input').every((i) => i.type === "radio")).toBe(true);
    expect(qa('[data-grupo="g-extras"] input').every((i) => i.type === "checkbox")).toBe(true);
  });

  it("empieza con el precio del producto y 'Agregar' deshabilitado si falta un obligatorio", () => {
    open(hamburguesa);

    expect(total()).toBe("Total $1.000");
    expect(add().disabled).toBe(true);
  });

  it("el precio total sube en vivo con los extras y 'Agregar' se habilita al ser válido", () => {
    open(hamburguesa);

    click(inputOf("o-jugoso"));
    expect(add().disabled).toBe(false);
    expect(total()).toBe("Total $1.000");

    click(inputOf("o-queso"));
    expect(total()).toBe("Total $1.500");

    click(inputOf("o-panceta"));
    expect(total()).toBe("Total $2.300");

    click(inputOf("o-queso"));
    expect(total()).toBe("Total $1.800");
  });

  it("muestra el extra de cada opción solo si cuesta algo", () => {
    open(hamburguesa);

    expect(q('[data-opcion="o-queso"] .opcion-precio').textContent).toBe("+$500");
    expect(q('[data-opcion="o-jugoso"] .opcion-precio').textContent).toBe("");
  });

  it("una opción agotada queda deshabilitada y con 'Sin stock'", () => {
    open(hamburguesa);

    expect(inputOf("o-huevo").disabled).toBe(true);
    expect(q('[data-opcion="o-huevo"] .opcion-agotada').textContent).toBe("Sin stock");
    expect(q('[data-opcion="o-huevo"]').classList.contains("agotada")).toBe(true);
    expect(q('[data-opcion="o-queso"] .opcion-agotada')).toBeNull();
  });

  it("en un radio, elegir otra opción reemplaza a la anterior", () => {
    open(hamburguesa);
    click(inputOf("o-jugoso"));
    click(inputOf("o-cocido"));

    expect(inputOf("o-jugoso").checked).toBe(false);
    expect(inputOf("o-cocido").checked).toBe(true);
  });

  it("al llegar al máximo, las casillas que faltan se apagan; al soltar una, se prenden", () => {
    const tres = {
      id: "g-tres", nombre: "Salsas", min: 0, max: 2, repetir: false,
      opciones: ["a", "b", "c"].map((id) => ({ id: `o-${id}`, nombre: id, precio: 0, agotado: false })),
    };
    open({ id: "p", nombre: "Papas", precio: 100, opciones: [tres] });

    click(inputOf("o-a"));
    click(inputOf("o-b"));
    expect(inputOf("o-c").disabled).toBe(true);
    expect(inputOf("o-a").disabled).toBe(false);

    click(inputOf("o-b"));
    expect(inputOf("o-c").disabled).toBe(false);
  });

  it("un grupo opcional de un solo lugar se puede dejar vacío tocando de nuevo", () => {
    const salsa = {
      id: "g-salsa", nombre: "Salsa", min: 0, max: 1, repetir: false,
      opciones: [{ id: "o-mayo", nombre: "Mayonesa", precio: 50, agotado: false }],
    };
    open({ id: "p", nombre: "Papas", precio: 100, opciones: [salsa] });

    expect(add().disabled).toBe(false);
    click(inputOf("o-mayo"));
    expect(total()).toBe("Total $150");
    click(inputOf("o-mayo"));
    expect(total()).toBe("Total $100");
    expect(inputOf("o-mayo").checked).toBe(false);
  });

  it("'Agregar' entrega la elección con grupo, nombre, cantidad y precio, y cierra la hoja", () => {
    const { onAdd } = open(hamburguesa);
    click(inputOf("o-cocido"));
    click(inputOf("o-queso"));
    click(add());

    expect(onAdd).toHaveBeenCalledWith([
      { id: "o-cocido", grupo: "Punto", nombre: "Cocido", cantidad: 1, precio: 0 },
      { id: "o-queso", grupo: "Extras", nombre: "Queso", cantidad: 1, precio: 500 },
    ]);
    expect(q(".opciones-overlay")).toBeNull();
  });

  it("con 'Agregar' deshabilitado, tocarlo no agrega nada", () => {
    const { onAdd } = open(hamburguesa);
    click(add());

    expect(onAdd).not.toHaveBeenCalled();
    expect(q(".opciones-overlay")).not.toBeNull();
  });
});

describe("grupos que permiten repetir — PUBLICO-45", () => {
  const more = (id) => q(`[data-opcion="${id}"] .opcion-mas`);
  const less = (id) => q(`[data-opcion="${id}"] .opcion-menos`);
  const count = (id) => q(`[data-opcion="${id}"] .opcion-cantidad`).textContent;

  it("el contador suma y resta, y no pasa del máximo del grupo", () => {
    open(helado);

    expect(add().disabled).toBe(true);
    click(more("o-frutilla"));
    click(more("o-frutilla"));
    click(more("o-limon"));

    expect(count("o-frutilla")).toBe("2");
    expect(count("o-limon")).toBe("1");
    expect(more("o-frutilla").disabled).toBe(true);
    expect(more("o-limon").disabled).toBe(true);
    expect(total()).toBe("Total $3.100");
    expect(add().disabled).toBe(false);

    click(less("o-frutilla"));
    expect(count("o-frutilla")).toBe("1");
    expect(more("o-limon").disabled).toBe(false);
  });

  it("el menos está apagado en cero y la elección entrega cantidades", () => {
    const { onAdd } = open(helado);

    expect(less("o-frutilla").disabled).toBe(true);
    click(more("o-frutilla"));
    click(more("o-frutilla"));
    click(add());

    expect(onAdd).toHaveBeenCalledWith([{ id: "o-frutilla", grupo: "Sabores", nombre: "Frutilla", cantidad: 2, precio: 0 }]);
  });

  it("el botón + de una opción agotada está apagado", () => {
    open({ ...helado, opciones: [{ ...sabores, opciones: [{ ...sabores.opciones[0], agotado: true }, sabores.opciones[1]] }] });
    expect(more("o-frutilla").disabled).toBe(true);
    expect(q('[data-opcion="o-frutilla"] .opcion-agotada').textContent).toBe("Sin stock");
  });

  it("los botones tienen un nombre accesible con la opción", () => {
    open(helado);
    expect(more("o-limon").getAttribute("aria-label")).toBe("Sumar Limón");
    expect(less("o-limon").getAttribute("aria-label")).toBe("Restar Limón");
  });
});

describe("cerrar la hoja", () => {
  it("con la cruz, tocando afuera o con Escape; sin agregar nada", () => {
    const onClose = vi.fn();
    const { onAdd } = open(hamburguesa, { onClose });

    click(q(".opciones-cerrar"));
    expect(q(".opciones-overlay")).toBeNull();

    open(hamburguesa, { onClose });
    click(q(".opciones-overlay"));
    expect(q(".opciones-overlay")).toBeNull();

    open(hamburguesa, { onClose });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(q(".opciones-overlay")).toBeNull();

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("tocar dentro de la hoja no la cierra", () => {
    open(hamburguesa);
    click(q(".opciones-hoja"));
    expect(q(".opciones-overlay")).not.toBeNull();
  });
});

describe("datos del negocio — PUBLICO-49", () => {
  it("nombres de grupos y opciones se escriben como texto, nunca como HTML", () => {
    const peligroso = {
      id: "p", nombre: "<img src=x onerror=alert(1)>", precio: 1,
      opciones: [
        {
          id: "g", nombre: "<b>Grupo</b>", min: 0, max: 1, repetir: false,
          opciones: [{ id: "o", nombre: "<script>alert(1)</script>", precio: 0, agotado: false }],
        },
      ],
    };
    open(peligroso);

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(q(".opciones-titulo").textContent).toBe("<img src=x onerror=alert(1)>");
    expect(q(".opcion-nombre").textContent).toBe("<script>alert(1)</script>");
  });
});

describe("textos — PUBLICO-49", () => {
  const keys = [
    "options.required", "options.requiredN", "options.requiredRange", "options.optionalUpTo",
    "options.add", "options.total", "options.close", "options.more", "options.less", "error.invalidOptions",
  ];

  it.each(keys)("%s está en los tres idiomas", (key) => {
    for (const lang of LANGS) expect(DICTIONARY[lang][key], `${key} (${lang})`).toBeTruthy();
  });

  it("los textos con datos llevan sus lugares en todos los idiomas", () => {
    for (const lang of LANGS) {
      expect(DICTIONARY[lang]["options.requiredN"]).toContain("{n}");
      expect(DICTIONARY[lang]["options.requiredRange"]).toContain("{min}");
      expect(DICTIONARY[lang]["options.requiredRange"]).toContain("{max}");
      expect(DICTIONARY[lang]["options.optionalUpTo"]).toContain("{max}");
      expect(DICTIONARY[lang]["options.more"]).toContain("{name}");
      expect(DICTIONARY[lang]["options.less"]).toContain("{name}");
    }
  });
});
