// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEMO_NOTE, DEMO_PHONE, CLIENTE, pickProducts, planGroup } from "./demo.mjs";

const grupo = (extra) => ({ id: "g", nombre: "Tamaño", min: 1, max: 1, opciones: [{ id: "o1", nombre: "Chico" }, { id: "o2", nombre: "Grande" }], ...extra });

describe("planGroup", () => {
  it("un grupo opcional no pide nada", () => {
    expect(planGroup(grupo({ min: 0 }))).toEqual([]);
  });

  it("salta las opciones agotadas", () => {
    const g = grupo({ opciones: [{ id: "o1", nombre: "Chico", agotado: true }, { id: "o2", nombre: "Grande" }] });
    expect(planGroup(g)).toEqual([{ nombre: "Grande", veces: 1 }]);
  });

  it("en un grupo con contador suma el mínimo de la misma opción", () => {
    expect(planGroup(grupo({ min: 2, max: 3, repetir: true }))).toEqual([{ nombre: "Chico", veces: 2 }]);
  });

  it("si no alcanzan las opciones, es imposible", () => {
    expect(planGroup(grupo({ min: 3, max: 3 }))).toBeNull();
  });
});

describe("pickProducts", () => {
  const menu = {
    categorias: [
      { nombre: "Pizzas", items: [{ id: "1", nombre: "Muzza", precio: 100 }, { id: "2", nombre: "Napo", precio: 120 }] },
      { nombre: "Bebidas", items: [{ id: "3", nombre: "Agua", precio: 10, agotado: true }, { id: "4", nombre: "Gaseosa", precio: 20 }] },
      { nombre: "Empanadas", items: [{ id: "5", nombre: "Carne", precio: 30, opciones: [grupo()] }] },
    ],
  };

  it("elige un producto con opciones y dos simples de categorías distintas, sin agotados", () => {
    const { conOpciones, simples } = pickProducts(menu);
    expect(conOpciones.item.nombre).toBe("Carne");
    expect(simples.map((s) => s.item.nombre)).toEqual(["Muzza", "Gaseosa"]);
  });

  it("sin producto con opciones completable, no lo inventa", () => {
    expect(pickProducts({ categorias: [{ nombre: "A", items: [{ nombre: "X", precio: 1 }] }] }).conOpciones).toBeNull();
  });
});

describe("marcado del pedido demo", () => {
  it("el cliente lleva el teléfono y la nota que usa --borrar", () => {
    expect(CLIENTE.telefono).toBe(DEMO_PHONE);
    expect(CLIENTE.notas).toContain(DEMO_NOTE);
  });
});
