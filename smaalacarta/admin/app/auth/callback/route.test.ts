// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchange = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

import { GET } from "./route";

// La app vive bajo el basePath "/admin": un redirect armado a mano tiene que sumarlo, y tiene que
// ser relativo para que el navegador conserve el dominio con el que entró (ADMIN-AUTH-12).
const call = (query: string, origin = "https://www.smaalacarta.com.ar") =>
  GET(new NextRequest(`${origin}/admin/auth/callback${query}`, { nextConfig: { basePath: "/admin" } }));

const ok = { data: { user: { id: "u1" } }, error: null };

describe("/auth/callback — ADMIN-AUTH-12", () => {
  beforeEach(() => {
    exchange.mockReset();
    cookieStore.set.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  });
  afterEach(() => vi.restoreAllMocks());

  it("con el link del mail de recuperación sigue a /admin/restablecer, sin cambiar de dominio", async () => {
    exchange.mockResolvedValue(ok);
    const res = await call("?code=abc&next=/restablecer");
    // Relativo: no lleva el host interno del deploy (smaalacarta-admin.vercel.app).
    expect(res.headers.get("location")).toBe("/admin/restablecer");
  });

  it("sin next sigue al panel, también bajo /admin, en producción y en localhost", async () => {
    exchange.mockResolvedValue(ok);
    expect((await call("?code=abc")).headers.get("location")).toBe("/admin/dashboard");
    expect((await call("?code=abc", "http://localhost:3000")).headers.get("location")).toBe("/admin/dashboard");
  });

  it("un link inválido o vencido vuelve a /admin/login?error=link", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    exchange.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    expect((await call("?code=abc")).headers.get("location")).toBe("/admin/login?error=link");
    expect((await call("")).headers.get("location")).toBe("/admin/login?error=link");
  });

  it("si el canje falla, loguea el motivo en el servidor sin exponer el code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    exchange.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("flow state expired"), { code: "flow_state_expired" }),
    });
    await call("?code=secreto-abc&next=/restablecer");

    expect(log).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("flow state expired");
    expect(logged).toContain("flow_state_expired");
    expect(logged).not.toContain("secreto-abc");
  });

  it("sin code en el link también lo loguea", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await call("?next=/restablecer");

    expect(exchange).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("/auth/callback deja la marca de recuperación — ADMIN-AUTH-14", () => {
  beforeEach(() => {
    exchange.mockReset();
    cookieStore.set.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-de-prueba";
  });
  afterEach(() => vi.restoreAllMocks());

  it("el link de recuperación deja una marca firmada, httpOnly y acotada al panel", async () => {
    exchange.mockResolvedValue(ok);
    await call("?code=abc&next=/restablecer");

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe("sma-recovery");
    expect(value.startsWith("u1.")).toBe(true);
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 900 });
  });

  it("los demás links (confirmar cuenta, otro next) no dejan la marca", async () => {
    exchange.mockResolvedValue(ok);
    await call("?code=abc");
    await call("?code=abc&next=/dashboard");

    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("si el canje falla no deja la marca", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    exchange.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    await call("?code=abc&next=/restablecer");

    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("sin clave de servidor el link de recuperación no abre /restablecer: va a /login?error=link", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    exchange.mockResolvedValue(ok);
    const res = await call("?code=abc&next=/restablecer");

    expect(res.headers.get("location")).toBe("/admin/login?error=link");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
