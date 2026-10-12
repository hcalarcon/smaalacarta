import { MpApiError } from "./api";
import { decryptSecret, encryptSecret } from "./crypto";
import type { Credentials } from "./service";

// De dónde salen las credenciales de cobro de un negocio y cómo se renueva el token de su conexión por OAuth
// (MP-18 a MP-22), con las dependencias inyectadas: `deps.ts` las conecta a la base y a la API real. Nada de lo
// que pasa por acá se loguea: de un fallo solo sale el código HTTP o el nombre del error (MP-26).
export type ConnectionRecord = {
  mpUserId: number;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  keyVersion: number;
  expiresAt: Date | null;
  status: "connected" | "needs_reconnect" | "revoked";
};

export type RenewedTokens = {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  keyVersion: number;
  expiresAt: Date;
};

// Todas las escrituras comparan contra el `refresh_token` cifrado que se leyó: si otro lo cambió en el medio
// (renovó, reconectó o desconectó), la operación no hace nada y devuelve `false`.
export type ConnectionStore = {
  find(businessId: string): Promise<ConnectionRecord | null>;
  // Un solo `UPDATE … WHERE refresh_token_enc = <leído> AND status = 'connected' AND (refreshing_until IS NULL
  // OR refreshing_until < ahora) RETURNING`: o lo toma uno, o no lo toma nadie (MP-20).
  acquireLease(businessId: string, refreshTokenEnc: string, now: Date, until: Date): Promise<boolean>;
  // Guarda el token y el refresh nuevos, y suelta el arriendo, en la misma operación (MP-19).
  saveRenewed(businessId: string, refreshTokenEnc: string, next: RenewedTokens, now: Date): Promise<boolean>;
  releaseLease(businessId: string, refreshTokenEnc: string): Promise<void>;
  markNeedsReconnect(businessId: string, refreshTokenEnc: string, now: Date): Promise<boolean>;
};

export type ManualCredentials = { accessToken: string; webhookSecret: string; enabled: boolean };

export type CredentialsDeps = {
  store: ConnectionStore;
  // La fila de `payment_credentials`, si existe (MP-1).
  manual(businessId: string): Promise<ManualCredentials | null>;
  // POST /oauth/token con `grant_type=refresh_token`. Lanza `MpApiError` con el código HTTP si Mercado Pago
  // responde un error; cualquier otro error se trata como transitorio.
  refresh(refreshToken: string): Promise<Record<string, unknown>>;
  // `MP_OAUTH_WEBHOOK_SECRET`, leída al llamar (no al cargar el módulo).
  webhookSecret(): string;
  now(): number;
  sleep(ms: number): Promise<void>;
};

// Con menos de esto por delante, el token se renueva antes de usarlo (MP-19).
export const REFRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
// El arriendo de la renovación: más que el tiempo máximo de la llamada a Mercado Pago (8 s).
const LEASE_MS = 30_000;
// Quien pierde la carrera con el token vencido espera como mucho unos 3 segundos (MP-20).
const WAIT_ATTEMPTS = 5;
const WAIT_STEP_MS = 600;

class DecryptError extends Error {
  name = "ConnectionDecryptError";
}

function open(value: string | null, businessId: string, keyVersion: number): string {
  if (!value) throw new DecryptError("La conexión no tiene token.");

  try {
    return decryptSecret(value, businessId, keyVersion);
  } catch {
    // El mensaje original no agrega nada útil: no se arrastra.
    throw new DecryptError("No se pudo descifrar la conexión.");
  }
}

const needsRefresh = (row: Live, now: number) =>
  !row.expiresAt || row.expiresAt.getTime() - now < REFRESH_WINDOW_MS;

const stillValid = (row: Live, now: number) => !!row.expiresAt && row.expiresAt.getTime() > now;

// Una conexión `connected` siempre tiene los dos tokens (lo exige la base); si no, no hay con qué cobrar.
type Live = ConnectionRecord & { accessTokenEnc: string; refreshTokenEnc: string };

const connected = (row: ConnectionRecord | null): row is Live =>
  !!row && row.status === "connected" && !!row.accessTokenEnc && !!row.refreshTokenEnc;

// Falla cerrado: sin alguno de estos campos (o de otra cuenta) no se guarda nada (MP-19).
function readRefreshed(body: Record<string, unknown>, mpUserId: number) {
  const { access_token, refresh_token, expires_in, user_id } = body;

  if (typeof access_token !== "string" || !access_token) return null;
  if (typeof refresh_token !== "string" || !refresh_token) return null;
  if (typeof expires_in !== "number" || !Number.isFinite(expires_in) || expires_in <= 0) return null;

  if (user_id !== undefined && user_id !== null && Number(user_id) !== mpUserId) return null;

  return { accessToken: access_token, refreshToken: refresh_token, expiresIn: expires_in };
}

function currentIfValid(businessId: string, row: Live, now: number) {
  return stillValid(row, now) ? open(row.accessTokenEnc, businessId, row.keyVersion) : null;
}

