import { describe, expect, it } from "vitest";

import { MAX_PDF_BYTES, pdfPath, validatePdfFile } from "./pdfs";

describe("validatePdfFile — PDF-2", () => {
  it("acepta application/pdf", () => {
    expect(validatePdfFile({ type: "application/pdf", size: 500_000 })).toEqual({ ok: true });
  });

  it.each(["image/png", "text/html", "application/msword", ""])(
    "rechaza el tipo %j",
    (type) => {
      const r = validatePdfFile({ type, size: 1000 });
      expect(r.ok === false && r.error).toMatch(/PDF/i);
    },
  );

  it("el límite es de 10 MB", () => {
    expect(MAX_PDF_BYTES).toBe(10 * 1024 * 1024);
    expect(validatePdfFile({ type: "application/pdf", size: MAX_PDF_BYTES })).toEqual({ ok: true });

    const r = validatePdfFile({ type: "application/pdf", size: MAX_PDF_BYTES + 1 });
    expect(r.ok === false && r.error).toMatch(/10 MB/);
  });

  it("rechaza un archivo vacío", () => {
    const r = validatePdfFile({ type: "application/pdf", size: 0 });
    expect(r.ok).toBe(false);
  });
});

describe("pdfPath — PDF-2", () => {
  const negocio = "a1a1a1a1-0000-0000-0000-000000000001";

  it("va en la carpeta del negocio, siempre con extensión .pdf", () => {
    expect(pdfPath(negocio, "abc123")).toBe(`${negocio}/abc123.pdf`);
  });

  it("no usa el nombre que puso el usuario: solo un identificador", () => {
    expect(pdfPath(negocio, "f47ac10b")).not.toMatch(/\.\./);
  });

  it.each(["", "a/b", "..", "a b", "x.pdf"])("falla con un identificador inválido %j", (id) => {
    expect(() => pdfPath(negocio, id)).toThrow();
  });
});
