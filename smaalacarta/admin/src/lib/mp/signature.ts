import { createHmac, timingSafeEqual } from "node:crypto";

// Firma de las notificaciones de Mercado Pago (MP-4). El encabezado `x-signature` trae
// `ts=<marca de tiempo>,v1=<HMAC>`; el HMAC-SHA256 (hex, con el secreto del webhook del negocio) es
// de `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Si alguna parte no vino, se omite del texto.
export function parseSignature(header: string | null | undefined) {
  if (!header) return null;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );

  return parts.ts && parts.v1 ? { ts: parts.ts, v1: parts.v1 } : null;
}

function manifest(dataId: string | null | undefined, requestId: string | null | undefined, ts: string) {
  // Mercado Pago pide el id en minúsculas cuando es alfanumérico.
  const id = dataId && /^[A-Za-z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;

  return (
    (id ? `id:${id};` : "") + (requestId ? `request-id:${requestId};` : "") + `ts:${ts};`
  );
}

export function signWebhook(
  secret: string,
  input: { dataId?: string | null; requestId?: string | null; ts: string },
) {
  return createHmac("sha256", secret).update(manifest(input.dataId, input.requestId, input.ts)).digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  input: {
    signatureHeader: string | null | undefined;
    requestId: string | null | undefined;
    dataId: string | null | undefined;
  },
) {
  if (!secret) return false;

  const parsed = parseSignature(input.signatureHeader);
  if (!parsed) return false;

  const expected = Buffer.from(signWebhook(secret, { dataId: input.dataId, requestId: input.requestId, ts: parsed.ts }));
  const given = Buffer.from(parsed.v1);

  return expected.length === given.length && timingSafeEqual(expected, given);
}
