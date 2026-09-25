import { describe, expect, it } from "vitest";

import { toProductInsert, toProductUpdate } from "./product-fields";

describe("toProductInsert — ADMIN-MENU-1", () => {
  it("arma la fila con negocio y categoría", () => {
    expect(
      toProductInsert("b1", {
        category_id: "c1",
        name: "Café",
        description: "Con leche",
        price: 3500,
        active: false,
      }),
    ).toEqual({
      business_id: "b1",
      category_id: "c1",
      name: "Café",
      description: "Con leche",
      price: 3500,
      active: false,
    });
  });

  it("guarda la descripción vacía o ausente como nula", () => {
    expect(
      toProductInsert("b1", { category_id: "c1", name: "A", price: 1 })
        .description,
    ).toBeNull();
    expect(
      toProductInsert("b1", {
        category_id: "c1",
        name: "A",
        description: "",
        price: 1,
      }).description,
    ).toBeNull();
  });

  it("un producto nuevo nace activo si no se indica", () => {
    expect(
      toProductInsert("b1", { category_id: "c1", name: "A", price: 1 }).active,
    ).toBe(true);
  });
});

describe("toProductUpdate — ADMIN-MENU-2", () => {
  it("no toca la categoría si no se indica", () => {
    const row = toProductUpdate({ name: "Café", price: 3500, active: true });
    expect(row).not.toHaveProperty("category_id");
  });

  it("no toca el negocio: el filtro de negocio va en la consulta", () => {
    const row = toProductUpdate({ name: "Café", price: 3500 });
    expect(row).not.toHaveProperty("business_id");
  });

  it("cambia la categoría solo si se indica otra", () => {
    expect(
      toProductUpdate({ category_id: "c2", name: "Café", price: 1 }).category_id,
    ).toBe("c2");
  });

  it("normaliza la descripción vacía a nula", () => {
    expect(
      toProductUpdate({ name: "A", description: "", price: 1 }).description,
    ).toBeNull();
  });

  it("no cambia 'active' si no se indica", () => {
    expect(toProductUpdate({ name: "A", price: 1 })).not.toHaveProperty(
      "active",
    );
  });
});
