import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_BUCKET,
  MAX_DEFAULT_IMAGE_BYTES,
  defaultImagePath,
  parseKeywords,
  validateDefaultImage,
  validateDefaultImageFile,
} from "./default-images";

const valid = {
  name: "Hamburguesa",
  keywords: "hamburguesa, burger",
  imageUrl: "https://www.smaalacarta.com.ar/assets/defaults/hamburguesa.svg",
  priority: 5,
};

describe("parseKeywords — ADMIN-SUPER-21", () => {
  it("separa por coma o salto de línea, recorta y descarta vacías", () => {
    expect(parseKeywords(" hamburguesa , burger,,\n cheeseburger ")).toEqual([
      "hamburguesa",
      "burger",
      "cheeseburger",
    ]);
  });

  it("descarta repetidas sin distinguir mayúsculas", () => {
    expect(parseKeywords("Pizza, pizza, PIZZA")).toEqual(["Pizza"]);
  });

  it("un texto vacío no tiene claves", () => {
    expect(parseKeywords("  ,  ")).toEqual([]);
  });
});

describe("validateDefaultImage — ADMIN-SUPER-21", () => {
  it("acepta una entrada válida", () => {
    expect(validateDefaultImage(valid)).toEqual({ ok: true });
  });

  it("exige nombre de hasta 80 caracteres", () => {
    const sin = validateDefaultImage({ ...valid, name: "  " });
    const largo = validateDefaultImage({ ...valid, name: "x".repeat(81) });
    expect(!sin.ok && sin.errors.name).toBeTruthy();
    expect(!largo.ok && largo.errors.name).toBeTruthy();
  });

  it("exige al menos una clave", () => {
    const r = validateDefaultImage({ ...valid, keywords: " , " });
    expect(!r.ok && r.errors.keywords).toBeTruthy();
  });

  it.each(["", "http://x.test/a.svg", "javascript:alert(1)", "https://x.test/a b.svg", 'https://x.test/a".svg'])(
    "rechaza la imagen %j",
    (imageUrl) => {
      const r = validateDefaultImage({ ...valid, imageUrl });
      expect(!r.ok && r.errors.imageUrl).toBeTruthy();
    },
  );

  it.each([-101, 101, 1.5, Number.NaN])("rechaza la prioridad %s", (priority) => {
    const r = validateDefaultImage({ ...valid, priority });
    expect(!r.ok && r.errors.priority).toBeTruthy();
  });

  it("acepta los extremos de la prioridad", () => {
    expect(validateDefaultImage({ ...valid, priority: -100 })).toEqual({ ok: true });
    expect(validateDefaultImage({ ...valid, priority: 100 })).toEqual({ ok: true });
  });
});

describe("validateDefaultImageFile — ADMIN-SUPER-21", () => {
  it.each(["image/webp", "image/png", "image/jpeg", "image/svg+xml"])("acepta %s", (type) => {
    expect(validateDefaultImageFile({ type, size: 1000 })).toEqual({ ok: true });
  });

  it("rechaza otros tipos, vacíos y los de más de 1 MB", () => {
    expect(validateDefaultImageFile({ type: "image/gif", size: 1000 }).ok).toBe(false);
    expect(validateDefaultImageFile({ type: "application/pdf", size: 1000 }).ok).toBe(false);
    expect(validateDefaultImageFile({ type: "image/png", size: 0 }).ok).toBe(false);
    expect(validateDefaultImageFile({ type: "image/png", size: MAX_DEFAULT_IMAGE_BYTES + 1 }).ok).toBe(false);
    expect(validateDefaultImageFile({ type: "image/png", size: MAX_DEFAULT_IMAGE_BYTES })).toEqual({ ok: true });
  });
});

describe("defaultImagePath", () => {
  it("usa un identificador del sistema y la extensión del tipo, nunca el nombre del archivo", () => {
    expect(defaultImagePath("image/svg+xml", "abc-123")).toBe("abc-123.svg");
    expect(defaultImagePath("image/jpeg", "abc-123")).toBe("abc-123.jpg");
    expect(DEFAULT_IMAGE_BUCKET).toBe("default-images");
  });

  it("rechaza identificadores con barras o puntos y tipos no permitidos", () => {
    expect(() => defaultImagePath("image/png", "../x")).toThrow();
    expect(() => defaultImagePath("image/gif", "abc")).toThrow();
  });
});
