import "server-only";

import type { OrderItemOption } from "@/lib/orders/item-options";
import { createAdminClient } from "@/lib/supabase-admin";

import { createMpApi } from "./api";
import { createConnectionStore } from "./connection-store";
import { resolveCredentials } from "./credentials";
import { createTokenRefresher } from "./oauth-api";
import type { MpDeps, OrderRecord, PaymentStatus } from "./service";

const ORDER_SELECT =
  "id, business_id, code, total, status, payment, payment_status, businesses(slug), " +
  "order_items(name, quantity, unit_price, sort_order, options)";

type OrderRow = {
  id: string;
  business_id: string;
  code: string;
  total: number;
  status: string;
  payment: string | null;
  payment_status: string;
  businesses: { slug: string } | { slug: string }[] | null;
  order_items:
    | {
        name: string;
        quantity: number;
        unit_price: number;
        sort_order: number;
        options: OrderItemOption[] | null;
      }[]
    | null;
};

function toRecord(row: OrderRow): OrderRecord {
  const business = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses;

  return {
    id: row.id,
    businessId: row.business_id,
    slug: business?.slug ?? "",
    code: row.code,
    total: Number(row.total),
    status: row.status,
    payment: row.payment,
    paymentStatus: row.payment_status as PaymentStatus,
    items: [...(row.order_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        options: item.options,
      })),
  };
}

// Las dependencias reales de `service.ts`: la base con la clave de servicio (solo servidor) y la API de
// Mercado Pago. Se arma por pedido, nunca en el navegador. Lanza si falta la clave de servicio.
export function buildMpDeps(): MpDeps {
  const supabase = createAdminClient();

  async function findOrder(column: "code" | "id", value: string) {
    const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq(column, value).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toRecord(data as unknown as OrderRow) : null;
  }

  async function readManualCredentials(businessId: string) {
    const { data, error } = await supabase
      .from("payment_credentials")
      .select("mp_access_token, mp_webhook_secret, enabled")
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return { accessToken: data.mp_access_token, webhookSecret: data.mp_webhook_secret, enabled: data.enabled };
  }

  const refresher = createTokenRefresher();

  return {
    findOrderByCode: (code) => findOrder("code", code),
    findOrderById: (id) => findOrder("id", id),

    // Conexión OAuth `connected` primero; si no, `payment_credentials` (MP-18). Renueva el token al usarlo
    // (MP-19 a MP-21). Las variables se leen al llamar, no al cargar el módulo.
    getCredentials: (businessId) =>
      resolveCredentials(
        {
          store: createConnectionStore(supabase),
          manual: readManualCredentials,
          refresh: (refreshToken) => {
            const clientId = process.env.MP_OAUTH_CLIENT_ID;
            const clientSecret = process.env.MP_OAUTH_CLIENT_SECRET;
            if (!clientId || !clientSecret) throw new Error("Falta la aplicación de OAuth.");

            return refresher({ clientId, clientSecret, refreshToken });
          },
          webhookSecret: () => process.env.MP_OAUTH_WEBHOOK_SECRET ?? "",
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        },
        businessId,
      ),

    async confirmPayment(orderId, paymentId, status, amount) {
      const { data, error } = await supabase.rpc("confirm_order_payment", {
        p_order_id: orderId,
        p_payment_id: paymentId,
        p_status: status,
        p_amount: amount,
      });

      if (error) throw new Error(error.message);
      return String(data);
    },

    mp: createMpApi(),
    now: () => Date.now(),
    // El panel vive en www.smaalacarta.com.ar/admin (rewrite desde landing/): ese es el dominio que ve
    // Mercado Pago y al que vuelve el webhook.
    siteOrigin: "https://www.smaalacarta.com.ar",
    menuDomain: "smaalacarta.com.ar",
  };
}
