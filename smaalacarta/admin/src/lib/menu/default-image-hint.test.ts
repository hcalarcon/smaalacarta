import { describe, expect, it } from "vitest";

import { defaultImageHint } from "./default-image-hint";

const suggestion = { name: "Hamburguesa", imageUrl: "https://x.test/hamburguesa.svg" };

describe("defaultImageHint — ADMIN-CONFIG-32", () => {
  it("con imagen propia no muestra nada", () => {
    expect(defaultImageHint({ hasOwnImage: true, enabled: true, suggestion, hasLogo: true })).toBeNull();
  });

  it("sin imagen propia y con coincidencia, muestra la ilustración", () => {
    const hint = defaultImageHint({ hasOwnImage: false, enabled: true, suggestion, hasLogo: true });
    expect(hint).toMatchObject({ kind: "illustration", imageUrl: suggestion.imageUrl });
    expect(hint?.text).toContain("Hamburguesa");
    expect(hint?.text).toContain("la reemplaza");
  });

  it("sin coincidencia, se verá el logo del negocio", () => {
    const hint = defaultImageHint({ hasOwnImage: false, enabled: true, suggestion: null, hasLogo: true });
    expect(hint).toMatchObject({ kind: "logo" });
    expect(hint?.text).toContain("logo de tu negocio");
  });

  it("con el interruptor apagado, se verá el logo aunque haya coincidencia", () => {
    const hint = defaultImageHint({ hasOwnImage: false, enabled: false, suggestion, hasLogo: true });
    expect(hint?.kind).toBe("logo");
    expect(hint && "imageUrl" in hint).toBe(false);
  });

  it("sin logo del negocio, se verá el de SMA a la Carta", () => {
    const hint = defaultImageHint({ hasOwnImage: false, enabled: true, suggestion: null, hasLogo: false });
    expect(hint?.text).toContain("SMA a la Carta");
  });
});
