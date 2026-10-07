import { describe, expect, it } from "vitest";

import {
  chosenOptions,
  describeChosen,
  extrasTotal,
  groupCount,
  hasOptions,
  lineSignature,
  requiresOptions,
  selectionFromChosen,
  toOrderOptions,
  unitPrice,
  validateSelection,
} from "./options.js";

const punto = {
  id: "g-punto",
  nombre: "Punto",
  min: 1,
  max: 1,
  repetir: false,
  opciones: [
    { id: "o-jugoso", nombre: "Jugoso", precio: 0, agotado: false },
    { id: "o-cocido", nombre: "Cocido", precio: 0, agotado: false },
  ],
};
const extras = {
  id: "g-extras",
  nombre: "Extras",
  min: 0,
  max: 2,
  repetir: false,
  opciones: [
    { id: "o-queso", nombre: "Queso", precio: 500, agotado: false },
    { id: "o-panceta", nombre: "Panceta", precio: 800, agotado: false },
    { id: "o-huevo", nombre: "Huevo", precio: 0, agotado: true },
  ],
};
const sabores = {
  id: "g-sabores",
  nombre: "Sabores",
  min: 1,
  max: 3,
  repetir: true,
  opciones: [
    { id: "o-frutilla", nombre: "Frutilla", precio: 0, agotado: false },
    { id: "o-limon", nombre: "Limón", precio: 0, agotado: false },
  ],
};

const hamburguesa = [punto, extras];
const errorsOf = (groups, selection) => validateSelection(groups, selection).errors;

describe("hasOptions y requiresOptions — PUBLICO-44", () => {
  it("un producto tiene opciones si el menú le trae grupos", () => {
    expect(hasOptions({ opciones: hamburguesa })).toBe(true);
    expect(hasOptions({ opciones: [] })).toBe(false);
    expect(hasOptions({})).toBe(false);
    expect(hasOptions(null)).toBe(false);
  });

  it("exige elegir solo si algún grupo tiene un mínimo de 1 o más", () => {
    expect(requiresOptions({ opciones: hamburguesa })).toBe(true);
    expect(requiresOptions({ opciones: [extras] })).toBe(false);
    expect(requiresOptions({})).toBe(false);
  });
});

describe("validateSelection — PUBLICO-44", () => {
  it("acepta una elección que cumple todos los grupos", () => {
    expect(validateSelection(hamburguesa, { "o-jugoso": 1, "o-queso": 1 })).toEqual({ ok: true, errors: {} });
    expect(validateSelection(hamburguesa, { "o-cocido": 1 }).ok).toBe(true);
  });

  it("un grupo obligatorio sin elegir falla con 'min'", () => {
    expect(errorsOf(hamburguesa, {})).toEqual({ "g-punto": "min" });
    expect(errorsOf(hamburguesa, { "o-queso": 1 })).toEqual({ "g-punto": "min" });
  });

  it("elegir más que el máximo falla con 'max'", () => {
    expect(errorsOf(hamburguesa, { "o-jugoso": 1, "o-cocido": 1 })).toEqual({ "g-punto": "max" });
    const tres = { "o-jugoso": 1, "o-queso": 1, "o-panceta": 1, "o-huevo": 0 };
    expect(validateSelection(hamburguesa, tres).ok).toBe(true);
  });

  it("un grupo opcional se puede dejar vacío", () => {
    expect(validateSelection([extras], {}).ok).toBe(true);
  });

  it("repetir una opción solo vale si el grupo lo permite", () => {
    expect(errorsOf([extras], { "o-queso": 2 })).toEqual({ "g-extras": "repeat" });
    expect(validateSelection([sabores], { "o-frutilla": 3 }).ok).toBe(true);
    expect(errorsOf([sabores], { "o-frutilla": 2, "o-limon": 2 })).toEqual({ "g-sabores": "max" });
  });

  it("una opción agotada no se puede elegir", () => {
    expect(errorsOf([extras], { "o-huevo": 1 })).toEqual({ "g-extras": "soldOut" });
  });

  it("una opción que no es de ningún grupo del producto es 'unknown'", () => {
    expect(errorsOf(hamburguesa, { "o-jugoso": 1, "o-fantasma": 1 })._).toBe("unknown");
    // Cantidad 0 equivale a no elegirla.
    expect(validateSelection(hamburguesa, { "o-jugoso": 1, "o-fantasma": 0 }).ok).toBe(true);
  });

  it("un producto sin grupos acepta no elegir nada", () => {
    expect(validateSelection([], {}).ok).toBe(true);
    expect(validateSelection(undefined, undefined).ok).toBe(true);
  });
});

