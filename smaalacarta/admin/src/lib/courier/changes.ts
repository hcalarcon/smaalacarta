import type { CourierPanelOrder } from "./panel";

// Qué cambios del local le avisan al repartidor con la página abierta (ENVIO-168): que marque Listo, que
// cambie la demora o que cancele. Es lo mismo que el push (`push/events.ts`), pero a partir de dos lecturas
// del panel. Los demás cambios de estado no avisan. Reglas puras; el componente solo suena y pinta.
export type CourierChangeKind = "ready" | "prep_changed" | "cancelled";

export type CourierChange = { id: string; numero: string; negocio: string; kind: CourierChangeKind };

type Seen = { estado: string; listo: number | null };

type Order = Pick<CourierPanelOrder, "id" | "numero" | "estado" | "tiempos"> & {
  negocio: Pick<CourierPanelOrder["negocio"], "nombre">;
};

// Dos horas son la misma si son el mismo instante, escritas como sea (ENVIO-167).
function instant(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value.replace(/([T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?[+-]\d\d)$/, "$1:00")).getTime();
  return Number.isNaN(time) ? null : time;
}

export function snapshotOrders(orders: Order[]): Map<string, Seen> {
  return new Map(orders.map((order) => [order.id, { estado: order.estado, listo: instant(order.tiempos?.listo_a) }]));
}

export function courierChanges(before: Map<string, Seen>, orders: Order[]): CourierChange[] {
  const changes: CourierChange[] = [];

  for (const order of orders) {
    const seen = before.get(order.id);
    if (!seen) continue;

    const at = (kind: CourierChangeKind) =>
      changes.push({ id: order.id, numero: order.numero, negocio: order.negocio.nombre, kind });
    const ready = instant(order.tiempos?.listo_a);

    if (order.estado === "cancelled" && seen.estado !== "cancelled") at("cancelled");
    else if (order.estado === "ready" && seen.estado !== "ready") at("ready");
    else if (
      ready !== null &&
      ready !== seen.listo &&
      !["ready", "handed_to_courier", "on_the_way", "delivered", "cancelled"].includes(order.estado)
    ) {
      at("prep_changed");
    }
  }

  return changes;
}

export function changeText(change: CourierChange): string {
  switch (change.kind) {
    case "ready":
      return `Pedido #${change.numero}: listo para retirar${change.negocio ? ` en ${change.negocio}` : ""}.`;
    case "prep_changed":
      return `Pedido #${change.numero}: el local cambió la demora.`;
    case "cancelled":
      return `Pedido #${change.numero}: el local lo canceló.`;
  }
}
