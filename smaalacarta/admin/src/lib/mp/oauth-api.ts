import { asMpErrorCode, MpApiError } from "./api";
import { MP_ME_URL, MP_TOKEN_URL, type MeResponse, type OAuthApi, type TokenResponse } from "./oauth";

// Cliente de OAuth de Mercado Pago, con `fetch` directo (sin SDK). Un fallo lleva solo el código HTTP: ni el
// cuerpo, ni el code, ni los tokens salen de acá (MP-16).
const TIMEOUT_MS = 8000;

type Fetch = typeof fetch;

// Solo el campo `error` de la respuesta y solo si es uno de la lista fija; nunca el cuerpo ni el mensaje.
async function safeErrorCode(response: Response) {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    return asMpErrorCode((body as Record<string, unknown>).error);
  } catch {
    return null;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new MpApiError(response.status, await safeErrorCode(response));

  try {
    return (await response.json()) as T;
  } catch {
    throw new MpApiError(502);
  }
}

export function createOAuthApi(fetcher: Fetch = fetch): OAuthApi {
  return {
    async exchangeCode(input) {
      const response = await fetcher(MP_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: input.clientId,
          client_secret: input.clientSecret,
          code: input.code,
          redirect_uri: input.redirectUri,
          code_verifier: input.codeVerifier,
          // Solo en modo de prueba: genera credenciales de sandbox.
          ...(input.testToken ? { test_token: true } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      return readJson<TokenResponse>(response);
    },

    async getMe(accessToken) {
      const response = await fetcher(MP_ME_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      return readJson<MeResponse>(response);
    },
  };
}

// POST /oauth/token con `grant_type=refresh_token` (MP-19). Mercado Pago devuelve un access_token y un
// refresh_token NUEVOS; el viejo deja de servir. Un fallo lleva solo el código HTTP (MP-26).
export function createTokenRefresher(fetcher: Fetch = fetch) {
  return async (input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<TokenResponse> => {
    const response = await fetcher(MP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });

    return readJson<TokenResponse>(response);
  };
}
