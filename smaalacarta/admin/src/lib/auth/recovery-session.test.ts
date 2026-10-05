import { describe, expect, it } from "vitest";

import {
  RECOVERY_COOKIE,
  RECOVERY_MAX_AGE_SECONDS,
  signRecovery,
  verifyRecovery,
} from "./recovery-session";

const SECRET = "clave-de-servidor-de-prueba";
const NOW = Date.UTC(2026, 9, 6, 15, 0, 0);

describe("sesión de recuperación — ADMIN-AUTH-14", () => {
  it("una marca recién firmada para ese usuario es válida", () => {
    const mark = signRecovery(SECRET, "u1", NOW);
    expect(verifyRecovery(SECRET, mark, "u1", NOW + 60_000)).toBe(true);
  });

  it("vence a los 15 minutos", () => {
    expect(RECOVERY_MAX_AGE_SECONDS).toBe(15 * 60);
    const mark = signRecovery(SECRET, "u1", NOW);
    expect(verifyRecovery(SECRET, mark, "u1", NOW + 15 * 60_000 - 1)).toBe(true);
    expect(verifyRecovery(SECRET, mark, "u1", NOW + 15 * 60_000)).toBe(false);
  });

  it("no sirve para otro usuario", () => {
    const mark = signRecovery(SECRET, "u1", NOW);
    expect(verifyRecovery(SECRET, mark, "u2", NOW)).toBe(false);
  });

  it("no se puede falsificar: con otra clave o con la fecha alterada no vale", () => {
    const mark = signRecovery(SECRET, "u1", NOW);
    const [user, , sig] = mark.split(".");

    expect(verifyRecovery("otra-clave", mark, "u1", NOW)).toBe(false);
    expect(verifyRecovery(SECRET, `${user}.${NOW + 10 * 3600_000}.${sig}`, "u1", NOW)).toBe(false);
    expect(verifyRecovery(SECRET, `u1.${NOW + 60_000}.firmainventada`, "u1", NOW)).toBe(false);
  });

  it.each([undefined, null, "", "basura", "a.b", "u1.no-es-un-numero.firma", "a.b.c.d"])(
    "una marca ausente o mal formada (%j) no vale",
    (mark) => {
      expect(verifyRecovery(SECRET, mark as string | undefined, "u1", NOW)).toBe(false);
    },
  );

  it("sin clave en el servidor no firma ni valida: falla cerrado", () => {
    expect(() => signRecovery("", "u1", NOW)).toThrow();
    expect(verifyRecovery("", signRecovery(SECRET, "u1", NOW), "u1", NOW)).toBe(false);
  });

  it("la cookie tiene un nombre fijo", () => {
    expect(RECOVERY_COOKIE).toBe("sma-recovery");
  });
});
