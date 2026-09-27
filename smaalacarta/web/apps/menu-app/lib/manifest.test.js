import { describe, expect, it } from "vitest";

import { buildManifest, GENERAL_ICONS, manifestIcons } from "./manifest.js";

describe("buildManifest — PWA-1", () => {
  const config = {
    nombre: "Santa Julia Resto",
    descripcion: "Cocina de campo",
    colores: { primary: "#112233", secondary: "#445566" },
    logo: "https://cdn.example.com/logo.png",
  };

  it("lleva el nombre, los colores y el logo del negocio", () => {
    const m = buildManifest(config);
    expect(m.name).toBe("Santa Julia Resto");
    expect(m.short_name).toBe("Santa Julia");
    expect(m.description).toBe("Cocina de campo");
    expect(m.theme_color).toBe("#112233");
    expect(m.icons.map((i) => i.src)).toEqual(Array(2).fill("https://cdn.example.com/logo.png"));
    expect(m.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    expect(m.icons[0].type).toBe("image/png");
  });

  it("abre el menú del propio sitio, como app independiente", () => {
    const m = buildManifest(config);
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("es-AR");
  });

  it("sin logo usa el ícono general de SMA a la Carta", () => {
    const { logo, ...sinLogo } = config;
    expect(logo).toBeTruthy();
    expect(buildManifest(sinLogo).icons).toEqual(GENERAL_ICONS);
  });

  it("un logo que no es una dirección https no se usa", () => {
    expect(manifestIcons("javascript:alert(1)")).toEqual(GENERAL_ICONS);
    expect(manifestIcons("http://x.com/a.png")).toEqual(GENERAL_ICONS);
    expect(manifestIcons("/relativo.png")).toEqual(GENERAL_ICONS);
  });

  it("el tipo del logo sale de su extensión; si no se conoce, se omite", () => {
    expect(manifestIcons("https://x.com/a.webp?v=2")[0].type).toBe("image/webp");
    expect(manifestIcons("https://x.com/a.JPG")[0].type).toBe("image/jpeg");
    expect(manifestIcons("https://x.com/a")[0]).not.toHaveProperty("type");
  });

  it("un color inválido vuelve al de la marca", () => {
    expect(buildManifest({ ...config, colores: { primary: "red" } }).theme_color).toBe("#5a4a3a");
    expect(buildManifest({ ...config, colores: {} }).theme_color).toBe("#5a4a3a");
  });

  it("limpia el nombre: sin saltos de línea y con largo acotado", () => {
    const m = buildManifest({ nombre: "  Mi\n  local\u0000  " + "x".repeat(100) });
    expect(m.name).not.toMatch(/[\n\u0000]/);
    expect(m.name.length).toBeLessThanOrEqual(45);
    expect(m.short_name.length).toBeLessThanOrEqual(12);
  });
});

describe("manifest general — PWA-2", () => {
  it("sin negocio (demos o desconocido) es el de SMA a la Carta", () => {
    for (const config of [null, undefined, {}]) {
      const m = buildManifest(config);
      expect(m.name).toBe("SMA a la Carta");
      expect(m.theme_color).toBe("#5a4a3a");
      expect(m.icons).toEqual(GENERAL_ICONS);
    }
  });
});
