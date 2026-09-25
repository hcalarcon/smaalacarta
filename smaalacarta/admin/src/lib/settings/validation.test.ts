import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, validateSettings } from "./validation";

const valid = {
  ...DEFAULT_SETTINGS,
  published: true,
  tagline: "Cocina casera",
  headerImageUrl: "https://ejemplo.com/cabecera.jpg",
  schedule: { lunes: ["12:00-15:00"], domingo: [] },
  whatsapp: "5493510000000",
};

describe("validateSettings — ADMIN-CONFIG-2", () => {
  it("acepta una configuración válida", () => {
    expect(validateSettings(valid)).toEqual({ ok: true });
  });

  it("los valores por defecto son válidos", () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toEqual({ ok: true });
  });

  it.each(["moderno", "clasico", "minimal"])("acepta la plantilla %s", (template) => {
    expect(validateSettings({ ...valid, template })).toEqual({ ok: true });
  });

  it("rechaza una plantilla desconocida", () => {
    const r = validateSettings({ ...valid, template: "futurista" });
    expect(r.ok === false && r.errors.template).toBeTruthy();
  });

  it.each(["", "463AE5", "#fff", "#GGGGGG", "rojo", "#1234567"])("rechaza el color %j", (color) => {
    const r = validateSettings({ ...valid, primaryColor: color, secondaryColor: color });
    expect(r.ok === false && r.errors.primaryColor).toBeTruthy();
    expect(r.ok === false && r.errors.secondaryColor).toBeTruthy();
  });

  it.each(["#463AE5", "#463ae5", "#000000"])("acepta el color %s", (color) => {
    expect(validateSettings({ ...valid, primaryColor: color })).toEqual({ ok: true });
  });

  it.each(["http://x.com/a.jpg", "javascript:alert(1)", "ftp://x.com/a", "imagen.jpg", "https://x.com/a b.jpg", 'https://x.com/a"onload="x'])(
    "rechaza la imagen %j",
    (headerImageUrl) => {
      const r = validateSettings({ ...valid, headerImageUrl });
      expect(r.ok === false && r.errors.headerImageUrl).toBeTruthy();
    },
  );

  it("la imagen es opcional", () => {
    expect(validateSettings({ ...valid, headerImageUrl: "" })).toEqual({ ok: true });
  });

  it("la descripción tiene un máximo de 200 caracteres", () => {
    const r = validateSettings({ ...valid, tagline: "a".repeat(201) });
    expect(r.ok === false && r.errors.tagline).toBeTruthy();
    expect(validateSettings({ ...valid, tagline: "a".repeat(200) })).toEqual({ ok: true });
  });

  it("informa el error de horarios", () => {
    const r = validateSettings({ ...valid, schedule: { lunes: ["12:00-15:00", "14:00-16:00"] } });
    expect(r.ok === false && r.errors.schedule).toBeTruthy();
  });

  it.each(["abc", "123", "1".repeat(16)])("rechaza el WhatsApp %j", (whatsapp) => {
    const r = validateSettings({ ...valid, whatsapp });
    expect(r.ok === false && r.errors.whatsapp).toBeTruthy();
  });

  it("el WhatsApp es opcional y acepta símbolos", () => {
    expect(validateSettings({ ...valid, whatsapp: "" })).toEqual({ ok: true });
    expect(validateSettings({ ...valid, whatsapp: "+54 9 351 000-0000" })).toEqual({ ok: true });
  });
});
