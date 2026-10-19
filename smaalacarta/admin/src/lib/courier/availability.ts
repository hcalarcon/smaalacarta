// Disponibilidad de los repartidores (ENVIO-191 a 202). Reglas puras y textos; lo que cuenta como disponible lo
// decide la base, así que acá solo se interpreta lo que ella responde.

export type AvailabilityStatus = {
  // El interruptor de la plataforma: apagado, no se muestra nada.
  enabled: boolean;
  available: boolean;
  since: string | null;
  expiresAt: string | null;
};

// Lo que dice `courier_availability_status()`. Ante datos raros queda apagado y sin interruptor: no se inventa
// una disponibilidad que la base no confirmó.
export function statusFromRow(row: unknown): AvailabilityStatus {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;

  return {
    enabled: r.enabled === true,
    available: r.available === true,
    since: typeof r.since === "string" ? r.since : null,
    expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
  };
}

export type AvailabilityLang = "es" | "en" | "pt";

// Los textos del interruptor del repartidor (es/en/pt, según el idioma del navegador).
export const AVAILABILITY_TEXTS: Record<
  AvailabilityLang,
  {
    on: string;
    off: string;
    since: (time: string) => string;
    hint: string;
    error: string;
  }
> = {
  es: {
    on: "Conectado",
    off: "No conectado",
    since: (time) => `Disponible desde las ${time}`,
    hint: "Si no hacés nada durante 4 horas, te ponemos como No disponible. Igual ves y tomás pedidos.",
    error: "No pudimos guardar el cambio. Probá de nuevo.",
  },
  en: {
    on: "Connected",
    off: "Not connected",
    since: (time) => `Available since ${time}`,
    hint: "If you do nothing for 4 hours, we set you as Not available. You still see and take orders.",
    error: "We couldn't save the change. Please try again.",
  },
  pt: {
    on: "Conectado",
    off: "Desconectado",
    since: (time) => `Disponível desde as ${time}`,
    hint: "Se você não fizer nada por 4 horas, deixamos você como Indisponível. Você continua vendo e pegando pedidos.",
    error: "Não conseguimos salvar a mudança. Tente de novo.",
  },
};

// El idioma sale del navegador (`Accept-Language`); si no es inglés ni portugués, español.
export function pickAvailabilityLang(acceptLanguage: string | null | undefined): AvailabilityLang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";

  if (first.startsWith("pt")) return "pt";
  if (first.startsWith("en")) return "en";
  return "es";
}

// El aviso push cuando se apaga solo (ENVIO-194).
export const AUTO_OFF_PUSH = {
  title: "Te pusimos como No disponible",
  body: "Te pusimos como No disponible porque pasaron 4 horas sin actividad",
} as const;

// Lo que el local ve en su pantalla de pedidos (ENVIO-200).
export type BusinessAvailability = {
  enabled: boolean;
  total: number;
  emptyZoneIds: string[];
};

export function businessFromRow(row: unknown): BusinessAvailability {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;

  if (r.enabled !== true) return { enabled: false, total: 0, emptyZoneIds: [] };

  return {
    enabled: true,
    total: typeof r.total === "number" && Number.isFinite(r.total) ? r.total : 0,
    emptyZoneIds: Array.isArray(r.empty_zone_ids)
      ? r.empty_zone_ids.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export const NO_COURIERS_BADGE = "Ningún repartidor disponible";

export function availableCountText(total: number): string {
  return total === 0 ? NO_COURIERS_BADGE : `Repartidores disponibles ahora: ${total}`;
}

// ¿El pedido con envío, todavía sin repartidor, está en una zona sin disponibles? Se marca en su tarjeta.
export function orderZoneIsEmpty(
  order: { delivery_zone_id?: string | null; courier_status?: string | null; courier_id?: string | null },
  availability: BusinessAvailability,
): boolean {
  if (!availability.enabled || !order.delivery_zone_id || order.courier_id) return false;
  if (order.courier_status !== "searching" && order.courier_status !== "waiting") return false;

  return availability.emptyZoneIds.includes(order.delivery_zone_id);
}

// Un repartidor que ya venció el plazo no cuenta como disponible aunque el cron todavía no lo apague. La base
// lo aplica igual (`courier_available_now`); esto es para la lista del superadmin.
export const IDLE_LIMIT_MS = 4 * 60 * 60 * 1000;

export function isFreshActivity(lastActivityAt: string | null, now: Date): boolean {
  if (!lastActivityAt) return false;
  const at = Date.parse(lastActivityAt);

  return !Number.isNaN(at) && now.getTime() - at < IDLE_LIMIT_MS;
}
