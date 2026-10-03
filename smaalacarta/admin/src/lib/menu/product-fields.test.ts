import { describe, expect, it } from "vitest";

import {
  matchesStatusFilter,
  productStatus,
  toProductInsert,
  toProductUpdate,
} from "./product-fields";

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
      featured: false,
      sold_out: false,
      name_en: null,
      name_pt: null,
      description_en: null,
      description_pt: null,
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

describe("destacado — ADMIN-MENU-7", () => {
  it("un producto nuevo nace sin destacar si no se indica", () => {
    expect(
      toProductInsert("b1", { category_id: "c1", name: "A", price: 1 }).featured,
    ).toBe(false);
  });

  it("un producto nuevo puede nacer destacado", () => {
    expect(
      toProductInsert("b1", { category_id: "c1", name: "A", price: 1, featured: true })
        .featured,
    ).toBe(true);
  });

  it("editar sin indicar 'featured' lo conserva", () => {
    expect(toProductUpdate({ name: "A", price: 1 })).not.toHaveProperty("featured");
  });

  it("editar cambia 'featured' si se indica", () => {
    expect(toProductUpdate({ name: "A", price: 1, featured: true }).featured).toBe(true);
    expect(toProductUpdate({ name: "A", price: 1, featured: false }).featured).toBe(false);
  });
});

describe("traducciones — IDIOMA-8 y IDIOMA-9", () => {
  it("guarda las traducciones sin espacios de sobra", () => {
    const row = toProductInsert("b1", {
      category_id: "c1",
      name: "Café",
      price: 1,
      name_en: "  Coffee ",
      description_pt: " Com leite ",
    });
    expect(row.name_en).toBe("Coffee");
    expect(row.description_pt).toBe("Com leite");
    expect(row.name_pt).toBeNull();
  });

  it("al editar, una traducción vacía o solo espacios queda nula", () => {
    const row = toProductUpdate({
      name: "A",
      price: 1,
      name_en: "",
      description_en: "   ",
    });
    expect(row.name_en).toBeNull();
    expect(row.description_en).toBeNull();
  });
});

describe("producto sin stock — ADMIN-MENU-8", () => {
  it("un producto nuevo nace con stock si no se indica", () => {
    expect(toProductInsert("b1", { category_id: "c1", name: "A", price: 1 }).sold_out).toBe(false);
  });

  it("se puede crear ya sin stock", () => {
    expect(
      toProductInsert("b1", { category_id: "c1", name: "A", price: 1, sold_out: true }).sold_out,
    ).toBe(true);
  });

  it("editar sin indicar sold_out no lo toca", () => {
    // Si no, guardar el formulario de un producto sin stock le devolvería el stock.
    expect(toProductUpdate({ name: "A", price: 1 })).not.toHaveProperty("sold_out");
  });

  it("editar con sold_out lo cambia, en las dos direcciones", () => {
    expect(toProductUpdate({ name: "A", price: 1, sold_out: true }).sold_out).toBe(true);
    expect(toProductUpdate({ name: "A", price: 1, sold_out: false }).sold_out).toBe(false);
  });
});

describe("estado del producto en el panel — ADMIN-MENU-9", () => {
  it("Oculto gana a Sin stock: un producto oculto no se ve en el menú", () => {
    expect(productStatus({ active: false, sold_out: true })).toBe("hidden");
    expect(productStatus({ active: false, sold_out: false })).toBe("hidden");
  });

  it("activo y sin stock es 'sold_out', distinto de Oculto", () => {
    expect(productStatus({ active: true, sold_out: true })).toBe("sold_out");
  });

  it("activo y con stock está disponible", () => {
    expect(productStatus({ active: true, sold_out: false })).toBe("available");
  });

  it("un producto sin el dato de stock (anterior a la columna) está disponible", () => {
    expect(productStatus({ active: true })).toBe("available");
  });

  it.each([
    ["all", { active: false, sold_out: false }, true],
    ["active", { active: true, sold_out: false }, true],
    ["active", { active: true, sold_out: true }, true],
    ["active", { active: false, sold_out: false }, false],
    ["hidden", { active: false, sold_out: true }, true],
    ["hidden", { active: true, sold_out: false }, false],
    ["sold_out", { active: true, sold_out: true }, true],
    ["sold_out", { active: false, sold_out: true }, false],
    ["sold_out", { active: true, sold_out: false }, false],
  ] as const)("el filtro %s con %j da %s", (filter, product, expected) => {
    expect(matchesStatusFilter(product, filter)).toBe(expected);
  });
});
