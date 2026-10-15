import { detectEvents, type OrderRecord, type PushEvent, type WebhookPayload } from "./events";
import { buildMessage, type PushMessage } from "./messages";

// Quién recibe cada aviso y qué se hace con las suscripciones (ADMIN-PWA-18 a 26). Las dependencias llegan
// inyectadas, como en `src/lib/mp/`: `deps.ts` las conecta a Supabase y a `web-push`, y los tests usan
// funciones falsas.
export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_id: string;
};

export type PushDeps = {
  businessName(businessId: string): Promise<string>;
  // Repartidores activos que cubren la zona y no rechazaron ni devolvieron el pedido.
  coveringCourierIds(orderId: string, zoneId: string): Promise<string[]>;
  courierUserIds(courierIds: string[]): Promise<string[]>;
  // Repartidores con una oferta (abierta o cerrada) en el pedido.
  offererCourierIds(orderId: string): Promise<string[]>;
  courierName(courierId: string): Promise<string | null>;
  businessUserIds(businessId: string): Promise<string[]>;
  // ¿El repartidor lo asignó el local a mano (y no lo eligió el cliente ni la elección automática)?
  assignedByLocal(orderId: string): Promise<boolean>;
  subscriptions(userIds: string[]): Promise<PushSubscriptionRow[]>;
  // "gone": el servicio push dice que la suscripción ya no existe (404 o 410). Cualquier otra falla lanza.
  send(subscription: PushSubscriptionRow, message: PushMessage): Promise<"ok" | "gone">;
  removeSubscription(endpoint: string): Promise<void>;
};

export type PushResult = { events: number; sent: number; removed: number; failed: number };

const unique = <T>(values: T[]) => [...new Set(values)];

export async function handlePushWebhook(deps: PushDeps, payload: WebhookPayload): Promise<PushResult> {
  const events = detectEvents(payload);
  const result: PushResult = { events: events.length, sent: 0, removed: 0, failed: 0 };

  // Lo que se consulta una vez por pedido, aunque salgan varios avisos de la misma actualización.
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => Promise<T>) => {
    if (!memo.has(key)) memo.set(key, load());
    return memo.get(key) as Promise<T>;
  };

  await Promise.all(
    events.map(async (event) => {
      try {
        await deliver(deps, event, once, result);
      } catch {
        // Un evento que falla (una consulta caída) no frena a los otros.
        result.failed += 1;
      }
    }),
  );

  return result;
}

type Once = <T>(key: string, load: () => Promise<T>) => Promise<T>;

async function recipients(deps: PushDeps, event: PushEvent, once: Once): Promise<string[]> {
  const { order } = event;

  switch (event.kind) {
    case "offer_new": {
      if (!order.delivery_zone_id) return [];
      const couriers = await deps.coveringCourierIds(order.id, order.delivery_zone_id);
      return deps.courierUserIds(unique(couriers));
    }
    case "courier_chosen":
    case "courier_pickup_soon":
    case "courier_order_ready":
    case "courier_prep_changed":
      return order.courier_id ? deps.courierUserIds([order.courier_id]) : [];
    case "courier_not_chosen": {
      const offerers = await once(`offerers:${order.id}`, () => deps.offererCourierIds(order.id));
      return deps.courierUserIds(unique(offerers).filter((id) => id !== order.courier_id));
    }
    case "order_cancelled": {
      const offerers = await once(`offerers:${order.id}`, () => deps.offererCourierIds(order.id));
      const couriers = unique([...(order.courier_id ? [order.courier_id] : []), ...offerers]);
      return deps.courierUserIds(couriers);
    }
    case "local_new_order":
    case "local_new_order_reminder":
    case "local_no_offers":
      return deps.businessUserIds(order.business_id);
    case "local_courier_chosen": {
      // Si lo asignó el local él mismo ya lo sabe.
      if (await assigned(deps, order, once)) return [];
      return deps.businessUserIds(order.business_id);
    }
  }
}

const assigned = (deps: PushDeps, order: OrderRecord, once: Once) =>
  once(`assigned:${order.id}`, () => deps.assignedByLocal(order.id).catch(() => false));

async function deliver(deps: PushDeps, event: PushEvent, once: Once, result: PushResult) {
  const { order, kind } = event;

  const userIds = unique(await recipients(deps, event, once));
  if (userIds.length === 0) return;

  const [businessName, courierName, assignedByLocal] = await Promise.all([
    once(`business:${order.business_id}`, () => deps.businessName(order.business_id)),
    kind === "local_courier_chosen" && order.courier_id
      ? once(`courier:${order.courier_id}`, () => deps.courierName(order.courier_id as string))
      : Promise.resolve(null),
    kind === "courier_chosen" ? assigned(deps, order, once) : Promise.resolve(false),
  ]);

  const message = buildMessage(kind, order, { businessName, courierName, assignedByLocal });

  const subscriptions = await deps.subscriptions(userIds);

  // Cada aparato por separado: uno que falla no frena a los demás.
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const outcome = await deps.send(subscription, message);

        if (outcome === "gone") {
          await deps.removeSubscription(subscription.endpoint);
          result.removed += 1;
        } else {
          result.sent += 1;
        }
      } catch {
        result.failed += 1;
      }
    }),
  );
}
