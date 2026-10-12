// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MpApiError } from "./api";
import { resolveCredentials, type ConnectionRecord, type ConnectionStore, type CredentialsDeps } from "./credentials";
import { encryptSecret } from "./crypto";

// MP-18 a MP-22 y MP-26: de dónde salen las credenciales de un negocio y cómo se renueva el token, con un
// almacén en memoria que respeta la misma lógica de comparar y reemplazar que la base. La prueba contra
// Postgres real está en `flujo-oauth.test.ts`.
const BUSINESS = "a1a1a1a1-0000-0000-0000-000000000001";
const OTHER = "b2b2b2b2-0000-0000-0000-000000000002";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const APP_SECRET = "CLAVE-DE-LA-APP";
const MANUAL = { accessToken: "TOKEN-MANUAL", webhookSecret: "SECRETO-MANUAL", enabled: true };

function memoryStore(initial: ConnectionRecord | null) {
  const row = initial ? { ...initial, refreshingUntil: null as Date | null } : null;

  const store: ConnectionStore & { row: () => typeof row } = {
    row: () => row,
    async find() {
      return row ? { ...row } : null;
    },
    async acquireLease(_id, refreshTokenEnc, now, until) {
      if (!row || row.status !== "connected" || row.refreshTokenEnc !== refreshTokenEnc) return false;
      if (row.refreshingUntil && row.refreshingUntil > now) return false;
      row.refreshingUntil = until;
      return true;
    },
    async saveRenewed(_id, refreshTokenEnc, next) {
      if (!row || row.status !== "connected" || row.refreshTokenEnc !== refreshTokenEnc) return false;
      Object.assign(row, next, { refreshingUntil: null });
      return true;
    },
    async releaseLease(_id, refreshTokenEnc) {
      if (row && row.refreshTokenEnc === refreshTokenEnc) row.refreshingUntil = null;
    },
    async markNeedsReconnect(_id, refreshTokenEnc) {
      if (!row || row.status !== "connected" || row.refreshTokenEnc !== refreshTokenEnc) return false;
      row.status = "needs_reconnect";
      row.refreshingUntil = null;
      return true;
    },
  };

  return store;
}

const connection = (extra: Partial<ConnectionRecord> = {}, business = BUSINESS): ConnectionRecord => ({
  mpUserId: 777,
  accessTokenEnc: encryptSecret("ACCESS-VIEJO", business).value,
  refreshTokenEnc: encryptSecret("REFRESH-VIEJO", business).value,
  keyVersion: 1,
  expiresAt: new Date(NOW + 100 * DAY),
  status: "connected",
  ...extra,
});

const refreshed = (extra: Record<string, unknown> = {}) => ({
  access_token: "ACCESS-NUEVO",
  refresh_token: "REFRESH-NUEVO",
  expires_in: 180 * 24 * 60 * 60,
  user_id: 777,
  ...extra,
});

function setup(
  initial: ConnectionRecord | null,
  options: {
    manual?: typeof MANUAL | null;
    refresh?: CredentialsDeps["refresh"];
    sleep?: CredentialsDeps["sleep"];
  } = {},
) {
  const store = memoryStore(initial);
  const refresh = vi.fn(options.refresh ?? (async () => refreshed()));
  const sleep = vi.fn(options.sleep ?? (async () => undefined));
  const deps: CredentialsDeps = {
    store,
    manual: vi.fn(async () => (options.manual === undefined ? null : options.manual)),
    refresh,
    webhookSecret: () => APP_SECRET,
    now: () => NOW,
    sleep,
  };

  return { deps, store, refresh, sleep };
}

let logged: string;

