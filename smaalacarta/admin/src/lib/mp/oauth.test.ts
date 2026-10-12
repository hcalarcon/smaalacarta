// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MpApiError } from "./api";
import { decryptSecret } from "./crypto";
import {
  MP_AUTH_URL,
  MP_TOKEN_URL,
  completeOAuth,
  disconnectOAuth,
  startOAuth,
  type OAuthActor,
  type OAuthDeps,
} from "./oauth";

// MP-9 a MP-16: las reglas de conectar y desconectar, con la base y Mercado Pago simulados.
const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const OTHER_BUSINESS = "b2b2b2b2-0000-0000-0000-000000000002";
const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER_USER = "cccccccc-0000-0000-0000-000000000003";
const ORIGIN = "https://www.smaalacarta.com.ar";
const NOW = Date.parse("2026-10-12T15:00:00Z");

const SECRETS = {
  accessToken: "APP_USR-ACCESS-SECRETO",
  refreshToken: "TG-REFRESH-SECRETO",
  clientSecret: "CLIENT-SECRET-SECRETO",
  code: "TG-CODE-SECRETO",
};

const owner: OAuthActor = { userId: OWNER, businessId: BUSINESS, role: "owner" };
const staff: OAuthActor = { userId: OTHER_USER, businessId: BUSINESS, role: "staff" };

type StateRow = {
  businessId: string;
  userId: string;
  codeVerifierEnc: string;
  expiresAt: number;
  usedAt: number | null;
};

type Saved = {
  businessId: string;
  mpUserId: number;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  keyVersion: number;
  expiresAt: Date;
  scope: string | null;
  connectedBy: string;
};

function fake(extra: Partial<OAuthDeps> = {}) {
  const states = new Map<string, StateRow>();
  const connections = new Map<string, Saved & { status: string }>();
  let randoms = 0;

  const deps: OAuthDeps = {
    now: () => NOW,
    random: (n) => Buffer.alloc(n, ++randoms),
    globalEnabled: true,
    testMode: false,
    clientId: "1234567890",
    clientSecret: SECRETS.clientSecret,
    siteOrigin: ORIGIN,
    isBusinessEnabled: vi.fn(async () => true),
    allowStart: vi.fn(() => true),
    insertState: vi.fn(async (row) => {
      states.set(row.stateHash, {
        businessId: row.businessId,
        userId: row.userId,
        codeVerifierEnc: row.codeVerifierEnc,
        expiresAt: row.expiresAt.getTime(),
        usedAt: null,
      });
    }),
    // Como el UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING de la base.
    consumeState: vi.fn(async (hash, now) => {
      const row = states.get(hash);
      if (!row || row.usedAt !== null || row.expiresAt <= now.getTime()) return null;
      row.usedAt = now.getTime();
      return { businessId: row.businessId, userId: row.userId, codeVerifierEnc: row.codeVerifierEnc };
    }),
    findConnectionOwner: vi.fn(async (mpUserId) => {
      for (const c of connections.values()) if (c.mpUserId === mpUserId) return c.businessId;
      return null;
    }),
    saveConnection: vi.fn(async (row) => {
      connections.set(row.businessId, { ...row, status: "connected" });
    }),
    revokeConnection: vi.fn(async (businessId) => {
      const c = connections.get(businessId);
      if (c) connections.set(businessId, { ...c, status: "revoked", accessTokenEnc: "", refreshTokenEnc: "" });
    }),
    mp: {
      exchangeCode: vi.fn(async () => ({
        access_token: SECRETS.accessToken,
        refresh_token: SECRETS.refreshToken,
        user_id: 777,
        expires_in: 15552000,
        scope: "offline_access read write",
        token_type: "Bearer",
      })),
      getMe: vi.fn(async () => ({ id: 777, site_id: "MLA" })),
    },
    ...extra,
  };

  return { deps, states, connections };
}

const stateOf = (url: string) => new URL(url).searchParams.get("state") as string;
const hashOf = (state: string) => createHash("sha256").update(state).digest("hex");

async function begin(deps: OAuthDeps, actor: OAuthActor = owner) {
  const r = await startOAuth(deps, actor, { origin: ORIGIN });
  if (r.status !== 200) throw new Error(`start respondió ${r.status}`);
  return { url: r.body.url as string, state: stateOf(r.body.url as string) };
}

let logged: string[] = [];

