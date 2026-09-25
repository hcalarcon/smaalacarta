import { describe, expect, it } from "vitest";

import { superAdminErrorMessage } from "./messages";

describe("superAdminErrorMessage", () => {
  it("slug repetido", () => {
    expect(
      superAdminErrorMessage({
        code: "23505",
        message: 'duplicate key value violates unique constraint "businesses_slug_key"',
      }),
    ).toMatch(/slug/i);
  });

  it("el mismo miembro dos veces", () => {
    expect(
      superAdminErrorMessage({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "business_users_business_id_user_id_key"',
      }),
    ).toMatch(/ya es miembro/i);
  });

  it("slug con formato inválido", () => {
    expect(superAdminErrorMessage({ code: "23514" })).toMatch(/minúsculas/i);
  });

  it("cuenta inexistente", () => {
    expect(superAdminErrorMessage({ code: "23503" })).toMatch(/cuenta/i);
  });

  it("sin permiso", () => {
    expect(superAdminErrorMessage({ code: "42501" })).toMatch(/permiso/i);
  });

  it("nunca muestra el texto técnico de la base", () => {
    const m = superAdminErrorMessage({
      code: "XX000",
      message: "internal error at relation pg_something",
    });
    expect(m).not.toMatch(/pg_something/);
    expect(m).toBe("No pudimos completar la acción. Probá de nuevo.");
  });
});