describe("groupCount", () => {
  it("suma las cantidades elegidas en el grupo, repeticiones incluidas", () => {
    expect(groupCount(sabores, { "o-frutilla": 2, "o-limon": 1, "o-queso": 5 })).toBe(3);
    expect(groupCount(sabores, {})).toBe(0);
  });
});

describe("chosenOptions, precio y firma — PUBLICO-44 y 46", () => {
  const selection = { "o-panceta": 1, "o-jugoso": 1 };

  it("lista lo elegido en el orden del menú, con grupo, nombre, cantidad y precio", () => {
    expect(chosenOptions(hamburguesa, selection)).toEqual([
      { id: "o-jugoso", grupo: "Punto", nombre: "Jugoso", cantidad: 1, precio: 0 },
      { id: "o-panceta", grupo: "Extras", nombre: "Panceta", cantidad: 1, precio: 800 },
    ]);
  });

  it("suma el extra por la cantidad: 2 de Frutilla + $300 de topping", () => {
    const toppings = {
      id: "g-top", nombre: "Toppings", min: 0, max: 2, repetir: true,
      opciones: [{ id: "o-choco", nombre: "Chocolate", precio: 300, agotado: false }],
    };
    const chosen = chosenOptions([sabores, toppings], { "o-frutilla": 2, "o-choco": 2 });

    expect(extrasTotal(chosen)).toBe(600);
    expect(unitPrice(3000, chosen)).toBe(3600);
  });

  it("sin extras el precio es el del producto", () => {
    expect(unitPrice(1000, [])).toBe(1000);
    expect(unitPrice("1000", undefined)).toBe(1000);
    expect(unitPrice(1000, chosenOptions(hamburguesa, { "o-jugoso": 1 }))).toBe(1000);
  });

  it("ignora las cantidades en 0 o que no son un número", () => {
    expect(chosenOptions(hamburguesa, { "o-jugoso": 0, "o-queso": "x" })).toEqual([]);
  });

  it("la firma no depende del orden en que se eligió", () => {
    const a = chosenOptions(hamburguesa, { "o-queso": 1, "o-jugoso": 1 });
    const b = [...a].reverse();

    expect(lineSignature("p1", a)).toBe(lineSignature("p1", b));
  });

  it("otra elección, otro producto o otra cantidad dan otra firma", () => {
    const base = chosenOptions(hamburguesa, { "o-jugoso": 1, "o-queso": 1 });

    expect(lineSignature("p1", base)).not.toBe(lineSignature("p1", chosenOptions(hamburguesa, { "o-cocido": 1, "o-queso": 1 })));
    expect(lineSignature("p1", base)).not.toBe(lineSignature("p2", base));
    expect(lineSignature("p1", chosenOptions([sabores], { "o-frutilla": 1 }))).not.toBe(
      lineSignature("p1", chosenOptions([sabores], { "o-frutilla": 2 })),
    );
  });

  it("sin opciones la firma es la del producto solo (carritos viejos)", () => {
    expect(lineSignature("p1", [])).toBe(lineSignature("p1", undefined));
    expect(lineSignature("p1", [])).toBe("p1|");
  });

  it("al servidor solo viajan ids y cantidades, nunca precios", () => {
    const chosen = chosenOptions(hamburguesa, { "o-jugoso": 1, "o-queso": 2 });
    expect(toOrderOptions(chosen)).toEqual([
      { id: "o-jugoso", quantity: 1 },
      { id: "o-queso", quantity: 2 },
    ]);
    expect(toOrderOptions(chosen).every((o) => Object.keys(o).sort().join() === "id,quantity")).toBe(true);
  });

  it("vuelve de la lista a una elección", () => {
    const chosen = chosenOptions(hamburguesa, selection);
    expect(selectionFromChosen(chosen)).toEqual(selection);
    expect(selectionFromChosen(undefined)).toEqual({});
  });

  it("el texto corto agrega ×N solo si se repite", () => {
    const chosen = chosenOptions([sabores, extras], { "o-frutilla": 2, "o-queso": 1 });
    expect(describeChosen(chosen)).toBe("Frutilla ×2, Queso");
    expect(describeChosen([])).toBe("");
  });
});
