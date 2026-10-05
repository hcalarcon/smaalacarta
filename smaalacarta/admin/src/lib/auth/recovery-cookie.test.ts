// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ values: {} as Record<string, string>, delete: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in store.values ? { name, value: store.values[name] } : undefined),
    delete: store.delete,
  }),
}));

import { clearRecoverySession, hasRecoverySession } from "./recovery-cookie";
import { RECOVERY_COOKIE, signRecovery } from "./recovery-session";

describe("cookie de sesión de recuperación — ADMIN-AUTH-13 y 14", () => {
  beforeEach(() => {
    store.values = {};
    store.delete.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  });

  it("con la marca firmada de ese usuario, hay sesión de recuperación", async () => {
    store.values[RECOVERY_COOKIE] = signRecovery("clave-de-prueba", "u1");
    expect(await hasRecoverySession("u1")).toBe(true);
  });

  it("una sesión normal, sin la marca, no la tiene: no puede saltearse la contraseña actual", async () => {
    expect(await hasRecoverySession("u1")).toBe(false);
  });

  it("la marca de otro usuario o inventada no vale", async () => {
    store.values[RECOVERY_COOKIE] = signRecovery("clave-de-prueba", "u2");
    expect(await hasRecoverySession("u1")).toBe(false);

    store.values[RECOVERY_COOKIE] = "u1.9999999999999.inventada";
    expect(await hasRecoverySession("u1")).toBe(false);
  });

  it("sin clave en el servidor falla cerrado", async () => {
    store.values[RECOVERY_COOKIE] = signRecovery("clave-de-prueba", "u1");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await hasRecoverySession("u1")).toBe(false);
  });

  it("al terminar se borra la marca, en el mismo path en que se creó", async () => {
    await clearRecoverySession();
    expect(store.delete).toHaveBeenCalledWith({ name: RECOVERY_COOKIE, path: "/admin" });
  });
});
