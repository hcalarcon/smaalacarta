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
      "preparacion",
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

  it("ENVIO-58: Envíos solo aparece con el envío con repartidor, antes de la contraseña", () => {
    const withCourier = settingsSections({ digitalMenu: true, pdfService: false, courierDelivery: true }).map(
      (section) => section.id,
    );

    expect(withCourier.slice(-2)).toEqual(["envios", "contrasena"]);
    expect(ids(true, true)).not.toContain("envios");
  });

  it("MP-15: Mercado Pago solo aparece con la conexión habilitada, antes de la contraseña", () => {
    const withMp = settingsSections({ digitalMenu: true, pdfService: false, mercadoPago: true }).map(
      (section) => section.id,
    );

    expect(withMp.slice(-2)).toEqual(["mercadopago", "contrasena"]);
    expect(ids(true, true)).not.toContain("mercadopago");
  });
});