// Renueva con el arriendo ya tomado. Cualquier salida sin guardar suelta el arriendo.
async function renew(
  deps: CredentialsDeps,
  businessId: string,
  row: Live,
  refreshToken: string,
  now: number,
): Promise<string | null> {
  let saved = false;

  try {
    let body: Record<string, unknown>;

    try {
      body = await deps.refresh(refreshToken);
    } catch (error) {
      const status = error instanceof MpApiError ? error.status : null;
      const code = error instanceof MpApiError ? error.code : null;
      // Solo el código HTTP y el código de error de la lista fija: nunca el cuerpo ni el mensaje (MP-26).
      console.error("mp/credentials: no se pudo renovar el token", status ?? "error", code ?? "sin_codigo");

      // Solo `invalid_grant` (Mercado Pago rechaza ese refresh_token) cuenta como "hay que reconectar" (MP-21).
      // Un `invalid_client` (client_secret rotado), un `invalid_request`, un 400 o 401 sin código, la red, un 5xx
      // o el tiempo agotado son problemas nuestros o pasajeros: no se marca a nadie.
      if (code !== "invalid_grant") return currentIfValid(businessId, row, now);

      // Antes de marcar, se relee: puede que otro ya lo haya renovado.
      const fresh = await deps.store.find(businessId);
      if (!connected(fresh)) return null;
      if (fresh.refreshTokenEnc !== row.refreshTokenEnc) {
        return stillValid(fresh, now) ? open(fresh.accessTokenEnc, businessId, fresh.keyVersion) : null;
      }

      await deps.store.markNeedsReconnect(businessId, row.refreshTokenEnc, new Date(now));
      return null;
    }

    const tokens = readRefreshed(body, row.mpUserId);
    if (!tokens) {
      console.error("mp/credentials: la respuesta de la renovación está incompleta");
      return currentIfValid(businessId, row, now);
    }

    const access = encryptSecret(tokens.accessToken, businessId);
    const refresh = encryptSecret(tokens.refreshToken, businessId);

    saved = await deps.store.saveRenewed(
      businessId,
      row.refreshTokenEnc,
      {
        accessTokenEnc: access.value,
        refreshTokenEnc: refresh.value,
        keyVersion: access.keyVersion,
        expiresAt: new Date(now + tokens.expiresIn * 1000),
      },
      new Date(now),
    );
    if (saved) return tokens.accessToken;

    // La fila cambió mientras renovaba (se desconectó o se reconectó): vale lo que haya ahora.
    const fresh = await deps.store.find(businessId);
    if (!connected(fresh) || !stillValid(fresh, now)) return null;
    return open(fresh.accessTokenEnc, businessId, fresh.keyVersion);
  } finally {
    if (!saved) await deps.store.releaseLease(businessId, row.refreshTokenEnc).catch(() => undefined);
  }
}

// El token listo para usar, o `null` si no hay uno útil ahora (sin marcar nada). Lanza si no se puede
// descifrar.
async function usableToken(deps: CredentialsDeps, businessId: string, initial: Live) {
  let row = initial;

  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
    const now = deps.now();

    if (!needsRefresh(row, now)) return open(row.accessTokenEnc, businessId, row.keyVersion);

    const refreshToken = open(row.refreshTokenEnc, businessId, row.keyVersion);
    const leased = await deps.store.acquireLease(
      businessId,
      row.refreshTokenEnc,
      new Date(now),
      new Date(now + LEASE_MS),
    );
    if (leased) return renew(deps, businessId, row, refreshToken, now);

    // Otro renueva (o ya renovó): se relee y se usa lo que haya, sin gastar el refresh_token (MP-20).
    const fresh = await deps.store.find(businessId);
    if (!connected(fresh)) return null;
    row = fresh;

    if (!needsRefresh(row, now) || stillValid(row, now)) return open(row.accessTokenEnc, businessId, row.keyVersion);

    // Vencido y con el arriendo de otro: se espera un poco y se vuelve a mirar.
    if (attempt + 1 < WAIT_ATTEMPTS) await deps.sleep(WAIT_STEP_MS);
  }

  return null;
}

// Precedencia (MP-18): conexión `connected` → OAuth; si no, `payment_credentials` como siempre. Una conexión
// `connected` cuyo token no se puede usar no cae a otra fuente: devuelve credenciales sin token (`enabled`
// falso), con la clave de la app para que el webhook igual valide la firma y responda 200 `ignored` (MP-22).
export async function resolveCredentials(deps: CredentialsDeps, businessId: string): Promise<Credentials | null> {
  const connection = await deps.store.find(businessId);
  const manual = await deps.manual(businessId);
  const manualCredentials: Credentials | null = manual ? { ...manual, source: "manual" } : null;

  if (connection?.status === "connected") {
    const base = {
      source: "oauth" as const,
      mpUserId: connection.mpUserId,
      webhookSecret: deps.webhookSecret(),
      fallbackWebhookSecret: manual?.webhookSecret ?? null,
    };

    try {
      if (connected(connection)) {
        const token = await usableToken(deps, businessId, connection);
        if (token) return { ...base, accessToken: token, enabled: true };

        // Mercado Pago acaba de rechazar el refresh_token: esta misma llamada ya cobra con las credenciales
        // manuales, si las hay (MP-18). Un token que no se descifra, en cambio, nunca cae a otra fuente.
        if (manual?.enabled && (await deps.store.find(businessId))?.status === "needs_reconnect") {
          return manualCredentials;
        }
      }
    } catch (error) {
      console.error("mp/credentials: no se pudo usar la conexión", error instanceof Error ? error.name : "error");
    }

    return { ...base, accessToken: "", enabled: false };
  }

  // Sin credenciales manuales habilitadas no hay token útil, pero el webhook igual valida la firma y responde
  // 200 `ignored` en lugar de un 401 que Mercado Pago reintentaría (MP-22).
  if (connection?.status === "needs_reconnect" && !manual?.enabled) {
    return {
      source: "oauth",
      mpUserId: connection.mpUserId,
      webhookSecret: deps.webhookSecret(),
      fallbackWebhookSecret: manual?.webhookSecret ?? null,
      accessToken: "",
      enabled: false,
    };
  }

  return manualCredentials;
}
