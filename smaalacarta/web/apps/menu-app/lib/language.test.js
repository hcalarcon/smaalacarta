import { describe, expect, it } from "vitest";

import { readSavedLang, rememberLang, suggestLanguage } from "./language.js";

const LANGS = ["es", "en", "pt"];

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

describe("suggestLanguage — PUBLICO-88", () => {
  it("sugiere inglés o portugués según el celular", () => {
    expect(suggestLanguage("en-US", LANGS, null)).toBe("en");
    expect(suggestLanguage("pt-BR", LANGS, null)).toBe("pt");
    expect(suggestLanguage("EN", LANGS, null)).toBe("en");
  });

  it("no sugiere con el celular en español u otro idioma", () => {
    expect(suggestLanguage("es-AR", LANGS, null)).toBeNull();
    expect(suggestLanguage("fr-FR", LANGS, null)).toBeNull();
    expect(suggestLanguage("", LANGS, null)).toBeNull();
    expect(suggestLanguage(undefined, LANGS, null)).toBeNull();
  });

  it("no sugiere si el menú no ofrece ese idioma", () => {
    expect(suggestLanguage("pt-BR", ["es", "en"], null)).toBeNull();
  });

  it("no sugiere si el visitante ya eligió algo", () => {
    expect(suggestLanguage("en-US", LANGS, "es")).toBeNull();
    expect(suggestLanguage("en-US", LANGS, "en")).toBeNull();
  });

  it("ignora una elección guardada que no es un idioma", () => {
    expect(suggestLanguage("en-US", LANGS, "klingon")).toBe("en");
  });
});

describe("idioma guardado — PUBLICO-89", () => {
  it("guarda y lee el idioma elegido", () => {
    const storage = memory();
    expect(readSavedLang(storage, LANGS)).toBeNull();
    rememberLang(storage, "pt");
    expect(readSavedLang(storage, LANGS)).toBe("pt");
  });

  it("no guarda un idioma inválido y descarta uno guardado que el menú no ofrece", () => {
    const storage = memory();
    rememberLang(storage, "fr");
    expect(readSavedLang(storage, LANGS)).toBeNull();
    rememberLang(storage, "pt");
    expect(readSavedLang(storage, ["es", "en"])).toBeNull();
  });

  it("no falla sin almacenamiento", () => {
    const roto = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(() => rememberLang(roto, "en")).not.toThrow();
    expect(readSavedLang(roto, LANGS)).toBeNull();
    expect(readSavedLang(undefined, LANGS)).toBeNull();
  });
});