beforeEach(() => {
  vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  logged = [];
  for (const method of ["error", "warn", "log"] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      logged.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST start — MP-9, MP-10, MP-11, MP-15", () => {
  it("devuelve la URL de autorización con PKCE S256 y el state, y guarda solo sus hashes", async () => {
    const { deps, states } = fake();
    const r = await startOAuth(deps, owner, { origin: ORIGIN });

    expect(r.status).toBe(200);
    const url = new URL(r.body.url as string);
    expect(`${url.origin}${url.pathname}`).toBe(MP_AUTH_URL);
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("platform_id")).toBe("mp");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/admin/api/mp/oauth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    const state = stateOf(r.body.url as string);
    expect(Buffer.from(state, "base64url")).toHaveLength(32);

    // Solo el hash del state llega a la base, atado al negocio y al usuario, y vence a los 10 minutos.
    expect([...states.keys()]).toEqual([hashOf(state)]);
    const row = states.get(hashOf(state)) as StateRow;
    expect(row.businessId).toBe(BUSINESS);
    expect(row.userId).toBe(OWNER);
    expect(row.expiresAt).toBe(NOW + 10 * 60 * 1000);

    // El challenge es el SHA-256 del verifier guardado (cifrado, atado al negocio).
    const verifier = decryptSecret(row.codeVerifierEnc, BUSINESS, 1);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(row.codeVerifierEnc).not.toContain(verifier);
  });

  it("cada intento usa un state distinto", async () => {
    const { deps } = fake();
    const a = await begin(deps);
    const b = await begin(deps);

    expect(a.state).not.toBe(b.state);
  });

  it("un miembro staff no conecta (MP-9) y no deja ningún state", async () => {
    const { deps, states } = fake();
    const r = await startOAuth(deps, staff, { origin: ORIGIN });

    expect(r.status).toBe(403);
    expect(states.size).toBe(0);
  });

  it("sin sesión responde 401", async () => {
    const { deps } = fake();
    const r = await startOAuth(deps, null, { origin: ORIGIN });

    expect(r.status).toBe(401);
  });

  it("el interruptor global apagado responde 404 sin tocar la base", async () => {
    const { deps, states } = fake({ globalEnabled: false });
    const r = await startOAuth(deps, owner, { origin: ORIGIN });

    expect(r).toEqual({ status: 404, body: { error: "not_found" } });
    expect(deps.isBusinessEnabled).not.toHaveBeenCalled();
    expect(states.size).toBe(0);
  });

  it("el interruptor del negocio apagado responde el mismo 404", async () => {
    const { deps, states } = fake({ isBusinessEnabled: vi.fn(async () => false) });
    const r = await startOAuth(deps, owner, { origin: ORIGIN });

    expect(r).toEqual({ status: 404, body: { error: "not_found" } });
    expect(states.size).toBe(0);
  });

  it("un Origin que no es el del sitio responde 403; sin Origin se acepta", async () => {
    const { deps } = fake();

    const evil = await startOAuth(deps, owner, { origin: "https://malo.example" });
    expect(evil.status).toBe(403);

    const none = await startOAuth(deps, owner, { origin: null });
    expect(none.status).toBe(200);
  });

  it("frena a un negocio que pide sin pausa", async () => {
    const { deps, states } = fake({ allowStart: vi.fn(() => false) });
    const r = await startOAuth(deps, owner, { origin: ORIGIN });

    expect(r.status).toBe(429);
    expect(deps.allowStart).toHaveBeenCalledWith(BUSINESS, NOW);
    expect(states.size).toBe(0);
  });

  it("sin client_id o client_secret responde 503 y no guarda nada", async () => {
    const { deps, states } = fake({ clientSecret: null });
    const r = await startOAuth(deps, owner, { origin: ORIGIN });

    expect(r.status).toBe(503);
    expect(states.size).toBe(0);
  });
});

