import type { DeliveryOptions } from "@/lib/courier/preferences";

import type { ManualMenu } from "./manual-menu";

// Lo que el diálogo del pedido manual necesita saber del envío con repartidor (ENVIO-137 a 139): los barrios
// a los que el local envía y que algún repartidor cubre, con su precio de referencia, y si su favorito
// efectivo (el elegido o, sin elegir, Repartos al Toque) cubre cada uno. Sin favorito que cubra el barrio, la
// opción "Asignar a mi favorito" no aparece.

export type ManualZone = {
  id: string;
  name: string;
  price: number;
  favoriteCovers: boolean;
};

export type ManualDeliveryContext = {
  zones: ManualZone[];
  // El favorito efectivo, aunque no cubra todos los barrios; nulo si no hay o ya no está activo.
  favorite: { id: string; name: string } | null;
};

export function manualDeliveryContext(options: DeliveryOptions | null): ManualDeliveryContext {
  if (!options) return { zones: [], favorite: null };

  const favoriteId = options.favorite_id ?? options.default_courier?.id ?? null;
  // Un favorito que no figura entre los repartidores activos con cobertura no se puede asignar.
  const courier = favoriteId ? options.couriers.find((c) => c.id === favoriteId) : undefined;
  const covered = new Set(courier?.zone_ids ?? []);

  return {
    zones: options.zones
      .filter((zone) => zone.selected && zone.covered)
      .map((zone) => ({
        id: zone.id,
        name: zone.name,
        price: Number(zone.price),
        favoriteCovers: covered.has(zone.id),
      })),
    favorite: courier ? { id: courier.id, name: courier.name } : null,
  };
}

// Todo lo que el diálogo recibe del servidor.
export type ManualOrderSetup = {
  businessName: string;
  slug: string;
  // El negocio tiene el envío con repartidor habilitado (un `delivery` lleva barrio, dirección y modo).
  courier: boolean;
  menu: ManualMenu;
  delivery: ManualDeliveryContext;
};
