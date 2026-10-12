// @vitest-environment node
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buildOAuthDeps = vi.fn();
const getCurrentBusiness = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mp/oauth-deps", () => ({ buildOAuthDeps: () => buildOAuthDeps() }));
vi.mock("@/lib/get-current-business", () => ({ getCurrentBusiness: () => getCurrentBusiness() }));

import * as callbackModule from "./callback/route";
import * as disconnectModule from "./disconnect/route";
import * as startModule from "./start/route";

const { GET: callback } = callbackModule;
const { POST: disconnect } = disconnectModule;
const { POST: start } = startModule;

// El pegamento de los route handlers de OAuth: método, Origin, sesión y qué responden. Las reglas de
// conexión están en `src/lib/mp/oauth.test.ts`.
const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const USER = "aaaaaaaa-0000-0000-0000-000000000001";
const ORIGIN = "https://www.smaalacarta.com.ar";
const BASE = `${ORIGIN}/admin/api/mp/oauth`;
const CLIENT_SECRET = "CLIENT-SECRET-SECRETO";

const post = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`${BASE}/${path}`, { method: "POST", headers });

const get = (path: string) => new NextRequest(`${BASE}/${path}`, { nextConfig: { basePath: "/admin" } });

const session = (role: string | null = "owner") =>
  getCurrentBusiness.mockResolvedValue({ user: { id: USER }, role, business: { id: BUSINESS } });

function deps(extra: Record<string, unknown> = {}) {
  return {
    now: () => Date.now(),
    random: (n: number) => randomBytes(n),
    globalEnabled: true,
    testMode: false,
    clientId: "1234567890",
    clientSecret: CLIENT_SECRET,
    siteOrigin: ORIGIN,
    isBusinessEnabled: vi.fn(async () => true),
    allowStart: vi.fn(() => true),
    insertState: vi.fn(async () => undefined),
    consumeState: vi.fn(async () => null),
    findConnectionOwner: vi.fn(async () => null),
    saveConnection: vi.fn(async () => undefined),
    revokeConnection: vi.fn(async () => undefined),
    mp: { exchangeCode: vi.fn(), getMe: vi.fn() },
    ...extra,
  };
}

