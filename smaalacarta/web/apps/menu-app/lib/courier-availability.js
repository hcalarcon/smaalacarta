// Aviso de "puede que no haya repartidores" en el checkout (ENVIO-198). La base solo responde sí o no por
// zona (`public_zone_has_couriers`): sin nombres ni cantidades. El aviso nunca bloquea: el cliente puede pedir
// igual, y si la consulta falla no se muestra nada.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cuánto vale una respuesta ya pedida: cambiar de barrio y volver no repite la consulta cada vez.
export const CACHE_MS = 30_000;

// `{ ok: true, has }` si la base contestó; `{ ok: false }` ante cualquier problema (sin configuración, zona
// rara, red caída, respuesta que no es sí o no).
export async function fetchZoneHasCouriers({ url, key, zoneId, fetchImpl = globalThis.fetch }) {
  if (!url || !url.trim() || !key || !key.trim() || !UUID.test(String(zoneId ?? ""))) return { ok: false };

  const headers = { apikey: key, "Content-Type": "application/json" };
  // Las claves nuevas (sb_publishable_…) van solo en `apikey`; las viejas, que son JWT, también como Authorization.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_zone_has_couriers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_zone_id: zoneId }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!res.ok) return { ok: false };

    const body = await res.json();
    return typeof body === "boolean" ? { ok: true, has: body } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ¿Se muestra el aviso? Solo si la base dijo que no hay nadie para la zona.
export function showNoCouriersNotice(result) {
  return Boolean(result && result.ok === true && result.has === false);
}

// Una consulta por barrio cada `CACHE_MS`. Se arma con la función que consulta, para poder probarla.
export function createZoneChecker(check, { now = () => Date.now(), ttl = CACHE_MS } = {}) {
  const seen = new Map();

  return async function checkZone(zoneId) {
    const known = seen.get(zoneId);
    if (known && now() - known.at < ttl) return known.result;

    const result = await check(zoneId);
    // Un fallo no se recuerda: la próxima vez se vuelve a intentar.
    if (result.ok) seen.set(zoneId, { at: now(), result });
    return result;
  };
}
