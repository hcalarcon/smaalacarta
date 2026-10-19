import { describe, expect, it } from "vitest";

import { animationPath, MAX_ANIMATION_BYTES, validateAnimationFile } from "./animations";

describe("validateAnimationFile — PUBLICO-104 y 105", () => {
  it.each(["image/gif", "image/webp", "image/png"])("acepta %s", (type) => {
    expect(validateAnimationFile({ type, size: 500_000 })).toEqual({ ok: true });
  });

  it.each(["image/jpeg", "image/svg+xml", "application/json", "video/mp4", "text/html", ""])(
    "rechaza el tipo %j",
    (type) => {
      const r = validateAnimationFile({ type, size: 1000 });
      expect(r.ok === false && r.error).toMatch(/GIF|WebP|PNG/);
    },
  );

  it("el límite es de 1 MB: justo en el límite pasa, un byte más no", () => {
    expect(MAX_ANIMATION_BYTES).toBe(1024 * 1024);
    expect(validateAnimationFile({ type: "image/gif", size: MAX_ANIMATION_BYTES })).toEqual({ ok: true });

    const r = validateAnimationFile({ type: "image/gif", size: MAX_ANIMATION_BYTES + 1 });
    expect(r.ok === false && r.error).toMatch(/1 MB/);
  });

  it("rechaza un archivo vacío", () => {
    expect(validateAnimationFile({ type: "image/gif", size: 0 }).ok).toBe(false);
  });
});

describe("animationPath — PUBLICO-105", () => {
  it("siempre dentro de la carpeta del negocio, con extensión según el tipo", () => {
    expect(animationPath("neg-1", "image/gif", "abc-123")).toBe("neg-1/abc-123.gif");
    expect(animationPath("neg-1", "image/webp", "abc")).toBe("neg-1/abc.webp");
    expect(animationPath("neg-1", "image/png", "abc")).toBe("neg-1/abc.png");
  });

  it("no acepta un tipo ni un identificador que se salgan de la carpeta", () => {
    expect(() => animationPath("neg-1", "image/svg+xml", "abc")).toThrow();
    expect(() => animationPath("neg-1", "image/gif", "../otro")).toThrow();
    expect(() => animationPath("neg-1", "image/gif", "a/b")).toThrow();
  });
});
