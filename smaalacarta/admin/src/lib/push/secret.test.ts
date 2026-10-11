import { describe, expect, it } from "vitest";

import { secretMatches } from "./secret";

describe("secreto del webhook — ADMIN-PWA-17", () => {
  it("acepta solo el secreto exacto", () => {
    expect(secretMatches("s3creto-largo", "s3creto-largo")).toBe(true);
    expect(secretMatches("s3creto-largo", "s3creto-larga")).toBe(false);
    expect(secretMatches("corto", "s3creto-largo")).toBe(false);
  });

  it("sin secreto configurado o sin encabezado, nunca coincide", () => {
    expect(secretMatches("x", undefined)).toBe(false);
    expect(secretMatches(null, "x")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
  });
});
