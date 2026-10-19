import { describe, expect, it } from "vitest";

import { formatAcceptedAt, mustAccept, parseTerms, pickLang, statusFromRow, termsBlocks, termsLabel } from "./terms";
import { loadTerms } from "./terms-file";

// ENVIO-179 a 185: reglas puras de los términos para repartidores.
describe("parseTerms — ENVIO-179", () => {
  it("separa la versión del texto", () => {
    expect(parseTerms("---\nversion: 3\n---\n# Título\n\n1. Uno\n")).toEqual({ version: 3, body: "# Título\n\n1. Uno" });
  });

  it("sin versión es un error", () => {
    expect(() => parseTerms("# Título\n1. Uno")).toThrow();
    expect(() => parseTerms("---\nversion: 0\n---\nx")).toThrow();
  });

  it("el archivo real tiene los diez puntos, en orden", () => {
    const items = termsBlocks(loadTerms().body).filter((b) => b.kind === "item");
    expect(items).toHaveLength(10);
    expect(items[0].text).toMatch(/^SMA a la Carta es una plataforma/);
    expect(items[9].text).toMatch(/pedir que se borre tu cuenta\.$/);
  });
});

describe("termsBlocks", () => {
  it("devuelve el título y los puntos", () => {
    expect(termsBlocks("# T\n\n1. a\n2. b")).toEqual([
      { kind: "title", text: "T" },
      { kind: "item", text: "a" },
      { kind: "item", text: "b" },
    ]);
  });
});

describe("mustAccept — ENVIO-183", () => {
  const base = statusFromRow({ required: true, version: 1, accepted: false });

  it("se muestra la pantalla si se exigen y no aceptó la vigente", () => {
    expect(mustAccept(base)).toBe(true);
  });

  it("no se muestra si aceptó o si no se exigen", () => {
    expect(mustAccept({ ...base, accepted: true })).toBe(false);
    expect(mustAccept({ ...base, required: false })).toBe(false);
  });

  it("ante datos raros no se asume que aceptó", () => {
    expect(statusFromRow(null)).toMatchObject({ required: false, accepted: false });
  });
});

describe("pickLang — ENVIO-183", () => {
  it("elige por el idioma del navegador y cae al español", () => {
    expect(pickLang("pt-BR,pt;q=0.9")).toBe("pt");
    expect(pickLang("en-US,en;q=0.9")).toBe("en");
    expect(pickLang("es-AR")).toBe("es");
    expect(pickLang("fr-FR")).toBe("es");
    expect(pickLang(null)).toBe("es");
  });
});

describe("termsLabel — ENVIO-185", () => {
  const at = "2026-10-19T15:30:00+00:00";

  it("sin aceptación, Pendiente", () => {
    expect(termsLabel(null, 1)).toBe("Pendiente");
  });

  it("con la vigente aceptada, versión y fecha en hora argentina", () => {
    expect(termsLabel({ version: 1, acceptedAt: at }, 1)).toBe(`Versión 1, aceptada el ${formatAcceptedAt(at)}`);
    expect(formatAcceptedAt(at)).toContain("12:30");
  });

  it("con una versión vieja, Pendiente", () => {
    expect(termsLabel({ version: 1, acceptedAt: at }, 2)).toMatch(/^Pendiente/);
  });
});
