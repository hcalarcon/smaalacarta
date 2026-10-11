// Preferencias de envío del local (ENVIO-58): a qué zonas envía, repartidor favorito y cuántos minutos
// lo ve solo él. Las reglas son las de la base (`save_delivery_preferences`): el favorito tiene que
// cubrir alguna de las zonas marcadas y los minutos van de 1 a 60.

export const FAVORITE_MINUTES_DEFAULT = 5;
export const FAVORITE_MINUTES_MIN = 1;
export const FAVORITE_MINUTES_MAX = 60;

// Lo que entrega `business_delivery_options()`.
export type DeliveryOptions = {
  zones: { id: string; name: string; price: number; selected: boolean; covered: boolean }[];
  couriers: { id: string; name: string; whatsapp: string | null; zone_ids: string[] }[];
  favorite_id: string | null;
  favorite_minutes: number;
};

// Lo que edita la pantalla. Los minutos son texto: es lo que escribe la persona.
export type DeliveryInput = {
  zoneIds: string[];
  favoriteId: string | null;
  minutes: string;
};

export type DeliveryErrors = Partial<Record<"favorite" | "minutes", string>>;

// Un entero de 1 a 60, o null.
export function parseMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;

  const value = Number(trimmed);
  return value >= FAVORITE_MINUTES_MIN && value <= FAVORITE_MINUTES_MAX ? value : null;
}

// El estado inicial de la pantalla, a partir de lo que guardó el local.
export function initialDeliveryInput(options: DeliveryOptions): DeliveryInput {
  const input: DeliveryInput = {
    zoneIds: options.zones.filter((zone) => zone.selected).map((zone) => zone.id),
    favoriteId: options.favorite_id,
    minutes: String(options.favorite_minutes),
  };

  return normalizeDeliveryInput(input, options);
}

// Los repartidores que se pueden elegir de favorito: los que cubren alguna de las zonas marcadas.
export function favoriteCandidates(options: DeliveryOptions, zoneIds: string[]): DeliveryOptions["couriers"] {
  const marked = new Set(zoneIds);

  return options.couriers.filter((courier) => courier.zone_ids.some((id) => marked.has(id)));
}

// Si el favorito ya no cubre ninguna zona marcada, la pantalla vuelve a "Sin favorito": no se deja
// elegido a alguien que la base va a rechazar. Las zonas van en el orden de la lista.
export function normalizeDeliveryInput(input: DeliveryInput, options: DeliveryOptions): DeliveryInput {
  const marked = new Set(input.zoneIds);
  const zoneIds = options.zones.filter((zone) => marked.has(zone.id)).map((zone) => zone.id);

  const stillCovers =
    input.favoriteId !== null && favoriteCandidates(options, zoneIds).some((courier) => courier.id === input.favoriteId);

  return { zoneIds, favoriteId: stillCovers ? input.favoriteId : null, minutes: input.minutes };
}

export function validateDeliveryInput(
  input: DeliveryInput,
  options: DeliveryOptions,
): { ok: true; zoneIds: string[]; favoriteId: string | null; minutes: number } | { ok: false; errors: DeliveryErrors } {
  const errors: DeliveryErrors = {};

  if (input.favoriteId !== null) {
    const allowed = favoriteCandidates(options, input.zoneIds).some((courier) => courier.id === input.favoriteId);
    if (!allowed) {
      errors.favorite = "Elegí un repartidor que cubra alguna de las zonas a las que enviás.";
    }
  }

  const minutes = parseMinutes(input.minutes);
  // Los minutos solo cuentan con un favorito elegido: sin favorito se guarda el valor que había.
  if (input.favoriteId !== null && minutes === null) {
    errors.minutes = `Ingresá un número de minutos, de ${FAVORITE_MINUTES_MIN} a ${FAVORITE_MINUTES_MAX}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    zoneIds: input.zoneIds,
    favoriteId: input.favoriteId,
    minutes: minutes ?? FAVORITE_MINUTES_DEFAULT,
  };
}

export function deliveryInputChanged(saved: DeliveryInput, current: DeliveryInput): boolean {
  return (
    saved.favoriteId !== current.favoriteId ||
    saved.minutes.trim() !== current.minutes.trim() ||
    saved.zoneIds.length !== current.zoneIds.length ||
    saved.zoneIds.some((id, index) => id !== current.zoneIds[index])
  );
}
