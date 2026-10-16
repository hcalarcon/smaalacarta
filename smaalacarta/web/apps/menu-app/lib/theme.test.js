import { describe, expect, it } from "vitest";

import { loaderThemeKey, rememberLoaderTheme, rememberTheme, resolveTheme, savedLoaderTheme } from "./theme.js";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

describe("resolveTheme — PUBLICO-24", () => {
  it("sin preferencia del visitante usa el tema que el negocio dejó por defecto", () => {
    expect(resolveTheme({ tema: "oscuro" }, fakeStorage(), "ana")).toBe("oscuro");
    expect(resolveTheme({ tema: "claro" }, fakeStorage(), "ana")).toBe("claro");
  });

  it("sin tema en la configuración (demos, JSON) es claro", () => {
    expect(resolveTheme({}, fakeStorage(), "ana")).toBe("claro");
    expect(resolveTheme(null, fakeStorage(), "ana")).toBe("claro");
    expect(resolveTheme({ tema: "sepia" }, fakeStorage(), "ana")).toBe("claro");
  });

  it("lo que el visitante eligió gana al tema por defecto del negocio", () => {
    const storage = fakeStorage();
    rememberTheme(storage, "ana", "claro");

    expect(resolveTheme({ tema: "oscuro" }, storage, "ana")).toBe("claro");
  });

  it("la preferencia es por negocio: no cambia el tema de otro menú", () => {
    const storage = fakeStorage();
    rememberTheme(storage, "ana", "claro");

    expect(resolveTheme({ tema: "oscuro" }, storage, "beto")).toBe("oscuro");
  });

  it("ignora una preferencia guardada que no es un tema", () => {
    const storage = fakeStorage({ "sma-tema:ana": "<b>x</b>" });

    expect(resolveTheme({ tema: "oscuro" }, storage, "ana")).toBe("oscuro");
  });

  it("sin almacenamiento disponible usa el tema del negocio", () => {
    const roto = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };

    expect(resolveTheme({ tema: "oscuro" }, roto, "ana")).toBe("oscuro");
    expect(() => rememberTheme(roto, "ana", "claro")).not.toThrow();
  });
});

describe("tema del loader — PUBLICO-85", () => {
  const memory = () => {
    const data = new Map();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  };

  it("la clave distingue negocio, demo y cliente de prueba", () => {
    expect(loaderThemeKey("don-juan.smaalacarta.com.ar", "/", "")).not.toBe(
      loaderThemeKey("ana.smaalacarta.com.ar", "/", ""),
    );
    expect(loaderThemeKey("localhost", "/", "?demo=moderno")).not.toBe(loaderThemeKey("localhost", "/", "?demo=clasico"));
    expect(loaderThemeKey("localhost", "/moderno", "")).not.toBe(loaderThemeKey("localhost", "/clasico", ""));
  });

  it("recuerda el último tema para pintar el loader antes de saber el del negocio", () => {
    const storage = memory();
    const key = loaderThemeKey("ana.smaalacarta.com.ar", "/", "");
    expect(savedLoaderTheme(storage, key)).toBeNull();
    rememberLoaderTheme(storage, key, "oscuro");
    expect(savedLoaderTheme(storage, key)).toBe("oscuro");
  });

  it("ignora un valor inválido y no falla sin almacenamiento", () => {
    const storage = memory();
    rememberLoaderTheme(storage, "k", "fucsia");
    expect(savedLoaderTheme(storage, "k")).toBeNull();
    const roto = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    expect(() => rememberLoaderTheme(roto, "k", "claro")).not.toThrow();
    expect(savedLoaderTheme(roto, "k")).toBeNull();
  });
});
