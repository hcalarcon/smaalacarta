// Cliente mínimo de la API de Mercado Pago, con `fetch` directo (sin SDK). Recibe el token del negocio en
// cada llamada y nunca lo registra ni lo devuelve (MP-7): un error solo lleva el código HTTP.
const BASE = "https://api.mercadopago.com";
const TIMEOUT_MS = 8000;

export type MpPayment = {
  id: number | string;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  // La cuenta que cobró. Con una conexión OAuth tiene que ser la del negocio (MP-25). Suposición hasta verlo en
  // un pago real: si Mercado Pago lo llama distinto, el aviso se ignora (falla cerrado).
  collector_id?: number | string | null;
};

export type PreferenceInput = {
  items: { title: string; quantity: number; unit_price: number; currency_id: "ARS" }[];
  external_reference: string;
  back_urls: { success: string; failure: string; pending: string };
  auto_return: "approved";
  notification_url: string;
};

export type MpApi = {
  createPreference(token: string, input: PreferenceInput): Promise<{ init_point: string }>;
  getPayment(token: string, id: string): Promise<MpPayment>;
  searchPayments(token: string, externalReference: string): Promise<MpPayment[]>;
};

// Los únicos códigos de error de OAuth que se conservan (RFC 6749, 5.2). Cualquier otro valor del campo `error`
// de Mercado Pago se descarta: ni el cuerpo ni el mensaje salen de la respuesta (MP-16, MP-21).
export const MP_ERROR_CODES = [
  "invalid_grant",
  "invalid_client",
  "invalid_request",
  "unauthorized_client",
  "invalid_scope",
] as const;

export type MpErrorCode = (typeof MP_ERROR_CODES)[number];

export const asMpErrorCode = (value: unknown): MpErrorCode | null =>
  typeof value === "string" && (MP_ERROR_CODES as readonly string[]).includes(value) ? (value as MpErrorCode) : null;

export class MpApiError extends Error {
  // `code`: el campo `error` de la respuesta, solo si es uno de `MP_ERROR_CODES`; si no, `null`.
  constructor(
    public status: number,
    public code: MpErrorCode | null = null,
  ) {
    super(`Mercado Pago respondió ${status}`);
  }
}

type Fetch = typeof fetch;

async function call<T>(fetcher: Fetch, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetcher(`${BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) throw new MpApiError(response.status);
  return (await response.json()) as T;
}

export function createMpApi(fetcher: Fetch = fetch): MpApi {
  return {
    async createPreference(token, input) {
      const data = await call<{ init_point?: string }>(fetcher, token, "/checkout/preferences", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!data.init_point) throw new MpApiError(502);
      return { init_point: data.init_point };
    },

    getPayment: (token, id) => call<MpPayment>(fetcher, token, `/v1/payments/${encodeURIComponent(id)}`),

    async searchPayments(token, externalReference) {
      const query = new URLSearchParams({
        external_reference: externalReference,
        sort: "date_created",
        criteria: "desc",
      });
      const data = await call<{ results?: MpPayment[] }>(fetcher, token, `/v1/payments/search?${query}`);
      return data.results ?? [];
    },
  };
}
