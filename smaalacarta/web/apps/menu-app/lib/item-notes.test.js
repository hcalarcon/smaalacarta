import { describe, expect, it } from "vitest";

import { NOTE_MAX, cleanNote, noteCounter, notesEnabled } from "./item-notes.js";

describe("cleanNote — PUBLICO-62", () => {
  it("deja el texto como está si ya viene limpio", () => {
    expect(cleanNote("Sin cheddar, con mostaza")).toBe("Sin cheddar, con mostaza");
  });

  it("junta saltos de línea, tabulaciones y espacios repetidos en un espacio", () => {
    expect(cleanNote("  sin\ncheddar\r\n\t con   mostaza\u0007 ")).toBe("sin cheddar con mostaza");
  });

  it("recorta a 140 caracteres", () => {
    expect(cleanNote("x".repeat(500))).toHaveLength(NOTE_MAX);
  });

  it("vacía, de espacios o que no es texto queda vacía", () => {
    for (const value of ["", "   \n\t", null, undefined, 42, {}]) expect(cleanNote(value)).toBe("");
  });
});

describe("notesEnabled — PUBLICO-65", () => {
  it("solo con config.notasPorItem verdadero", () => {
    expect(notesEnabled({ notasPorItem: true })).toBe(true);
    expect(notesEnabled({ notasPorItem: false })).toBe(false);
    expect(notesEnabled({})).toBe(false);
    expect(notesEnabled(null)).toBe(false);
  });
});

describe("noteCounter", () => {
  it("cuenta lo escrito sobre el máximo", () => {
    expect(noteCounter("")).toBe("0/140");
    expect(noteCounter("hola")).toBe("4/140");
  });
});