beforeEach(() => {
  vi.stubEnv("MP_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  logged = "";
  const capture = (...args: unknown[]) => {
    logged += args.map(String).join(" ") + "\n";
  };
  vi.spyOn(console, "error").mockImplementation(capture);
  vi.spyOn(console, "warn").mockImplementation(capture);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Las claves se generan en cada test: hay que cifrar DESPUÉS de `beforeEach`.
const build = (extra: Partial<ConnectionRecord> = {}, business = BUSINESS) => connection(extra, business);

describe("de dónde salen las credenciales — MP-18", () => {
  it("con una conexión connected usa su token descifrado, su mp_user_id y la clave de la app", async () => {
    const { deps } = setup(build(), { manual: MANUAL });
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(credentials).toMatchObject({
      source: "oauth",
      mpUserId: 777,
      accessToken: "ACCESS-VIEJO",
      webhookSecret: APP_SECRET,
      fallbackWebhookSecret: "SECRETO-MANUAL",
      enabled: true,
    });
  });

  it("sin conexión usa payment_credentials como antes", async () => {
    const { deps } = setup(null, { manual: MANUAL });

    expect(await resolveCredentials(deps, BUSINESS)).toEqual({ ...MANUAL, source: "manual" });
  });

  it("sin conexión y sin credenciales no hay con qué cobrar", async () => {
    const { deps } = setup(null);

    expect(await resolveCredentials(deps, BUSINESS)).toBeNull();
  });

  it("una conexión revocada cae a las credenciales manuales", async () => {
    const { deps } = setup(build({ status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, expiresAt: null }), {
      manual: MANUAL,
    });

    expect(await resolveCredentials(deps, BUSINESS)).toEqual({ ...MANUAL, source: "manual" });
  });

  it("una conexión en needs_reconnect con credenciales manuales cobra con las manuales", async () => {
    const { deps, refresh } = setup(build({ status: "needs_reconnect" }), { manual: MANUAL });

    expect(await resolveCredentials(deps, BUSINESS)).toEqual({ ...MANUAL, source: "manual" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("una conexión en needs_reconnect sin credenciales manuales no tiene token útil (MP-22)", async () => {
    const { deps, refresh } = setup(build({ status: "needs_reconnect" }));
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(credentials).toMatchObject({ source: "oauth", accessToken: "", enabled: false, webhookSecret: APP_SECRET });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("si el token no se descifra no usa la conexión ni cae a las credenciales manuales", async () => {
    // Cifrado para otro negocio: el dato asociado no coincide.
    const { deps, refresh } = setup(build({}, OTHER), { manual: MANUAL });
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(credentials).toMatchObject({ source: "oauth", accessToken: "", enabled: false });
    expect(credentials?.accessToken).not.toBe(MANUAL.accessToken);
    expect(refresh).not.toHaveBeenCalled();
    expect(logged).not.toMatch(/ACCESS-VIEJO|REFRESH-VIEJO|TOKEN-MANUAL/);
  });

  it("con una versión de clave desconocida tampoco la usa", async () => {
    const { deps } = setup(build({ keyVersion: 9 }), { manual: MANUAL });

    expect(await resolveCredentials(deps, BUSINESS)).toMatchObject({ accessToken: "", enabled: false });
  });
});

describe("renovación del token — MP-19", () => {
  it("con el token lejos de vencer no renueva", async () => {
    const { deps, refresh } = setup(build({ expiresAt: new Date(NOW + 31 * DAY) }));

    expect((await resolveCredentials(deps, BUSINESS))?.accessToken).toBe("ACCESS-VIEJO");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a menos de 30 días renueva, usa el token nuevo y guarda ambos cifrados", async () => {
    const { deps, store, refresh } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }));
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(refresh).toHaveBeenCalledTimes(1);
    // Se manda el refresh_token descifrado.
    expect(refresh).toHaveBeenCalledWith("REFRESH-VIEJO");
    expect(credentials?.accessToken).toBe("ACCESS-NUEVO");

    const saved = store.row()!;
    expect(saved.expiresAt?.getTime()).toBe(NOW + 180 * DAY);
    expect(saved.refreshingUntil).toBeNull();
    // Cifrados: nada en claro en lo guardado.
    expect(JSON.stringify(saved)).not.toMatch(/ACCESS-NUEVO|REFRESH-NUEVO/);

    // La próxima vez usa el nuevo, sin renovar otra vez.
    const next = await resolveCredentials(deps, BUSINESS);
    expect(next?.accessToken).toBe("ACCESS-NUEVO");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("con el token vencido también renueva", async () => {
    const { deps, refresh } = setup(build({ expiresAt: new Date(NOW - DAY) }));

    expect((await resolveCredentials(deps, BUSINESS))?.accessToken).toBe("ACCESS-NUEVO");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["sin access_token", { access_token: undefined }],
    ["sin refresh_token", { refresh_token: undefined }],
    ["sin expires_in", { expires_in: undefined }],
    ["con expires_in en cero", { expires_in: 0 }],
    ["con otro user_id", { user_id: 999 }],
  ])("una respuesta %s no guarda nada ni marca la conexión", async (_name, extra) => {
    const initial = build({ expiresAt: new Date(NOW + 10 * DAY) });
    const { deps, store } = setup(initial, { refresh: async () => refreshed(extra) });
    const credentials = await resolveCredentials(deps, BUSINESS);

    const row = store.row()!;
    expect(row.status).toBe("connected");
    expect(row.refreshTokenEnc).toBe(initial.refreshTokenEnc);
    expect(row.accessTokenEnc).toBe(initial.accessTokenEnc);
    expect(row.refreshingUntil).toBeNull();
    // Todavía vale: se sigue usando el actual.
    expect(credentials?.accessToken).toBe("ACCESS-VIEJO");
  });
});

describe("no gastar el refresh_token dos veces — MP-20", () => {
  it("dos pedidos a la vez renuevan una sola vez", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { deps, refresh } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
      refresh: async () => {
        await gate;
        return refreshed();
      },
    });

    const first = resolveCredentials(deps, BUSINESS);
    const second = resolveCredentials(deps, BUSINESS);
    // El segundo no espera la renovación: el token actual todavía vale.
    expect((await second)?.accessToken).toBe("ACCESS-VIEJO");

    release();
    expect((await first)?.accessToken).toBe("ACCESS-NUEVO");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("con el token vencido, quien pierde la carrera espera y usa el token que dejó el otro", async () => {
    let release!: () => void;
    let markSaved!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const saved = new Promise<void>((resolve) => (markSaved = resolve));
    const { deps, store, refresh } = setup(build({ expiresAt: new Date(NOW - DAY) }), {
      refresh: async () => {
        await gate;
        return refreshed();
      },
      // La espera deja terminar al que renueva y vuelve cuando ya guardó: sin temporizadores.
      sleep: async () => {
        release();
        await saved;
      },
    });
    const save = store.saveRenewed;
    store.saveRenewed = async (...args) => {
      const result = await save(...args);
      markSaved();
      return result;
    };

    const [a, b] = await Promise.all([resolveCredentials(deps, BUSINESS), resolveCredentials(deps, BUSINESS)]);

    expect(a?.accessToken).toBe("ACCESS-NUEVO");
    expect(b?.accessToken).toBe("ACCESS-NUEVO");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("vencido y con el arriendo tomado que nunca termina: no cobra, espera acotado y no marca la conexión", async () => {
    const { deps, store, refresh, sleep } = setup(build({ expiresAt: new Date(NOW - DAY) }));
    store.row()!.refreshingUntil = new Date(NOW + 20_000);

    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(credentials).toMatchObject({ accessToken: "", enabled: false });
    expect(refresh).not.toHaveBeenCalled();
    expect(sleep.mock.calls.length).toBeGreaterThan(0);
    expect(sleep.mock.calls.length).toBeLessThanOrEqual(6);
    expect(store.row()!.status).toBe("connected");
  });

  it("un arriendo vencido (quien renovaba se cayó) se vuelve a tomar", async () => {
    const { deps, store, refresh } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }));
    store.row()!.refreshingUntil = new Date(NOW - 1000);

    expect((await resolveCredentials(deps, BUSINESS))?.accessToken).toBe("ACCESS-NUEVO");
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("errores al renovar — MP-21", () => {
  it.each([
    ["500", new MpApiError(500)],
    ["503", new MpApiError(503)],
    ["429", new MpApiError(429)],
    ["red caída", new TypeError("fetch failed")],
    ["tiempo agotado", Object.assign(new Error("timeout"), { name: "TimeoutError" })],
  ])("un error transitorio (%s) no marca needs_reconnect y suelta el arriendo", async (_name, error) => {
    const { deps, store } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
      refresh: async () => {
        throw error;
      },
    });
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(store.row()!.status).toBe("connected");
    expect(store.row()!.refreshingUntil).toBeNull();
    // El token actual todavía vale: se sigue cobrando con él.
    expect(credentials?.accessToken).toBe("ACCESS-VIEJO");
  });

  it("un error transitorio con el token ya vencido no cobra, pero tampoco marca la conexión", async () => {
    const { deps, store } = setup(build({ expiresAt: new Date(NOW - DAY) }), {
      refresh: async () => {
        throw new MpApiError(502);
      },
    });
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(credentials).toMatchObject({ accessToken: "", enabled: false });
    expect(store.row()!.status).toBe("connected");
  });

  it.each([400, 401])("un %s con invalid_grant al renovar marca needs_reconnect", async (status) => {
    const { deps, store } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
      refresh: async () => {
        throw new MpApiError(status, "invalid_grant");
      },
    });
    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(store.row()!.status).toBe("needs_reconnect");
    expect(credentials).toMatchObject({ accessToken: "", enabled: false });

    // Y de ahí en más no se vuelve a intentar con ese refresh_token.
    const refresh = vi.fn();
    await resolveCredentials({ ...deps, refresh }, BUSINESS);
    expect(refresh).not.toHaveBeenCalled();
  });

  // Un client_secret rotado o un pedido mal armado no son "el negocio revocó el acceso": marcar a todos los
  // negocios como "reconectar" al primer cobro sería peor que el problema (MP-21).
  it.each([
    ["400 con invalid_client", new MpApiError(400, "invalid_client")],
    ["401 con invalid_client", new MpApiError(401, "invalid_client")],
    ["400 con invalid_request", new MpApiError(400, "invalid_request")],
    ["400 con unauthorized_client", new MpApiError(400, "unauthorized_client")],
    ["400 con invalid_scope", new MpApiError(400, "invalid_scope")],
    ["400 sin código", new MpApiError(400)],
    ["401 sin código", new MpApiError(401)],
  ])("un %s NO marca needs_reconnect: usa el token vigente y registra solo el código", async (_name, error) => {
    const { deps, store } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
      refresh: async () => {
        throw error;
      },
    });

    const credentials = await resolveCredentials(deps, BUSINESS);

    expect(store.row()!.status).toBe("connected");
    expect(store.row()!.refreshingUntil).toBeNull();
    expect(credentials?.accessToken).toBe("ACCESS-VIEJO");

    expect(logged).toContain(String(error.status));
    expect(logged).toContain(error.code ?? "sin_codigo");
    expect(logged).not.toMatch(/ACCESS-VIEJO|REFRESH-VIEJO|CLAVE-DE-LA-APP/);
  });

  it("un invalid_client con el token ya vencido no cobra, pero tampoco marca la conexión", async () => {
    const { deps, store } = setup(build({ expiresAt: new Date(NOW - DAY) }), {
      refresh: async () => {
        throw new MpApiError(401, "invalid_client");
      },
    });

    expect(await resolveCredentials(deps, BUSINESS)).toMatchObject({ accessToken: "", enabled: false });
    expect(store.row()!.status).toBe("connected");
  });

  it("al marcar needs_reconnect con credenciales manuales habilitadas, esa misma llamada ya cobra con ellas", async () => {
    const { deps, store } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
      manual: MANUAL,
      refresh: async () => {
        throw new MpApiError(400, "invalid_grant");
      },
    });

    expect(await resolveCredentials(deps, BUSINESS)).toEqual({ ...MANUAL, source: "manual" });
    expect(store.row()!.status).toBe("needs_reconnect");
  });

  it("needs_reconnect con credenciales manuales deshabilitadas: sin token útil, pero con su clave para el webhook", async () => {
    const { deps } = setup(build({ status: "needs_reconnect" }), { manual: { ...MANUAL, enabled: false } });

    expect(await resolveCredentials(deps, BUSINESS)).toMatchObject({
      source: "oauth",
      accessToken: "",
      enabled: false,
      webhookSecret: APP_SECRET,
      fallbackWebhookSecret: "SECRETO-MANUAL",
    });
  });

  it("antes de marcar relee la fila: si otro ya renovó, usa su token y no marca", async () => {
    const next = encryptSecret("ACCESS-DEL-OTRO", BUSINESS).value;
    const nextRefresh = encryptSecret("REFRESH-DEL-OTRO", BUSINESS).value;
    const initial = build({ expiresAt: new Date(NOW + 10 * DAY) });
    const ctx = setup(initial, {
      refresh: async () => {
        // Mientras Mercado Pago rechazaba el nuestro, otro dejó un token nuevo.
        Object.assign(ctx.store.row()!, {
          accessTokenEnc: next,
          refreshTokenEnc: nextRefresh,
          expiresAt: new Date(NOW + 180 * DAY),
        });
        throw new MpApiError(400, "invalid_grant");
      },
    });

    const credentials = await resolveCredentials(ctx.deps, BUSINESS);

    expect(ctx.store.row()!.status).toBe("connected");
    expect(credentials?.accessToken).toBe("ACCESS-DEL-OTRO");
  });

  it("si se desconectó mientras renovaba, no se pisa con tokens nuevos", async () => {
    const ctx = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
      refresh: async () => {
        ctx.store.row()!.status = "revoked";
        return refreshed();
      },
    });

    const credentials = await resolveCredentials(ctx.deps, BUSINESS);

    expect(ctx.store.row()!.accessTokenEnc).not.toBeNull();
    expect(JSON.stringify(ctx.store.row())).not.toMatch(/ACCESS-NUEVO/);
    expect(credentials?.accessToken).not.toBe("ACCESS-NUEVO");
  });
});

describe("ningún secreto sale en logs ni errores — MP-26", () => {
  it("ni el token, ni el refresh, ni la clave de la app aparecen en lo que se registra", async () => {
    for (const error of [new MpApiError(400, "invalid_grant"), new MpApiError(400, "invalid_client"), new MpApiError(500), new TypeError("ACCESS-VIEJO REFRESH-VIEJO")]) {
      const { deps } = setup(build({ expiresAt: new Date(NOW + 10 * DAY) }), {
        refresh: async () => {
          throw error;
        },
      });
      await resolveCredentials(deps, BUSINESS);
    }

    const { deps } = setup(build({}, OTHER), { manual: MANUAL });
    await resolveCredentials(deps, BUSINESS);

    expect(logged).not.toMatch(/ACCESS-VIEJO|REFRESH-VIEJO|ACCESS-NUEVO|REFRESH-NUEVO|TOKEN-MANUAL|CLAVE-DE-LA-APP/);
  });
});
