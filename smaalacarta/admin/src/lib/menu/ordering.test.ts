import { describe, expect, it } from "vitest";

import { moveItem, sortByOrder, toOrderRows } from "./ordering";

const item = (id: string, sort_order: number | null, created_at: string) => ({
  id,
  sort_order,
  created_at,
});

describe("sortByOrder — ADMIN-MENU-3", () => {
  it("ordena por la posición que definió el negocio", () => {
    const items = [item("c", 2, "2026-01-01"), item("a", 0, "2026-03-01"), item("b", 1, "2026-02-01")];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("los que no tienen orden van al final", () => {
    const items = [item("sin", null, "2026-01-01"), item("b", 1, "2026-02-01"), item("a", 0, "2026-03-01")];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["a", "b", "sin"]);
  });

  it("entre los que no tienen orden, del más viejo al más nuevo", () => {
    const items = [item("nuevo", null, "2026-03-01"), item("viejo", null, "2026-01-01"), item("medio", null, "2026-02-01")];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["viejo", "medio", "nuevo"]);
  });

  it("un elemento nuevo (sin orden) queda después de los ordenados", () => {
    const items = [item("nuevo", null, "2026-09-01"), item("a", 0, "2026-01-01"), item("b", 1, "2026-01-02")];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["a", "b", "nuevo"]);
  });

  it("con el mismo orden, desempata por fecha y después por id", () => {
    const items = [item("z", 0, "2026-01-01"), item("a", 0, "2026-01-01"), item("m", 0, "2025-12-01")];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["m", "a", "z"]);
  });

  it("no modifica la lista original", () => {
    const items = [item("b", 1, "2026-01-01"), item("a", 0, "2026-01-01")];
    sortByOrder(items);
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("tolera fechas ausentes", () => {
    const items = [{ id: "b", sort_order: null }, { id: "a", sort_order: null }];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("moveItem", () => {
  const ids = ["a", "b", "c", "d"];

  it("mueve un elemento hacia adelante", () => {
    expect(moveItem(ids, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("mueve un elemento hacia atrás", () => {
    expect(moveItem(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("soltarlo sobre sí mismo no cambia nada", () => {
    expect(moveItem(ids, "b", "b")).toEqual(ids);
  });

  it("con un id desconocido no cambia nada", () => {
    expect(moveItem(ids, "x", "b")).toEqual(ids);
    expect(moveItem(ids, "b", "x")).toEqual(ids);
  });

  it("no modifica la lista original", () => {
    moveItem(ids, "a", "d");
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
});

describe("toOrderRows — ADMIN-MENU-4", () => {
  it("numera desde 0 en el orden dado", () => {
    expect(toOrderRows(["x", "y", "z"])).toEqual([
      { id: "x", sort_order: 0 },
      { id: "y", sort_order: 1 },
      { id: "z", sort_order: 2 },
    ]);
  });

  it("una lista vacía no genera filas", () => {
    expect(toOrderRows([])).toEqual([]);
  });
});