describe("GET callback — MP-10, MP-11, MP-13", () => {
  it("canjea el código, confirma la cuenta y guarda los tokens cifrados", async () => {
    const { deps, connections } = fake();
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: SECRETS.code, state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=connected" });

    // Manda el code_verifier y el redirect_uri exactos, y test_token solo en modo de prueba.
    const call = (deps.mp.exchangeCode as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call).toMatchObject({
      clientId: "1234567890",
      clientSecret: SECRETS.clientSecret,
      code: SECRETS.code,
      redirectUri: `${ORIGIN}/admin/api/mp/oauth/callback`,
      testToken: false,
    });
    expect(call.codeVerifier.length).toBeGreaterThanOrEqual(43);

    const saved = connections.get(BUSINESS) as Saved & { status: string };
    expect(saved.status).toBe("connected");
    expect(saved.mpUserId).toBe(777);
    expect(saved.connectedBy).toBe(OWNER);
    expect(saved.scope).toBe("offline_access read write");
    expect(saved.expiresAt.getTime()).toBe(NOW + 15552000 * 1000);
    expect(saved.accessTokenEnc).not.toContain("APP_USR");
    expect(decryptSecret(saved.accessTokenEnc, BUSINESS, saved.keyVersion)).toBe(SECRETS.accessToken);
    expect(decryptSecret(saved.refreshTokenEnc, BUSINESS, saved.keyVersion)).toBe(SECRETS.refreshToken);
  });

  it("manda test_token solo si el modo de prueba está encendido", async () => {
    const { deps } = fake({ testMode: true });
    const { state } = await begin(deps);
    await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect((deps.mp.exchangeCode as ReturnType<typeof vi.fn>).mock.calls[0][0].testToken).toBe(true);
  });

  it("un state inexistente no canjea nada", async () => {
    const { deps, connections } = fake();
    const r = await completeOAuth(deps, owner, { code: "c", state: "inventado", error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.mp.exchangeCode).not.toHaveBeenCalled();
    expect(connections.size).toBe(0);
  });

  it("un state ya usado no se canjea dos veces", async () => {
    const { deps } = fake();
    const { state } = await begin(deps);

    await completeOAuth(deps, owner, { code: "c", state, error: null });
    const again = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(again).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.mp.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it("un state vencido no canjea nada", async () => {
    let now = NOW;
    const { deps } = fake({ now: () => now });
    const { state } = await begin(deps);

    now = NOW + 10 * 60 * 1000 + 1;
    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.mp.exchangeCode).not.toHaveBeenCalled();
  });

  it("un state creado por otro usuario no sirve, y queda usado", async () => {
    const { deps, connections } = fake();
    const { state } = await begin(deps);

    const thief: OAuthActor = { userId: OTHER_USER, businessId: BUSINESS, role: "owner" };
    const r = await completeOAuth(deps, thief, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.mp.exchangeCode).not.toHaveBeenCalled();
    expect(connections.size).toBe(0);

    // Ni siquiera el dueño legítimo puede reusarlo después.
    const late = await completeOAuth(deps, owner, { code: "c", state, error: null });
    expect(late).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
  });

  it("un state de otro negocio no sirve", async () => {
    const { deps, connections } = fake();
    const { state } = await begin(deps);

    const elsewhere: OAuthActor = { userId: OWNER, businessId: OTHER_BUSINESS, role: "owner" };
    const r = await completeOAuth(deps, elsewhere, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(connections.size).toBe(0);
  });

  it("un miembro staff no completa la conexión aunque tenga un state", async () => {
    const { deps, connections } = fake();
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, staff, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(connections.size).toBe(0);
  });

  it("sin sesión no consume el state", async () => {
    const { deps } = fake();
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, null, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.consumeState).not.toHaveBeenCalled();
  });

  it("si Mercado Pago devuelve un error o falta el código, no canjea nada", async () => {
    const { deps } = fake();
    const { state } = await begin(deps);

    const denied = await completeOAuth(deps, owner, { code: null, state, error: "access_denied" });
    const noCode = await completeOAuth(deps, owner, { code: null, state, error: null });
    const noState = await completeOAuth(deps, owner, { code: "c", state: null, error: null });

    for (const r of [denied, noCode, noState]) {
      expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    }
    expect(deps.mp.exchangeCode).not.toHaveBeenCalled();
  });

  it("el interruptor global apagado responde 404 y no consume el state", async () => {
    const { deps } = fake();
    const { state } = await begin(deps);
    const off: OAuthDeps = { ...deps, globalEnabled: false };

    const r = await completeOAuth(off, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "not_found" });
    expect(deps.consumeState).not.toHaveBeenCalled();
  });

  it("el interruptor del negocio apagado responde 404", async () => {
    const { deps } = fake();
    const { state } = await begin(deps);
    const off: OAuthDeps = { ...deps, isBusinessEnabled: vi.fn(async () => false) };

    const r = await completeOAuth(off, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "not_found" });
  });

  it("un canje fallido no guarda nada y solo registra el código HTTP", async () => {
    const { deps, connections } = fake();
    deps.mp.exchangeCode = vi.fn(async () => {
      throw new MpApiError(400);
    });
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: SECRETS.code, state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(connections.size).toBe(0);
    expect(logged.join("\n")).toContain("400");
  });

  it.each([
    ["sin access_token", { refresh_token: "r", user_id: 777, expires_in: 100 }],
    ["sin refresh_token", { access_token: "a", user_id: 777, expires_in: 100 }],
    ["sin user_id", { access_token: "a", refresh_token: "r", expires_in: 100 }],
    ["sin expires_in", { access_token: "a", refresh_token: "r", user_id: 777 }],
    ["con un user_id que no es numérico", { access_token: "a", refresh_token: "r", user_id: "abc", expires_in: 100 }],
    ["con un expires_in que no es positivo", { access_token: "a", refresh_token: "r", user_id: 777, expires_in: 0 }],
  ])("una respuesta %s falla cerrado y no guarda nada", async (_name, body) => {
    const { deps, connections } = fake();
    deps.mp.exchangeCode = vi.fn(async () => body);
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.mp.getMe).not.toHaveBeenCalled();
    expect(connections.size).toBe(0);
  });

  it("acepta un user_id numérico como texto", async () => {
    const { deps, connections } = fake();
    deps.mp.exchangeCode = vi.fn(async () => ({
      access_token: "a",
      refresh_token: "r",
      user_id: "777",
      expires_in: 100,
    }));
    const { state } = await begin(deps);

    await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(connections.get(BUSINESS)?.mpUserId).toBe(777);
  });

  it("si users/me no coincide con el user_id del token, no guarda nada", async () => {
    const { deps, connections } = fake();
    deps.mp.getMe = vi.fn(async () => ({ id: 999, site_id: "MLA" }));
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(connections.size).toBe(0);
  });

  it("una cuenta de otro país no se conecta", async () => {
    const { deps, connections } = fake();
    deps.mp.getMe = vi.fn(async () => ({ id: 777, site_id: "MLB" }));
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(connections.size).toBe(0);
  });

  it("si users/me falla, no guarda nada", async () => {
    const { deps, connections } = fake();
    deps.mp.getMe = vi.fn(async () => {
      throw new MpApiError(500);
    });
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(connections.size).toBe(0);
  });

  it("una cuenta ya conectada a otro negocio se rechaza sin pisar nada", async () => {
    const { deps, connections } = fake();
    connections.set(OTHER_BUSINESS, {
      businessId: OTHER_BUSINESS,
      mpUserId: 777,
      accessTokenEnc: "de-otro",
      refreshTokenEnc: "de-otro",
      keyVersion: 1,
      expiresAt: new Date(NOW),
      scope: null,
      connectedBy: OTHER_USER,
      status: "connected",
    });
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
    expect(deps.saveConnection).not.toHaveBeenCalled();
    expect(connections.get(OTHER_BUSINESS)?.accessTokenEnc).toBe("de-otro");
    expect(connections.has(BUSINESS)).toBe(false);
  });

  it("si la base rechaza el guardado (cuenta repetida en una carrera), responde error", async () => {
    const { deps } = fake();
    deps.saveConnection = vi.fn(async () => {
      throw new Error("duplicate key value violates unique constraint");
    });
    const { state } = await begin(deps);

    const r = await completeOAuth(deps, owner, { code: "c", state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=error" });
  });

  it("conectar otra vez en el mismo negocio reemplaza la conexión anterior", async () => {
    const { deps, connections } = fake();

    const first = await begin(deps);
    await completeOAuth(deps, owner, { code: "c1", state: first.state, error: null });
    const before = connections.get(BUSINESS) as Saved;

    deps.mp.exchangeCode = vi.fn(async () => ({
      access_token: "NUEVO-ACCESS",
      refresh_token: "NUEVO-REFRESH",
      user_id: 888,
      expires_in: 100,
    }));
    deps.mp.getMe = vi.fn(async () => ({ id: 888, site_id: "MLA" }));

    const second = await begin(deps);
    const r = await completeOAuth(deps, owner, { code: "c2", state: second.state, error: null });
    const after = connections.get(BUSINESS) as Saved;

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=connected" });
    expect(connections.size).toBe(1);
    expect(after.mpUserId).toBe(888);
    expect(after.accessTokenEnc).not.toBe(before.accessTokenEnc);
    expect(decryptSecret(after.accessTokenEnc, BUSINESS, after.keyVersion)).toBe("NUEVO-ACCESS");
  });

  it("reconectar la misma cuenta del mismo negocio es válido", async () => {
    const { deps } = fake();
    const first = await begin(deps);
    await completeOAuth(deps, owner, { code: "c1", state: first.state, error: null });

    const second = await begin(deps);
    const r = await completeOAuth(deps, owner, { code: "c2", state: second.state, error: null });

    expect(r).toEqual({ kind: "redirect", to: "/dashboard/settings?mp=connected" });
  });
});

describe("POST disconnect — MP-9 y MP-14", () => {
  it("borra los tokens y deja la conexión revocada, sin llamar a Mercado Pago", async () => {
    const { deps, connections } = fake();
    const { state } = await begin(deps);
    await completeOAuth(deps, owner, { code: "c", state, error: null });

    const r = await disconnectOAuth(deps, owner, { origin: ORIGIN });

    expect(r).toEqual({ status: 200, body: { ok: true } });
    expect(connections.get(BUSINESS)).toMatchObject({ status: "revoked", accessTokenEnc: "", refreshTokenEnc: "" });
    expect(deps.mp.exchangeCode).toHaveBeenCalledTimes(1);
    expect(deps.mp.getMe).toHaveBeenCalledTimes(1);
  });

  it("un miembro staff no desconecta", async () => {
    const { deps } = fake();
    const r = await disconnectOAuth(deps, staff, { origin: ORIGIN });

    expect(r.status).toBe(403);
    expect(deps.revokeConnection).not.toHaveBeenCalled();
  });

  it("sin sesión responde 401", async () => {
    const { deps } = fake();
    const r = await disconnectOAuth(deps, null, { origin: ORIGIN });

    expect(r.status).toBe(401);
  });

  it("un Origin ajeno responde 403", async () => {
    const { deps } = fake();
    const r = await disconnectOAuth(deps, owner, { origin: "https://malo.example" });

    expect(r.status).toBe(403);
    expect(deps.revokeConnection).not.toHaveBeenCalled();
  });

  it("se puede desconectar aunque los interruptores estén apagados, para sacar los tokens", async () => {
    const { deps } = fake({ globalEnabled: false, isBusinessEnabled: vi.fn(async () => false) });
    const r = await disconnectOAuth(deps, owner, { origin: ORIGIN });

    expect(r.status).toBe(200);
    expect(deps.revokeConnection).toHaveBeenCalledWith(BUSINESS);
  });
});

describe("ningún secreto sale — MP-16", () => {
  it("ni las respuestas, ni los redirects, ni los logs llevan tokens, secreto, code, state o verifier", async () => {
    const outputs: unknown[] = [];

    // Camino feliz, fallos de Mercado Pago y de la base: todo lo que el usuario o los logs podrían ver.
    const happy = fake();
    const start = await startOAuth(happy.deps, owner, { origin: ORIGIN });
    outputs.push(start.body);
    const state = stateOf(start.body.url as string);
    const verifier = decryptSecret(
      (happy.states.get(hashOf(state)) as StateRow).codeVerifierEnc,
      BUSINESS,
      1,
    );
    outputs.push(await completeOAuth(happy.deps, owner, { code: SECRETS.code, state, error: null }));
    outputs.push(await disconnectOAuth(happy.deps, owner, { origin: ORIGIN }));

    for (const failure of [
      new MpApiError(401),
      new Error(`TOKEN ${SECRETS.accessToken} ${SECRETS.clientSecret} en el mensaje`),
    ]) {
      const bad = fake();
      bad.deps.mp.exchangeCode = vi.fn(async () => {
        throw failure;
      });
      const s = await begin(bad.deps);
      outputs.push(await completeOAuth(bad.deps, owner, { code: SECRETS.code, state: s.state, error: null }));
    }

    const leaky = fake();
    leaky.deps.mp.getMe = vi.fn(async () => {
      throw new Error(`falló con ${SECRETS.accessToken}`);
    });
    const s2 = await begin(leaky.deps);
    outputs.push(await completeOAuth(leaky.deps, owner, { code: SECRETS.code, state: s2.state, error: null }));

    const text = JSON.stringify(outputs) + logged.join("\n");
    // El state sí viaja dentro de la URL de autorización (es lo que MP devuelve); en el resto, jamás.
    const withoutAuthUrl = text.replace(start.body.url as string, "");

    for (const secret of [
      SECRETS.accessToken,
      SECRETS.refreshToken,
      SECRETS.clientSecret,
      SECRETS.code,
      verifier,
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(withoutAuthUrl).not.toContain(state);
  });

  it("las direcciones de Mercado Pago son las de la documentación oficial", () => {
    // https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation
    expect(MP_AUTH_URL).toBe("https://auth.mercadopago.com/authorization");
    expect(MP_TOKEN_URL).toBe("https://api.mercadopago.com/oauth/token");
  });
});