beforeEach(() => {
  vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  buildOAuthDeps.mockReset();
  buildOAuthDeps.mockReturnValue(deps());
  getCurrentBusiness.mockReset();
  session();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("solo los métodos que corresponden", () => {
  it("start y disconnect no exponen GET; callback no expone POST", () => {
    expect("GET" in startModule).toBe(false);
    expect("GET" in disconnectModule).toBe(false);
    expect("POST" in callbackModule).toBe(false);
  });
});

describe("POST /oauth/start", () => {
  it("devuelve la URL de autorización y no se cachea", async () => {
    const res = await start(post("start", { origin: ORIGIN }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new URL(body.url).origin).toBe("https://auth.mercadopago.com");
    expect(JSON.stringify(body)).not.toContain(CLIENT_SECRET);
  });

  it("un Origin ajeno responde 403", async () => {
    const res = await start(post("start", { origin: "https://malo.example" }));

    expect(res.status).toBe(403);
  });

  it("sin sesión responde 401 y sin negocio también", async () => {
    getCurrentBusiness.mockResolvedValue(null);
    expect((await start(post("start"))).status).toBe(401);

    getCurrentBusiness.mockResolvedValue({ user: { id: USER }, role: null, business: null });
    expect((await start(post("start"))).status).toBe(401);
  });

  it("un miembro staff recibe 403", async () => {
    session("staff");
    const res = await start(post("start"));

    expect(res.status).toBe(403);
  });

  it("con un interruptor apagado responde un 404 genérico", async () => {
    buildOAuthDeps.mockReturnValue(deps({ globalEnabled: false }));
    const off = await start(post("start"));
    expect(off.status).toBe(404);
    expect(await off.json()).toEqual({ error: "not_found" });

    buildOAuthDeps.mockReturnValue(deps({ isBusinessEnabled: vi.fn(async () => false) }));
    const business = await start(post("start"));
    expect(business.status).toBe(404);
    expect(await business.json()).toEqual({ error: "not_found" });
  });

  it("sin la clave de servicio responde 503", async () => {
    buildOAuthDeps.mockImplementation(() => {
      throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
    });
    const res = await start(post("start"));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("un error inesperado responde 500 sin detalles", async () => {
    buildOAuthDeps.mockReturnValue(
      deps({
        insertState: vi.fn(async () => {
          throw new Error(`SECRETO ${CLIENT_SECRET} en el mensaje`);
        }),
      }),
    );
    const res = await start(post("start"));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain("SECRETO");
  });
});

describe("GET /oauth/callback", () => {
  it("un state inválido vuelve a Configuración con un mensaje genérico, sin el code ni el state", async () => {
    const res = await callback(get("callback?code=TG-CODE-SECRETO&state=STATE-SECRETO"));
    const location = res.headers.get("location") as string;

    expect(res.status).toBe(307);
    expect(location).toBe("https://www.smaalacarta.com.ar/admin/dashboard/settings?mp=error");
    expect(location).not.toContain("SECRETO");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("una conexión lograda vuelve con un mensaje corto", async () => {
    const stored = {
      businessId: BUSINESS,
      userId: USER,
      // Cifrado de verdad con la clave del test: el servicio lo descifra.
      codeVerifierEnc: (await import("@/lib/mp/crypto")).encryptSecret("VERIFIER", BUSINESS).value,
    };
    buildOAuthDeps.mockReturnValue(
      deps({
        consumeState: vi.fn(async () => stored),
        mp: {
          exchangeCode: vi.fn(async () => ({
            access_token: "APP_USR-SECRETO",
            refresh_token: "TG-SECRETO",
            user_id: 777,
            expires_in: 15552000,
          })),
          getMe: vi.fn(async () => ({ id: 777, site_id: "MLA" })),
        },
      }),
    );

    const res = await callback(get("callback?code=TG-CODE&state=ST"));

    expect(res.headers.get("location")).toBe("https://www.smaalacarta.com.ar/admin/dashboard/settings?mp=connected");
  });

  it("si Mercado Pago devuelve un error vuelve con el mensaje genérico", async () => {
    const res = await callback(get("callback?error=access_denied&state=ST"));

    expect(res.headers.get("location")).toContain("mp=error");
    expect(res.headers.get("location")).not.toContain("access_denied");
  });

  it("con un interruptor apagado responde un 404 genérico", async () => {
    buildOAuthDeps.mockReturnValue(deps({ globalEnabled: false }));
    const res = await callback(get("callback?code=c&state=s"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("un error inesperado vuelve con el mensaje genérico, sin detalles", async () => {
    buildOAuthDeps.mockImplementation(() => {
      throw new Error(`SECRETO ${CLIENT_SECRET}`);
    });
    const res = await callback(get("callback?code=c&state=s"));

    expect(res.headers.get("location")).toBe("https://www.smaalacarta.com.ar/admin/dashboard/settings?mp=error");
  });
});

describe("GET /oauth/callback detrás del rewrite de landing/ — MP-17", () => {
  // Llega con el host del deploy directo de admin/ y con el basePath vacío en nextUrl.
  const behindRewrite = (query: string) =>
    new NextRequest(`https://smaalacarta-admin.vercel.app/api/mp/oauth/callback?${query}`);

  it("vuelve al origen público + /admin tras conectar", async () => {
    const codeVerifierEnc = (await import("@/lib/mp/crypto")).encryptSecret("VERIFIER", BUSINESS).value;
    buildOAuthDeps.mockReturnValue(
      deps({
        consumeState: vi.fn(async () => ({ businessId: BUSINESS, userId: USER, codeVerifierEnc })),
        mp: {
          exchangeCode: vi.fn(async () => ({
            access_token: "a",
            refresh_token: "r",
            user_id: 777,
            expires_in: 100,
          })),
          getMe: vi.fn(async () => ({ id: 777, site_id: "MLA" })),
        },
      }),
    );

    const res = await callback(behindRewrite("code=c&state=s"));

    expect(res.headers.get("location")).toBe("https://www.smaalacarta.com.ar/admin/dashboard/settings?mp=connected");
  });

  it("vuelve al origen público + /admin cuando falla el state", async () => {
    const res = await callback(behindRewrite("code=c&state=inventado"));

    expect(res.headers.get("location")).toBe("https://www.smaalacarta.com.ar/admin/dashboard/settings?mp=error");
  });

  it("vuelve al origen público + /admin aun si el error ocurre al armar las dependencias", async () => {
    buildOAuthDeps.mockImplementation(() => {
      throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
    });
    const res = await callback(behindRewrite("code=c&state=s"));

    expect(res.headers.get("location")).toBe("https://www.smaalacarta.com.ar/admin/dashboard/settings?mp=error");
  });
});

describe("POST /oauth/disconnect", () => {
  it("el dueño desconecta", async () => {
    const d = deps();
    buildOAuthDeps.mockReturnValue(d);
    const res = await disconnect(post("disconnect", { origin: ORIGIN }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(d.revokeConnection).toHaveBeenCalledWith(BUSINESS);
  });

  it("un Origin ajeno responde 403 y no toca nada", async () => {
    const d = deps();
    buildOAuthDeps.mockReturnValue(d);
    const res = await disconnect(post("disconnect", { origin: "https://malo.example" }));

    expect(res.status).toBe(403);
    expect(d.revokeConnection).not.toHaveBeenCalled();
  });

  it("un miembro staff recibe 403", async () => {
    session("staff");
    const res = await disconnect(post("disconnect"));

    expect(res.status).toBe(403);
  });
});
