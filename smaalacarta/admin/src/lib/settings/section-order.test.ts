import { describe, expect, it } from "vitest";

import { orderSettingsSections, parseSectionOrder } from "./section-order";

const sections = [
  { id: "datos", label: "Datos del negocio" },
  { id: "horarios", label: "Horarios" },
  { id: "contrasena", label: "Contraseña" },
];

describe("orderSettingsSections — ADMIN-CONFIG-51", () => {
  it("aplica el orden guardado, ignora ids repetidos o ya no disponibles y agrega las secciones nuevas al final", () => {
    expect(
      orderSettingsSections(
        [...sections, { id: "contacto", label: "Contacto" }],
        ["horarios", "inexistente", "horarios", "datos"],
      ).map(({ id }) => id),
    ).toEqual(["horarios", "datos", "contrasena", "contacto"]);
  });

  it("usa el orden original si no hay una preferencia", () => {
    expect(orderSettingsSections(sections, []).map(({ id }) => id)).toEqual([
      "datos",
      "horarios",
      "contrasena",
    ]);
  });
});

describe("parseSectionOrder", () => {
  it("acepta solo un arreglo JSON de ids", () => {
    expect(parseSectionOrder('["horarios","datos"]')).toEqual(["horarios", "datos"]);
    expect(parseSectionOrder(null)).toEqual([]);
    expect(parseSectionOrder("{")).toEqual([]);
    expect(parseSectionOrder('["horarios",1]')).toEqual([]);
  });
});
