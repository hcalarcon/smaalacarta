import { describe, expect, it } from "vitest";

import { DEFAULT_MENU_LOOK, lookToConfig, validateMenuLook, type MenuLook } from "./menu-look";
import { DEFAULT_SETTINGS, validateSettings } from "./validation";

const look = (extra: Partial<MenuLook> = {}): MenuLook => ({ ...DEFAULT_MENU_LOOK, ...extra });
const GIF = "https://x.supabase.co/storage/v1/object/public/business-animations/n/a.gif";

describe("valores por defecto — PUBLICO-102", () => {
  it("un negocio nuevo carga con su logo (PUBLICO-118) y el menú entra como siempre", () => {
    expect(DEFAULT_MENU_LOOK).toEqual({
      menuAnimation: "estandar",
      loaderAnimation: "logo",
      loaderCustomUrl: "",
      backgroundImageUrl: "",
    });
    expect(DEFAULT_SETTINGS).toMatchObject(DEFAULT_MENU_LOOK);
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
  });
});

describe("validateMenuLook — PUBLICO-103 a 105", () => {
  it("acepta cada animación del menú y cada cargador de la lista", () => {
    for (const menuAnimation of ["estandar", "suave", "dinamica", "ninguna"]) {
      expect(validateMenuLook(look({ menuAnimation }))).toEqual({});
    }
    for (const loaderAnimation of [
      "hamburguesa",
      "pizza",
      "cafe",
      "helado",
      "parrilla",
      "sushi",
      "pastas",
      "panificados",
      "empanada",
      "logo",
    ]) {
      expect(validateMenuLook(look({ loaderAnimation }))).toEqual({});
    }
  });

  it("rechaza lo que no está en la lista", () => {
    expect(validateMenuLook(look({ menuAnimation: "loca" })).menuAnimation).toBeTruthy();
    expect(validateMenuLook(look({ loaderAnimation: "cohete" })).loaderAnimation).toBeTruthy();
  });

  it("la propia exige su archivo, y tiene que ser una dirección https", () => {
    expect(validateMenuLook(look({ loaderAnimation: "custom" })).loaderCustomUrl).toMatch(/Subí/);
    expect(validateMenuLook(look({ loaderAnimation: "custom", loaderCustomUrl: GIF }))).toEqual({});
    expect(
      validateMenuLook(look({ loaderAnimation: "custom", loaderCustomUrl: "http://x.com/a.gif" })).loaderCustomUrl,
    ).toBeTruthy();
  });

  it("el fondo es opcional, pero si hay tiene que ser https y sin caracteres raros", () => {
    expect(validateMenuLook(look({ backgroundImageUrl: "" }))).toEqual({});
    expect(validateMenuLook(look({ backgroundImageUrl: "https://x.com/f.webp" }))).toEqual({});
    for (const backgroundImageUrl of ["javascript:alert(1)", "http://x.com/f.jpg", 'https://x.com/f.jpg")']) {
      expect(validateMenuLook(look({ backgroundImageUrl })).backgroundImageUrl).toBeTruthy();
    }
  });

  it("validateSettings también lo marca", () => {
    const result = validateSettings({ ...DEFAULT_SETTINGS, menuAnimation: "loca" });
    expect(!result.ok && result.errors.menuAnimation).toBeTruthy();
  });
});

describe("lookToConfig — PUBLICO-108", () => {
  it("manda la animación y el cargador; el archivo propio y el fondo, solo si hay", () => {
    expect(lookToConfig(look())).toEqual({ animacionMenu: "estandar", animacionCarga: "logo" });
    expect(lookToConfig(look({ loaderAnimation: "hamburguesa" }))).toEqual({
      animacionMenu: "estandar",
      animacionCarga: "hamburguesa",
    });
    expect(
      lookToConfig(look({ loaderAnimation: "custom", loaderCustomUrl: GIF, backgroundImageUrl: "https://x.com/f.jpg" })),
    ).toEqual({
      animacionMenu: "estandar",
      animacionCarga: "custom",
      animacionCargaUrl: GIF,
      fondo: "https://x.com/f.jpg",
    });
  });

  it("con otro cargador no manda el archivo propio que haya quedado", () => {
    expect(lookToConfig(look({ loaderAnimation: "pizza", loaderCustomUrl: GIF }))).not.toHaveProperty(
      "animacionCargaUrl",
    );
  });
});
