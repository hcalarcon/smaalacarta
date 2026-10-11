import { describe, expect, it } from "vitest";

import { urlBase64ToBytes } from "./vapid";

describe("clave pública VAPID", () => {
  it("pasa de base64 de URL a bytes, con o sin relleno", () => {
    // "hola" en base64 es aG9sYQ== ; en base64 de URL viaja como aG9sYQ.
    expect(Array.from(urlBase64ToBytes("aG9sYQ"))).toEqual([104, 111, 108, 97]);
    expect(Array.from(urlBase64ToBytes("aG9sYQ=="))).toEqual([104, 111, 108, 97]);
  });

  it("entiende los caracteres - y _ de base64 de URL", () => {
    // 0xfb 0xff 0xbf es "-_-_" en base64 de URL ("+/+/" en el común).
    expect(Array.from(urlBase64ToBytes("-_-_"))).toEqual([0xfb, 0xff, 0xbf]);
  });
});
