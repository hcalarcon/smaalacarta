import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, validateSettings } from "./validation";

const valid = {
  ...DEFAULT_SETTINGS,
  published: true,
  tagline: "Cocina casera",
  headerImageUrl: "https://ejemplo.com/cabecera.jpg",
  logoUrl: "https://ejemplo.com/logo.png",
  schedule: { lunes: ["12:00-15:00"], domingo: [] },
  whatsapp: "5493510000000",
  address: "Calle 123",
  instagram: "@casa_resto",
  facebook: "facebook.com/casaresto",
  temporarilyClosed: false,
  closedMessage: "",
  reopensOn: "",
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

describe("dirección y redes — ADMIN-CONFIG-5", () => {
  it("son opcionales", () => {
    expect(
      validateSettings({ ...valid, address: "", instagram: "", facebook: "" }),
    ).toEqual({ ok: true });
  });

  it("la dirección tiene un máximo de 200 caracteres", () => {
    expect(validateSettings({ ...valid, address: "a".repeat(200) })).toEqual({ ok: true });
    const r = validateSettings({ ...valid, address: "a".repeat(201) });
    expect(r.ok === false && r.errors.address).toBeTruthy();
  });

  it("acepta @usuario y direcciones de la red", () => {
    expect(
      validateSettings({ ...valid, instagram: "https://instagram.com/casa_resto", facebook: "@casaresto" }),
    ).toEqual({ ok: true });
  });

  it("rechaza redes de otros sitios o con formato inválido", () => {
    const r = validateSettings({
      ...valid,
      instagram: "https://evil.com/x",
      facebook: "a b",
    });
    expect(r.ok === false && r.errors.instagram).toBeTruthy();
    expect(r.ok === false && r.errors.facebook).toBeTruthy();
  });
});

describe("cierre temporal — ADMIN-CONFIG-6", () => {
  it("cerrado, con mensaje y fecha", () => {
    expect(
      validateSettings({
        ...valid,
        temporarilyClosed: true,
        closedMessage: "Vacaciones",
        reopensOn: "2030-01-15",
      }),
    ).toEqual({ ok: true });
  });

  it("el mensaje y la fecha son opcionales", () => {
    expect(validateSettings({ ...valid, temporarilyClosed: true })).toEqual({ ok: true });
  });

  it("el mensaje tiene un máximo de 200 caracteres", () => {
    const r = validateSettings({ ...valid, closedMessage: "a".repeat(201) });
    expect(r.ok === false && r.errors.closedMessage).toBeTruthy();
  });

  it.each(["15/01/2030", "2030-1-5", "2030-13-01", "2030-02-30", "mañana", "2030-01-15T10:00"])(
    "rechaza la fecha %j",
    (reopensOn) => {
      const r = validateSettings({ ...valid, reopensOn });
      expect(r.ok === false && r.errors.reopensOn).toBeTruthy();
    },
  );

  it("acepta un 29 de febrero de año bisiesto y rechaza el de un año común", () => {
    expect(validateSettings({ ...valid, reopensOn: "2028-02-29" })).toEqual({ ok: true });
    const r = validateSettings({ ...valid, reopensOn: "2027-02-29" });
    expect(r.ok === false && r.errors.reopensOn).toBeTruthy();
  });
});

describe("logo — ADMIN-CONFIG-8", () => {
  it.each(["logo.png", "http://ejemplo.com/logo.png", "javascript:alert(1)", 'https://x.com/a"b.png'])(
    "rechaza %s",
    (logoUrl) => {
      const r = validateSettings({ ...valid, logoUrl });
      expect(r.ok === false && r.errors.logoUrl).toBeTruthy();
    },
  );

  it("es opcional", () => {
    expect(validateSettings({ ...valid, logoUrl: "" })).toEqual({ ok: true });
  });

  it("acepta una imagen https", () => {
    expect(validateSettings({ ...valid, logoUrl: "https://ejemplo.com/logo.png" })).toEqual({ ok: true });
  });
});
