import { describe, expect, it } from "vitest";

import { hasTranslations, toTranslationColumns } from "./translations";
import { toProductInsert, toProductUpdate } from "./product-fields";

// IDIOMA-8
describe("traducciones del menú", () => {
  it("guarda el texto sin espacios de sobra y deja nulo lo vacío", () => {
    expect(
      toTranslationColumns({
        name_en: " Burger ",
        name_pt: "  ",
        description_en: "",
      }),
    ).toEqual({
      name_en: "Burger",
      name_pt: null,
      description_en: null,
      description_pt: null,
    });
  });

  it("detecta si hay alguna traducción cargada", () => {
    expect(hasTranslations({ name_pt: "Hambúrguer" })).toBe(true);
    expect(hasTranslations({ name_pt: "  " })).toBe(false);
    expect(hasTranslations(null)).toBe(false);
  });

  it("el producto las lleva al crear y al editar", () => {
    const input = { name: "Hamburguesa", price: 10, name_en: "Burger" };

    expect(toProductInsert("b1", { ...input, category_id: "c1" }).name_en).toBe(
      "Burger",
    );
    expect(toProductUpdate(input)).toMatchObject({
      name_en: "Burger",
      name_pt: null,
    });
  });
});
