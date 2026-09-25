import { describe, expect, it } from "vitest";

import { normalizeFacebook, normalizeInstagram } from "./social";

describe("normalizeInstagram — ADMIN-CONFIG-5", () => {
  it.each([
    ["@casa_resto", "https://www.instagram.com/casa_resto"],
    ["casa.resto", "https://www.instagram.com/casa.resto"],
    ["  @Casa_Resto  ", "https://www.instagram.com/Casa_Resto"],
    ["instagram.com/casa_resto", "https://www.instagram.com/casa_resto"],
    ["www.instagram.com/casa_resto", "https://www.instagram.com/casa_resto"],
    ["https://instagram.com/casa_resto", "https://www.instagram.com/casa_resto"],
    ["http://www.instagram.com/casa_resto/", "https://www.instagram.com/casa_resto"],
    ["https://www.instagram.com/casa_resto?igsh=abc123", "https://www.instagram.com/casa_resto"],
    ["https://www.instagram.com/casa_resto/#top", "https://www.instagram.com/casa_resto"],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizeInstagram(entrada)).toBe(esperado);
  });

  it("vacío es válido y queda vacío", () => {
    expect(normalizeInstagram("")).toBe("");
    expect(normalizeInstagram("   ")).toBe("");
  });

  it.each([
    "@",
    "a b",
    "@con espacios",
    "usuario/otro",
    "https://evil.com/casa_resto",
    "https://instagram.com.evil.com/casa_resto",
    "https://evil.com/instagram.com/casa_resto",
    "javascript:alert(1)",
    "@" + "a".repeat(31),
    'usuario"onload',
    "usuario<script>",
  ])("rechaza %j", (entrada) => {
    expect(normalizeInstagram(entrada)).toBeNull();
  });

  it("acepta el máximo de 30 caracteres", () => {
    expect(normalizeInstagram("@" + "a".repeat(30))).toBe(
      `https://www.instagram.com/${"a".repeat(30)}`,
    );
  });
});

describe("normalizeFacebook — ADMIN-CONFIG-5", () => {
  it.each([
    ["@minegocio", "https://www.facebook.com/minegocio"],
    ["mi.negocio", "https://www.facebook.com/mi.negocio"],
    ["facebook.com/minegocio", "https://www.facebook.com/minegocio"],
    ["https://facebook.com/minegocio/", "https://www.facebook.com/minegocio"],
    ["https://www.facebook.com/minegocio?ref=share", "https://www.facebook.com/minegocio"],
    ["https://fb.com/minegocio", "https://www.facebook.com/minegocio"],
  ])("%j → %j", (entrada, esperado) => {
    expect(normalizeFacebook(entrada)).toBe(esperado);
  });

  it("vacío es válido y queda vacío", () => {
    expect(normalizeFacebook("")).toBe("");
  });

  it.each([
    "@",
    "a b",
    "https://evil.com/minegocio",
    "https://facebook.com.evil.com/minegocio",
    "https://instagram.com/minegocio",
    "https://www.facebook.com/profile.php?id=123",
    "https://www.facebook.com/pages/algo/123",
    'mi"negocio',
  ])("rechaza %j", (entrada) => {
    expect(normalizeFacebook(entrada)).toBeNull();
  });
});
