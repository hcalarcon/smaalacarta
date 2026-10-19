import "server-only";

import webpush from "web-push";

import { createAdminClient } from "@/lib/supabase-admin";

import { pushPayload, ttlSeconds } from "./messages";
import type { PushDeps, PushSubscriptionRow } from "./service";
import { withCarIfNeeded } from "./vehicle";

// Las dependencias reales de `service.ts`: la base con la clave de servicio (solo servidor) y `web-push`.
// Se arma por llamada, nunca al cargar el módulo, y lanza si falta alguna clave (ADMIN-PWA-27).
function readVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!subject || !publicKey || !privateKey) {
    throw new Error("Faltan VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY.");
  }

  return { subject, publicKey, privateKey };
}

// El TTL de cada aviso (cuánto vive en el servicio push si el aparato está apagado) lo decide
// `ttlSeconds()` en `messages.ts`: 60 s para el pedido nuevo y su recordatorio, 10 minutos el resto.
const SEND_TIMEOUT_MS = 4000;

const ids = (rows: { [key: string]: unknown }[] | null, key: string) =>
  (rows ?? []).map((row) => row[key] as string);

export function buildPushDeps(): PushDeps {
  const supabase = createAdminClient();
  const vapid = readVapid();

  // Lanza si Supabase respondió con error: un evento que no se pudo resolver cuenta como fallado.
  const rows = async <T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  return {
    async businessName(businessId) {
      const { data } = await supabase.from("businesses").select("name").eq("id", businessId).maybeSingle();
      return (data?.name as string | undefined) ?? "";
    },

    async coveringCourierIds(orderId, zoneId) {
      const covering = ids(
        await rows(supabase.from("courier_zone_coverage").select("courier_id").eq("zone_id", zoneId)),
        "courier_id",
      );
      if (covering.length === 0) return [];

      const [active, declined, order, platform] = await Promise.all([
        rows(supabase.from("couriers").select("id, auto").in("id", covering).eq("active", true)),
        // Los que lo rechazaron o lo devolvieron (`kind`) no vuelven a verlo.
        rows(supabase.from("courier_order_declines").select("courier_id").eq("order_id", orderId)),
        // Si el pedido pide auto y el vehículo está prendido, solo avisa a quien lo tiene (ENVIO-177).
        rows(supabase.from("orders").select("needs_car").eq("id", orderId)),
        rows(supabase.from("platform_settings").select("vehicle_enabled")),
      ]);
      const out = new Set(ids(declined, "courier_id"));
      const eligible = withCarIfNeeded(
        active.map((row) => ({ id: row.id as string, auto: row.auto === true })),
        { needsCar: order[0]?.needs_car === true, enabled: platform[0]?.vehicle_enabled === true },
      );

      const candidates = eligible.map((courier) => courier.id).filter((id) => !out.has(id));
      if (candidates.length === 0) return [];

      // Con "Exigir términos" prendido, solo quienes aceptaron la versión vigente (ENVIO-186).
      const { data, error } = await supabase.rpc("courier_push_eligible", { p_courier_ids: candidates });
      if (error) throw new Error(error.message);

      return Array.isArray(data) ? (data as string[]) : [];
    },

    async courierUserIds(courierIds) {
      if (courierIds.length === 0) return [];
      return ids(await rows(supabase.from("courier_users").select("user_id").in("courier_id", courierIds)), "user_id");
    },

    async offererCourierIds(orderId) {
      return ids(await rows(supabase.from("courier_offers").select("courier_id").eq("order_id", orderId)), "courier_id");
    },

    async courierName(courierId) {
      const { data } = await supabase.from("couriers").select("name").eq("id", courierId).maybeSingle();
      return (data?.name as string | undefined) ?? null;
    },

    async businessUserIds(businessId) {
      return ids(await rows(supabase.from("business_users").select("user_id").eq("business_id", businessId)), "user_id");
    },

    // Elegir (el cliente o la elección automática) deja un evento de envío sin `changed_by`; asignar a mano
    // lo deja con el usuario del local. Se mira la tanda más reciente: las filas de una misma transacción
    // comparten `created_at`.
    async assignedByLocal(orderId) {
      const events = await rows(
        supabase
          .from("order_events")
          .select("changed_by, created_at")
          .eq("order_id", orderId)
          .eq("kind", "delivery")
          .order("created_at", { ascending: false })
          .limit(5),
      );
      if (events.length === 0) return false;

      const latest = events[0].created_at as string;
      return events.some((event) => event.created_at === latest && event.changed_by !== null);
    },

    async subscriptions(userIds) {
      if (userIds.length === 0) return [];
      return (await rows(
        supabase.from("push_subscriptions").select("endpoint, p256dh, auth, user_id").in("user_id", userIds),
      )) as PushSubscriptionRow[];
    },

    async send(subscription, message) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          pushPayload(message),
          {
            vapidDetails: vapid,
            TTL: ttlSeconds(message),
            urgency: "high",
            timeout: SEND_TIMEOUT_MS,
          },
        );
        return "ok";
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "gone";
        throw error;
      }
    },

    async removeSubscription(endpoint) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },
  };
}
