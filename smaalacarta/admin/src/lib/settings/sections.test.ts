import { describe, expect, it } from "vitest";

import { settingsSections } from "./sections";

const ids = (digitalMenu: boolean, pdfService: boolean) =>
  settingsSections({ digitalMenu, pdfService }).map((section) => section.id);

describe("settingsSections (ADMIN-CONFIG-22)", () => {
  it("con menú digital y PDF muestra todas, en el orden de la pantalla", () => {
    expect(ids(true, true)).toEqual([
      "datos",
      "compartir",
      "publicacion",
      "apariencia",
      "pdf",
      "horarios",
      "anticipados",
      "cierre",
      "entrega-pago",
      "programados",
      "contacto",
      "contrasena",
    ]);
  });

  it("solo con PDF deja las básicas y el PDF", () => {
    expect(ids(false, true)).toEqual(["datos", "compartir", "pdf", "contrasena"]);
  });

  it("solo con menú digital no incluye el PDF", () => {
    expect(ids(true, false)).not.toContain("pdf");
    expect(ids(true, false)).toContain("horarios");
  });

  it("sin servicios deja datos, compartir y contraseña", () => {
    expect(ids(false, false)).toEqual(["datos", "compartir", "contrasena"]);
  });
});
