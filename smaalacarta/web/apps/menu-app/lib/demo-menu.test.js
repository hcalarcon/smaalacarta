import { describe, expect, it } from "vitest";

import { getDemoMenu } from "./demo-menu.js";

describe("getDemoMenu — ESTATICO-6", () => {
  it.each(["moderno", "clasico", "minimal"])("trae el menú de la demo %s", (slug) => {
    const r = getDemoMenu(slug);

    expect(r.config.nombre).toMatch(/./);
    expect(r.config.template).toBe(slug);
    expect(r.menu.categorias.length).toBeGreaterThan(0);
  });

  // PUBLICO-17: un dueño que prueba la demo (p. ej. desde la tarjeta de visita) tiene que
  // poder hacer el pedido a cualquier hora; con horarios, fuera de hora dice "Cerrado ahora".
  it.each(["moderno", "clasico", "minimal"])("la demo %s no trae horarios: siempre abierta", (slug) => {
    expect(getDemoMenu(slug).config.horarios).toBeUndefined();
  });

  it("null si no es una demo conocida", () => {
    expect(getDemoMenu("no-existe")).toBeNull();
    expect(getDemoMenu(null)).toBeNull();
    expect(getDemoMenu(undefined)).toBeNull();
  });
});
