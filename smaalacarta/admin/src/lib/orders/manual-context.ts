import type { DeliveryOptions } from "@/lib/courier/preferences";
import type { BusinessZone } from "@/lib/db/business-zones";
import type { OwnDelivery } from "@/lib/db/own-delivery";

import type { ManualMenu } from "./manual-menu";

// Lo que el diálogo del pedido manual necesita saber del envío con repartidor (ENVIO-137 a 139): los barrios
// a los que el local envía y que algún repartidor cubre, con su precio de referencia, y si su favorito
// (el que eligió el local; sin elegir no hay) cubre cada uno. Sin favorito que cubra el barrio, la opción
// "Asignar a mi favorito" no aparece. Con envío propio (ENVIO-250 y 260) los barrios son los suyos, el envío va a su
// repartidor propio o lo lleva el local, y sin zonas con precio el barrio se escribe a mano y el costo se coordina.

export type ManualZone = {
  id: string;
  name: string;
  price: number;
  favoriteCovers: boolean;
};

export type ManualDeliveryContext = {
  zones: ManualZone[];
  // El favorito, aunque no cubra todos los barrios; nulo si no hay o ya no está activo.
  favorite: { id: string; name: string } | null;
  kind?: "free" | "own";
  // ¿Se puede cargar un envío con el barrio escrito y el costo a coordinar? (ENVIO-252)
  coordinate?: boolean;
  // El repartidor propio activo del negocio con envío propio; nulo si no tiene.
  ownCourier?: { id: string; name: string } | null;
};

export type OwnManualInfo = { delivery: OwnDelivery; zones: BusinessZone[] };

export function manualDeliveryContext(
  options: DeliveryOptions | null,
  own: OwnManualInfo | null = null,
): ManualDeliveryContext {
  if (own) {
    return {
      zones: own.zones
        .filter((zone) => zone.active && zone.price !== null)
        .map((zone) => ({ id: zone.id, name: zone.name, price: Number(zone.price), favoriteCovers: false })),
      favorite: null,
      kind: "own",
      coordinate: true,
      ownCourier: own.delivery.courier?.active ? { id: own.delivery.courier.id, name: own.delivery.courier.name } : null,
    };
  }

  if (!options) return { zones: [], favorite: null, kind: "free", coordinate: false, ownCourier: null };

  const favoriteId = options.favorite_id ?? null;
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
    kind: "free",
    // Sin ninguna zona tildada no hay a qué barrio ofrecerlo: se escribe a mano (ENVIO-252).
    coordinate: !options.zones.some((zone) => zone.selected),
    ownCourier: null,
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
