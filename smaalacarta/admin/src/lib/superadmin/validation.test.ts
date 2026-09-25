import { describe, expect, it } from "vitest";

import {
  normalizeWhatsapp,
  slugify,
  validateMember,
  validateNewBusiness,
} from "./validation";

describe("slugify — ADMIN-SUPER-5", () => {
  it.each([
    ["Panadería Don José", "panaderia-don-jose"],
    ["  Café & Té  ", "cafe-te"],
    ["ÑANDÚ", "nandu"],
    ["Bar 24hs", "bar-24hs"],
    ["a---b", "a-b"],
    ["---", ""],
    ["", ""],
  ])("%j → %j", (entrada, esperado) => {
    expect(slugify(entrada)).toBe(esperado);
  });

  it("corta en 40 caracteres sin dejar un guion al final", () => {
    const slug = slugify("una ".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("siempre produce un slug que el validador acepta (o vacío)", () => {
    for (const nombre of ["Panadería Don José", "Café & Té", "ÑANDÚ 24hs"]) {
      const slug = slugify(nombre);
      expect(
        validateNewBusiness({
          name: "Negocio",
          slug,
          whatsapp: "",
          ownerEmail: "a@b.com",
          ownerName: "",
        }),
      ).toEqual({ ok: true });
    }
  });
});

describe("normalizeWhatsapp", () => {
  it("deja solo los dígitos", () => {
    expect(normalizeWhatsapp("+54 9 (351) 000-0001")).toBe("5493510000001");
  });

  it("acepta vacío", () => {
    expect(normalizeWhatsapp("")).toBe("");
  });
});

describe("validateNewBusiness — ADMIN-SUPER-5", () => {
  const base = {
    name: "Panadería",
    slug: "panaderia",
    whatsapp: "5493510000001",
    ownerEmail: "dueno@negocio.com",
    ownerName: "Ana",
  };

  it("acepta datos válidos", () => {
    expect(validateNewBusiness(base)).toEqual({ ok: true });
  });

  it("el WhatsApp y el nombre del dueño son opcionales", () => {
    expect(
      validateNewBusiness({ ...base, whatsapp: "", ownerName: "" }),
    ).toEqual({ ok: true });
  });

  it("pide un nombre de al menos 2 caracteres", () => {
    for (const name of ["", " ", "a"]) {
      const r = validateNewBusiness({ ...base, name });
      expect(r.ok === false && r.errors.name).toBeTruthy();
    }
  });

  it.each(["", "a", "Slug Malo", "con_guion_bajo", "-x", "x-", "x--y", "ñandú"])(
    "rechaza el slug %j",
    (slug) => {
      const r = validateNewBusiness({ ...base, slug });
      expect(r.ok === false && r.errors.slug).toBeTruthy();
    },
  );

  it("rechaza un slug de más de 40 caracteres", () => {
    const r = validateNewBusiness({ ...base, slug: "a".repeat(41) });
    expect(r.ok === false && r.errors.slug).toBeTruthy();
  });

  it.each(["abc", "12345", "1".repeat(16), "hola"])(
    "rechaza el WhatsApp %j",
    (whatsapp) => {
      const r = validateNewBusiness({ ...base, whatsapp });
      expect(r.ok === false && r.errors.whatsapp).toBeTruthy();
    },
  );

  it("acepta el WhatsApp con símbolos y espacios", () => {
    expect(
      validateNewBusiness({ ...base, whatsapp: "+54 9 351 000-0001" }),
    ).toEqual({ ok: true });
  });

  it("rechaza un email de dueño inválido", () => {
    const r = validateNewBusiness({ ...base, ownerEmail: "dueno@" });
    expect(r.ok === false && r.errors.ownerEmail).toBeTruthy();
  });
});

describe("validateMember — ADMIN-SUPER-4", () => {
  it("acepta email válido y rol conocido", () => {
    expect(validateMember({ email: "a@b.com", role: "staff" })).toEqual({
      ok: true,
    });
    expect(validateMember({ email: "a@b.com", role: "owner" })).toEqual({
      ok: true,
    });
  });

  it("rechaza un rol desconocido", () => {
    const r = validateMember({ email: "a@b.com", role: "admin" });
    expect(r.ok === false && r.errors.role).toBeTruthy();
  });

  it("rechaza un email inválido", () => {
    const r = validateMember({ email: "nada", role: "owner" });
    expect(r.ok === false && r.errors.email).toBeTruthy();
  });
});
