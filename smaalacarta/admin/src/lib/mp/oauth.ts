import { createHash } from "node:crypto";

import { MpApiError } from "./api";
import { decryptSecret, encryptSecret } from "./crypto";
import type { Reply } from "./service";

// Conexión de la cuenta de Mercado Pago de un negocio por OAuth (MP-9 a MP-16), con las dependencias
// inyectadas: los route handlers de `app/api/mp/oauth/` solo las conectan a la base y a la API real.
// Documentación: https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation
export const MP_AUTH_URL = "https://auth.mercadopago.com/authorization";
export const MP_TOKEN_URL = "https://api.mercadopago.com/oauth/token";
export const MP_ME_URL = "https://api.mercadopago.com/users/me";

// El origen público del panel (donde vive /admin, por el rewrite de landing/). Es el dominio registrado en la
// aplicación de Mercado Pago y al que vuelve el callback: nunca se deduce de la request, que detrás del rewrite
// llega con el host del deploy directo de admin/ (MP-17).
export const SITE_ORIGIN = "https://www.smaalacarta.com.ar";

// La URL registrada en la aplicación de Mercado Pago: tiene que coincidir exacto con la que se manda.
export const CALLBACK_PATH = "/admin/api/mp/oauth/callback";
const SETTINGS_PATH = "/dashboard/settings";

const STATE_TTL_MS = 10 * 60 * 1000;
const COUNTRY = "MLA";

export type OAuthActor = { userId: string; businessId: string; role: string | null };

export type TokenResponse = Record<string, unknown>;
export type MeResponse = { id?: unknown; site_id?: unknown };

export type OAuthApi = {
  exchangeCode(input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
    testToken: boolean;
  }): Promise<TokenResponse>;
  getMe(accessToken: string): Promise<MeResponse>;
};

export type ConnectionRow = {
  businessId: string;
  mpUserId: number;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  keyVersion: number;
  expiresAt: Date;
  scope: string | null;
  connectedBy: string;
};

export type OAuthDeps = {
  now(): number;
  random(bytes: number): Buffer;
  // `MP_OAUTH_ENABLED === "true"` (MP-15).
  globalEnabled: boolean;
  // `MP_OAUTH_TEST_MODE === "true"`: el canje manda `test_token=true`.
  testMode: boolean;
  clientId: string | null;
  clientSecret: string | null;
  // https://www.smaalacarta.com.ar (donde vive /admin): origen permitido y base del redirect_uri.
  siteOrigin: string;
  // `businesses.mp_oauth_enabled`.
  isBusinessEnabled(businessId: string): Promise<boolean>;
  allowStart(businessId: string, now: number): boolean;
  insertState(row: {
    stateHash: string;
    businessId: string;
    userId: string;
    codeVerifierEnc: string;
    expiresAt: Date;
  }): Promise<void>;
  // Marca el state como usado y lo devuelve en una sola operación (no usado y no vencido), o `null`.
  consumeState(
    stateHash: string,
    now: Date,
  ): Promise<{ businessId: string; userId: string; codeVerifierEnc: string } | null>;
  // El negocio al que pertenece esa cuenta de Mercado Pago, si ya está conectada.
  findConnectionOwner(mpUserId: number): Promise<string | null>;
  // Inserta o reemplaza la conexión del negocio.
  saveConnection(row: ConnectionRow): Promise<void>;
  revokeConnection(businessId: string): Promise<void>;
  mp: OAuthApi;
};

export type CallbackResult = { kind: "redirect"; to: string } | { kind: "not_found" };

const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
const notFound = () => reply(404, { error: "not_found" });
const redirect = (mp: "connected" | "error"): CallbackResult => ({
  kind: "redirect",
  to: `${SETTINGS_PATH}?mp=${mp}`,
});

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");
const base64url = (bytes: Buffer) => bytes.toString("base64url");

export const redirectUri = (deps: Pick<OAuthDeps, "siteOrigin">) => `${deps.siteOrigin}${CALLBACK_PATH}`;

// Solo el código HTTP: nunca el cuerpo, el token ni el mensaje del error (MP-16).
const failureStatus = (error: unknown) => (error instanceof MpApiError ? error.status : "error");

// Un `Origin` que viene y no es el del sitio es un POST armado desde otra página.
const foreignOrigin = (deps: OAuthDeps, origin: string | null) => origin !== null && origin !== deps.siteOrigin;

