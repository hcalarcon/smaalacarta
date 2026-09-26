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
      image_url: null,
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

describe("imagen del producto — ADMIN-MENU-6", () => {
  it("un producto nuevo puede llevar imagen", () => {
    expect(
      toProductInsert("b1", {
        category_id: "c1",
        name: "A",
        price: 1,
        image_url: "https://x.supabase.co/storage/v1/object/public/business-images/b1/a.png",
      }).image_url,
    ).toBe("https://x.supabase.co/storage/v1/object/public/business-images/b1/a.png");
  });

  it("sin imagen queda nula", () => {
    expect(toProductInsert("b1", { category_id: "c1", name: "A", price: 1 }).image_url).toBeNull();
    expect(
      toProductInsert("b1", { category_id: "c1", name: "A", price: 1, image_url: "" }).image_url,
    ).toBeNull();
  });

  it("editar sin indicar la imagen la conserva", () => {
    expect(toProductUpdate({ name: "A", price: 1 })).not.toHaveProperty("image_url");
  });

  it("editar con una imagen nueva la cambia", () => {
    expect(toProductUpdate({ name: "A", price: 1, image_url: "https://x.com/n.png" }).image_url).toBe(
      "https://x.com/n.png",
    );
  });

  it("quitarla (nula o vacía) la deja en blanco", () => {
    expect(toProductUpdate({ name: "A", price: 1, image_url: null }).image_url).toBeNull();
    expect(toProductUpdate({ name: "A", price: 1, image_url: "" }).image_url).toBeNull();
  });
});
