// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchange = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase-server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

import { GET } from "./route";

// La app vive bajo el basePath "/admin": un redirect armado a mano tiene que sumarlo (ADMIN-AUTH-12).
const call = (query: string, origin = "http://localhost:3000") =>
  GET(new NextRequest(`${origin}/admin/auth/callback${query}`, { nextConfig: { basePath: "/admin" } }));

describe("/auth/callback — ADMIN-AUTH-12", () => {
  beforeEach(() => exchange.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it("con el link del mail de recuperación sigue a /admin/restablecer", async () => {
    exchange.mockResolvedValue({ error: null });
    const res = await call("?code=abc&next=/restablecer");
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/restablecer");
  });

  it("sin next sigue al panel, también bajo /admin", async () => {
    exchange.mockResolvedValue({ error: null });
    const res = await call("?code=abc", "https://smaalacarta.com.ar");
    expect(res.headers.get("location")).toBe("https://smaalacarta.com.ar/admin/dashboard");
  });

  it("si el canje falla, loguea el motivo en el servidor sin exponer el code", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    exchange.mockResolvedValue({ error: Object.assign(new Error("flow state expired"), { code: "flow_state_expired" }) });
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

  it("un link inválido o vencido vuelve a /admin/login?error=link", async () => {
    exchange.mockResolvedValue({ error: new Error("expired") });
    expect((await call("?code=abc")).headers.get("location")).toBe("http://localhost:3000/admin/login?error=link");
    expect((await call("")).headers.get("location")).toBe("http://localhost:3000/admin/login?error=link");
  });
});