// POST /api/mp/oauth/start (MP-9, MP-10, MP-11, MP-15)
export async function startOAuth(
  deps: OAuthDeps,
  actor: OAuthActor | null,
  input: { origin: string | null },
): Promise<Reply> {
  if (!deps.globalEnabled) return notFound();
  if (foreignOrigin(deps, input.origin)) return reply(403, { error: "forbidden" });
  if (!actor) return reply(401, { error: "unauthorized" });
  if (!(await deps.isBusinessEnabled(actor.businessId))) return notFound();
  if (actor.role !== "owner") return reply(403, { error: "forbidden" });

  if (!deps.clientId || !deps.clientSecret) return reply(503, { error: "not_configured" });

  const now = deps.now();
  if (!deps.allowStart(actor.businessId, now)) return reply(429, { error: "too_many_requests" });

  const state = base64url(deps.random(32));
  // Entre 43 y 128 caracteres, como pide Mercado Pago para el PKCE.
  const verifier = base64url(deps.random(32));
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  await deps.insertState({
    stateHash: sha256Hex(state),
    businessId: actor.businessId,
    userId: actor.userId,
    codeVerifierEnc: encryptSecret(verifier, actor.businessId).value,
    expiresAt: new Date(now + STATE_TTL_MS),
  });

  const url = new URL(MP_AUTH_URL);
  url.searchParams.set("client_id", deps.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("redirect_uri", redirectUri(deps));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return reply(200, { url: url.toString() });
}

type ValidTokens = {
  accessToken: string;
  refreshToken: string;
  mpUserId: number;
  expiresIn: number;
  scope: string | null;
};

// Falla cerrado: sin alguno de estos campos (o con un valor que no tiene sentido) no se guarda nada.
function readTokens(body: TokenResponse): ValidTokens | null {
  const { access_token, refresh_token, user_id, expires_in, scope } = body;

  if (typeof access_token !== "string" || !access_token) return null;
  if (typeof refresh_token !== "string" || !refresh_token) return null;

  const mpUserId = typeof user_id === "string" && /^\d+$/.test(user_id) ? Number(user_id) : user_id;
  if (typeof mpUserId !== "number" || !Number.isSafeInteger(mpUserId) || mpUserId <= 0) return null;

  if (typeof expires_in !== "number" || !Number.isFinite(expires_in) || expires_in <= 0) return null;

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    mpUserId,
    expiresIn: expires_in,
    scope: typeof scope === "string" ? scope : null,
  };
}

// GET /api/mp/oauth/callback (MP-10, MP-11, MP-13, MP-15). Cualquier fallo vuelve a Configuración con un
// mensaje genérico: ni el motivo ni ningún valor de la conexión salen en la URL.
export async function completeOAuth(
  deps: OAuthDeps,
  actor: OAuthActor | null,
  input: { code: string | null; state: string | null; error: string | null },
): Promise<CallbackResult> {
  if (!deps.globalEnabled) return { kind: "not_found" };
  if (!actor) return redirect("error");
  if (!(await deps.isBusinessEnabled(actor.businessId))) return { kind: "not_found" };
  if (actor.role !== "owner") return redirect("error");

  if (input.error || !input.code || !input.state) return redirect("error");
  if (!deps.clientId || !deps.clientSecret) return redirect("error");

  // Se consume antes de cualquier otra cosa: un intento fallido también lo gasta y no hay forma de
  // reusarlo (MP-10).
  const stored = await deps.consumeState(sha256Hex(input.state), new Date(deps.now()));
  if (!stored) return redirect("error");
  if (stored.userId !== actor.userId || stored.businessId !== actor.businessId) return redirect("error");

  try {
    const verifier = decryptSecret(stored.codeVerifierEnc, actor.businessId, 1);

    const body = await deps.mp.exchangeCode({
      clientId: deps.clientId,
      clientSecret: deps.clientSecret,
      code: input.code,
      redirectUri: redirectUri(deps),
      codeVerifier: verifier,
      testToken: deps.testMode,
    });

    const tokens = readTokens(body);
    if (!tokens) {
      console.error("mp/oauth: la respuesta del canje está incompleta");
      return redirect("error");
    }

    // La cuenta que devuelve `users/me` con ese token tiene que ser la del token y de Argentina (MP-13).
    const me = await deps.mp.getMe(tokens.accessToken);
    if (Number(me.id) !== tokens.mpUserId || me.site_id !== COUNTRY) {
      console.error("mp/oauth: la cuenta no coincide o no es de Argentina");
      return redirect("error");
    }

    // Una cuenta de Mercado Pago, un solo negocio: se rechaza sin tocar nada (MP-13).
    const owner = await deps.findConnectionOwner(tokens.mpUserId);
    if (owner !== null && owner !== actor.businessId) {
      console.error("mp/oauth: la cuenta ya está conectada a otro negocio");
      return redirect("error");
    }

    const access = encryptSecret(tokens.accessToken, actor.businessId);
    const refresh = encryptSecret(tokens.refreshToken, actor.businessId);

    await deps.saveConnection({
      businessId: actor.businessId,
      mpUserId: tokens.mpUserId,
      accessTokenEnc: access.value,
      refreshTokenEnc: refresh.value,
      keyVersion: access.keyVersion,
      expiresAt: new Date(deps.now() + tokens.expiresIn * 1000),
      scope: tokens.scope,
      connectedBy: actor.userId,
    });

    return redirect("connected");
  } catch (error) {
    console.error("mp/oauth: no se pudo conectar la cuenta", failureStatus(error));
    return redirect("error");
  }
}

// POST /api/mp/oauth/disconnect (MP-9, MP-14). No depende de los interruptores: un negocio siempre puede
// sacar sus tokens. No llama a Mercado Pago; el negocio puede revocar desde su cuenta.
export async function disconnectOAuth(
  deps: OAuthDeps,
  actor: OAuthActor | null,
  input: { origin: string | null },
): Promise<Reply> {
  if (foreignOrigin(deps, input.origin)) return reply(403, { error: "forbidden" });
  if (!actor) return reply(401, { error: "unauthorized" });
  if (actor.role !== "owner") return reply(403, { error: "forbidden" });

  await deps.revokeConnection(actor.businessId);
  return reply(200, { ok: true });
}
