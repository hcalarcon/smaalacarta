import { describe, expect, it } from "vitest";

import { settingsErrorMessage } from "./messages";

describe("settingsErrorMessage", () => {
  it("formato inválido", () => {
    expect(settingsErrorMessage({ code: "23514" })).toMatch(/formato/i);
  });

  it("sin permiso", () => {
    expect(settingsErrorMessage({ code: "42501" })).toMatch(/permiso/i);
  });

  it("nunca muestra el texto técnico de la base", () => {
    const message = settingsErrorMessage({ code: "XX000", message: "relation exploded" });
    expect(message).not.toMatch(/exploded/);
    expect(message).toBe("No pudimos guardar la configuración. Probá de nuevo.");
  });
});
