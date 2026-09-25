import { describe, expect, it } from "vitest";

import { imagePath, MAX_IMAGE_BYTES, validateImageFile } from "./images";

describe("validateImageFile — ADMIN-CONFIG-7", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("acepta %s", (type) => {
    expect(validateImageFile({ type, size: 500_000 })).toEqual({ ok: true });
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/html", ""])(
    "rechaza el tipo %j",
    (type) => {
      const r = validateImageFile({ type, size: 1000 });
      expect(r.ok === false && r.error).toMatch(/JPG|PNG|WebP/i);
    },
  );

  it("el límite es de 2 MB", () => {
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES })).toEqual({ ok: true });

    const r = validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 });
    expect(r.ok === false && r.error).toMatch(/2 MB/);
  });

  it("rechaza un archivo vacío", () => {
    const r = validateImageFile({ type: "image/png", size: 0 });
    expect(r.ok).toBe(false);
  });
});

describe("imagePath — ADMIN-CONFIG-7", () => {
  const negocio = "a1a1a1a1-0000-0000-0000-000000000001";

  it("va en la carpeta del negocio", () => {
    expect(imagePath(negocio, "image/png", "abc123")).toBe(`${negocio}/abc123.png`);
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ])("la extensión de %s es %s", (type, ext) => {
    expect(imagePath(negocio, type, "x")).toBe(`${negocio}/x.${ext}`);
  });

  it("no usa el nombre que puso el usuario: solo un identificador", () => {
    expect(imagePath(negocio, "image/png", "f47ac10b")).not.toMatch(/\.\./);
  });

  it("falla con un tipo desconocido", () => {
    expect(() => imagePath(negocio, "image/gif", "x")).toThrow();
  });

  it.each(["", "a/b", "..", "a b", "x.png"])("falla con un identificador inválido %j", (id) => {
    expect(() => imagePath(negocio, "image/png", id)).toThrow();
  });
});
