// Preferencias de envío del local (ENVIO-58 y 112): a qué zonas envía y repartidor favorito (su oferta le
// aparece primero al cliente). Las reglas son las de la base (`save_delivery_preferences`): el favorito
// tiene que cubrir alguna de las zonas marcadas.

// Lo que entrega `business_delivery_options()`.
export type DeliveryOptions = {
  zones: { id: string; name: string; price: number; selected: boolean; covered: boolean }[];
  couriers: { id: string; name: string; whatsapp: string | null; zone_ids: string[] }[];
  favorite_id: string | null;
  // El repartidor que se recomienda si el local no elige uno (Repartos al Toque, si está activo): ENVIO-134.
  default_courier?: { id: string; name: string } | null;
};

// Lo que edita la pantalla.
export type DeliveryInput = {
  zoneIds: string[];
  favoriteId: string | null;
};

export type DeliveryErrors = Partial<Record<"favorite", string>>;

// El estado inicial de la pantalla, a partir de lo que guardó el local.
export function initialDeliveryInput(options: DeliveryOptions): DeliveryInput {
  const input: DeliveryInput = {
    zoneIds: options.zones.filter((zone) => zone.selected).map((zone) => zone.id),
    favoriteId: options.favorite_id,
  };

  return normalizeDeliveryInput(input, options);
}

// Los repartidores que se pueden elegir de favorito: los que cubren alguna de las zonas marcadas.
export function favoriteCandidates(options: DeliveryOptions, zoneIds: string[]): DeliveryOptions["couriers"] {
  const marked = new Set(zoneIds);

  return options.couriers.filter((courier) => courier.zone_ids.some((id) => marked.has(id)));
}

// Si el favorito ya no cubre ninguna zona marcada, la pantalla vuelve a "Sin elegir": no se deja
// elegido a alguien que la base va a rechazar. Las zonas van en el orden de la lista.
export function normalizeDeliveryInput(input: DeliveryInput, options: DeliveryOptions): DeliveryInput {
  const marked = new Set(input.zoneIds);
  const zoneIds = options.zones.filter((zone) => marked.has(zone.id)).map((zone) => zone.id);

  const stillCovers =
    input.favoriteId !== null && favoriteCandidates(options, zoneIds).some((courier) => courier.id === input.favoriteId);

  return { zoneIds, favoriteId: stillCovers ? input.favoriteId : null };
}

export function validateDeliveryInput(
  input: DeliveryInput,
  options: DeliveryOptions,
): { ok: true; zoneIds: string[]; favoriteId: string | null } | { ok: false; errors: DeliveryErrors } {
  const errors: DeliveryErrors = {};

  if (input.favoriteId !== null) {
    const allowed = favoriteCandidates(options, input.zoneIds).some((courier) => courier.id === input.favoriteId);
    if (!allowed) {
      errors.favorite = "Elegí un repartidor que cubra alguna de las zonas a las que enviás.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    zoneIds: input.zoneIds,
    favoriteId: input.favoriteId,
  };
}

export function deliveryInputChanged(saved: DeliveryInput, current: DeliveryInput): boolean {
  return (
    saved.favoriteId !== current.favoriteId ||
    saved.zoneIds.length !== current.zoneIds.length ||
    saved.zoneIds.some((id, index) => id !== current.zoneIds[index])
  );
}
