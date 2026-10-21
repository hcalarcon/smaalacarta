// @vitest-environment node
import { describe, expect, it } from "vitest";

import { armarLista } from "./grabador.mjs";
import { esServidorDeDesarrollo } from "./preflight.mjs";

describe("armarLista", () => {
  it("cada cuadro dura hasta el siguiente y el último hasta el final", () => {
    const lista = armarLista(
      [
        { archivo: String.raw`C:\tmp\000000.jpg`, t: 0 },
        { archivo: String.raw`C:\tmp\000001.jpg`, t: 400 },
      ],
      1000,
    );
    expect(lista.split("\n")).toEqual([
      "file 'C:/tmp/000000.jpg'",
      "duration 0.400",
      "file 'C:/tmp/000001.jpg'",
      "duration 0.600",
      "file 'C:/tmp/000001.jpg'",
    ]);
  });
});

describe("esServidorDeDesarrollo", () => {
  it("reconoce el cliente de recarga de next dev y no el compilado", () => {
    expect(esServidorDeDesarrollo('<script src="/admin/_next/static/chunks/[turbopack]_browser_dev_hmr-client.js">')).toBe(true);
    expect(esServidorDeDesarrollo('<script src="/admin/_next/static/chunks/0fs15t2ifv2wr.js">')).toBe(false);
  });
});
