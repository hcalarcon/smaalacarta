import { describe, expect, it } from "vitest";

import { authErrorMessage } from "./messages";

describe("authErrorMessage — ADMIN-AUTH-4", () => {
  it("no distingue email inexistente de contraseña incorrecta", () => {
    const message = authErrorMessage({
      code: "invalid_credentials",
      message: "Invalid login credentials",
    });
    expect(message).toBe("El email o la contraseña no son correctos.");
    expect(message).not.toMatch(/contraseña incorrecta|no existe/i);
  });

  it("explica que falta confirmar el email", () => {
    expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(
      /confirm/i,
    );
  });

  it("explica el límite de envíos de mail", () => {
    expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(
      /esper/i,
    );
  });

  it("explica que la cuenta ya existe al registrarse", () => {
    expect(authErrorMessage({ code: "user_already_exists" })).toMatch(
      /ya (existe|est[aá])/i,
    );
  });

  it("explica una contraseña débil", () => {
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/contraseña/i);
  });

  it("explica que falta configurar la clave de servicio", () => {
    expect(authErrorMessage({ code: "service_key_missing" })).toMatch(
      /clave de servicio/i,
    );
  });

  it("nunca muestra el texto en inglés de Supabase", () => {
    const message = authErrorMessage({
      code: "algo_raro",
      message: "Something exploded internally",
    });
    expect(message).not.toMatch(/exploded/);
    expect(message).toBe("No pudimos completar la acción. Probá de nuevo.");
  });

  it("tolera un error sin código", () => {
    expect(authErrorMessage({})).toBe(
      "No pudimos completar la acción. Probá de nuevo.",
    );
  });
});
