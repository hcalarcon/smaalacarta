// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assertDevDatabase, digits, parseEnv } from "./entorno.mjs";

describe("parseEnv", () => {
  it("lee claves, comillas y comentarios", () => {
    expect(parseEnv('# nota\nA=1\nB="dos"\n\nexport C = tres \nD=a=b')).toEqual({ A: "1", B: "dos", C: "tres", D: "a=b" });
  });
});

describe("parseEnv con # y comillas", () => {
  it("respeta el # dentro de comillas y descarta lo que sigue a la comilla de cierre", () => {
    expect(parseEnv("A=\"abc#123\" # nota\nB='x # y'")).toEqual({ A: "abc#123", B: "x # y" });
  });

  it("sin comillas, el # pegado al valor es parte de él y el comentario lleva un espacio antes", () => {
    expect(parseEnv("A=abc#123\nB=valor  # comentario")).toEqual({ A: "abc#123", B: "valor" });
  });
});

describe("assertDevDatabase", () => {
  const prod = ["https://prod.supabase.co", undefined];

  it("acepta una base distinta de producción", () => {
    expect(() => assertDevDatabase("https://dev.supabase.co", prod)).not.toThrow();
  });

  it("se niega con la de producción, aunque cambie la barra final o las mayúsculas", () => {
    expect(() => assertDevDatabase("https://PROD.supabase.co/", prod)).toThrow(/PRODUCCIÓN/);
  });

  it("se niega si falta la URL", () => {
    expect(() => assertDevDatabase("", prod)).toThrow(/Falta/);
  });
});

describe("digits", () => {
  it("deja el mismo teléfono con o sin formato", () => {
    expect(digits("+54 9 0000 000036")).toBe(digits("5490000000036"));
  });
});
