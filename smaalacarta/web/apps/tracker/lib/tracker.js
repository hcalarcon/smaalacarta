// Página de seguimiento de un pedido (SEGUIMIENTO-8): qué muestra y cómo lo pide.
// Solo lógica: el dibujo está en tracker.js y usa siempre textContent.

const CODE = /^[0-9a-f]{20}$/;

// El código sale de /pedido/<código> (producción) o de ?code= (desarrollo local).
// Devuelve el código en minúsculas o null si no es uno válido.
export function parseTrackingCode(pathname, search = "") {
  const fromPath = /^\/pedido\/([^/]+)\/?$/.exec(String(pathname ?? ""));
  const candidate = (fromPath ? fromPath[1] : new URLSearchParams(search).get("code") ?? "").toLowerCase();

  return CODE.test(candidate) ? candidate : null;
}

const STEPS = ["pending", "confirmed", "preparing", "ready", "delivered"];

const VIEWS = {
  pending: { title: "Recibimos tu pedido", text: "El local todavía tiene que confirmarlo." },
  confirmed: { title: "Pedido confirmado", text: "El local confirmó tu pedido." },
  preparing: { title: "Estamos preparando tu pedido", text: "Ya estamos trabajando en él." },
  ready: { title: "¡Tu pedido está listo!", text: "Ya podés pasar a buscarlo o esperarlo." },
  delivered: { title: "Pedido entregado", text: "¡Que lo disfrutes!" },
  cancelled: { title: "Pedido cancelado", text: "Si tenés dudas, escribile al local." },
};

export function isFinalStatus(status) {
  return status === "delivered" || status === "cancelled";
}

// Qué mostrar para cada estado: título, texto, y en qué paso del camino está (-1 si
// se desconoce o está cancelado).
export function statusView(status) {
  const view = VIEWS[status];

  if (!view) {
    return { title: "Estado del pedido", text: "", step: -1, cancelled: false, final: false };
  }

  return {
    ...view,
    step: STEPS.indexOf(status),
    cancelled: status === "cancelled",
    final: isFinalStatus(status),
  };
}

const EVENT_LABELS = {
  pending: "Pedido recibido",
  confirmed: "Pedido confirmado",
  preparing: "En preparación",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

// La línea de tiempo lista para mostrar, en el orden en que llega.
export function timeline(events) {
  if (!Array.isArray(events)) return [];

  return events.flatMap((event) =>
    event && typeof event.estado === "string"
      ? [{ label: EVENT_LABELS[event.estado] ?? event.estado, date: event.fecha ?? null }]
      : [],
  );
}

export async function fetchTracking({ url, key, code, fetchImpl = globalThis.fetch }) {
  if (!url || !url.trim() || !key || !key.trim() || !CODE.test(String(code ?? ""))) {
    return { ok: false, reason: "error" };
  }

  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  try {
    const res = await fetchImpl(`${url.trim().replace(/\/+$/, "")}/rest/v1/rpc/public_order_tracking`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_code: code }),
      signal:
        typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });

    if (!res.ok) return { ok: false, reason: "error" };

    const data = await res.json();

    // La base responde null si el código no existe.
    if (data === null) return { ok: false, reason: "notfound" };

    if (typeof data !== "object" || !data.pedido || !data.negocio) {
      return { ok: false, reason: "error" };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, reason: "error" };
  }
}
