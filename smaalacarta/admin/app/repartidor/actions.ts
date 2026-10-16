"use server";

import { revalidatePath } from "next/cache";

import { requireCourier } from "@/lib/auth/courier";
import { validateReturn } from "@/lib/courier/panel";
import { validatePreferences, type CourierPreferences } from "@/lib/courier/profile";
import { validateEta, type EtaKind } from "@/lib/courier/times";
import { validateVehicles, type CourierVehicles } from "@/lib/courier/vehicle";
import {
  courierDeclineOrder,
  courierMakeOffer,
  courierMarkSettled,
  courierReturnOrder,
  courierSetEta,
  courierSetStatus,
  courierTakeOrder,
  saveCourierPreferences,
  saveCourierVehicles,
  courierWithdrawOffer,
  setZoneCoverage,
} from "@/lib/db/courier";
import { orderErrorMessage, settlementErrorMessage } from "@/lib/orders/messages";
import { validateOffer, type OfferInput } from "@/lib/orders/courier";

export type CourierActionResult =
  | { ok: true }
  // `closed`: el pedido ya no recibe ofertas (P0020): lo eligió otro, se canceló o lo resolvió el local.
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>>; closed?: boolean };

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";

// Todas las acciones empiezan por `requireCourier()`: el repartidor sale de la sesión, nunca del
// navegador (ENVIO-3). La base vuelve a comprobar de quién es cada pedido y cada barrio.

// P0019: lo tomó otro; P0020: ya no recibe ofertas; P0023: el pedido es del otro modo; P0024: necesita auto y
// este repartidor no lo tiene (el pedido no es para él: sale de su lista).
const isClosed = (code?: string) =>
  code === "P0020" || code === "P0019" || code === "P0023" || code === "P0024";

// Tomar un pedido de precio fijo (ENVIO-147): al precio de lista, sin precio ni motivo. Si lo tomó otro
// antes, la base da P0019 y la respuesta lleva `closed` para que el panel lo saque de la lista.
export async function takeOrderAction(orderId: string): Promise<CourierActionResult> {
  await requireCourier();

  const result = await courierTakeOrder(orderId);
  if ("error" in result) {
    return {
      ok: false,
      error: orderErrorMessage(result.error),
      ...(isClosed(result.error.code) ? { closed: true } : {}),
    };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// Ofertar por un pedido disponible, o cambiar la propia oferta (ENVIO-98): precio de lista o uno
// distinto con motivo. La base valida de nuevo; si el pedido ya no recibe ofertas da P0020 y la respuesta
// lleva `closed`.
export async function makeOfferAction(
  orderId: string,
  input: OfferInput,
  listPrice: number,
): Promise<CourierActionResult> {
  await requireCourier();

  const validation = validateOffer(input, listPrice);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await courierMakeOffer(orderId, { price: validation.price, reason: validation.reason });
  if ("error" in result) {
    return {
      ok: false,
      error: orderErrorMessage(result.error),
      ...(isClosed(result.error.code) ? { closed: true } : {}),
    };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// Retirar la propia oferta, mientras el cliente no eligió (ENVIO-100).
export async function withdrawOfferAction(orderId: string): Promise<CourierActionResult> {
  await requireCourier();

  const result = await courierWithdrawOffer(orderId);
  if ("error" in result) {
    return {
      ok: false,
      error: orderErrorMessage(result.error),
      ...(isClosed(result.error.code) ? { closed: true } : {}),
    };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// Rechazar un pedido disponible: deja de verlo y retira su oferta (ENVIO-102).
export async function declineOrderAction(orderId: string): Promise<CourierActionResult> {
  await requireCourier();

  const result = await courierDeclineOrder(orderId);
  if ("error" in result) {
    return {
      ok: false,
      error: orderErrorMessage(result.error),
      ...(isClosed(result.error.code) ? { closed: true } : {}),
    };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// Devolver un pedido que había tomado, con un motivo elegido (ENVIO-66 y 166).
export async function returnOrderAction(
  orderId: string,
  kind: string,
  reason: string,
): Promise<CourierActionResult> {
  await requireCourier();

  const validation = validateReturn(kind, reason);
  if (!validation.ok) {
    return { ok: false, error: validation.error, fieldErrors: { reason: validation.error } };
  }

  const result = await courierReturnOrder(orderId, validation.kind, validation.reason);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// "Llego al local en X min" o "Llego al cliente en X min" (ENVIO-157). El repartidor sale de la sesión y la
// base comprueba que el pedido sea suyo.
export async function setEtaAction(orderId: string, kind: EtaKind, minutes: number): Promise<CourierActionResult> {
  await requireCourier();

  if (kind !== "pickup" && kind !== "dropoff") return { ok: false, error: GENERIC };

  const validation = validateEta(minutes);
  if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: { minutes: validation.error } };

  const result = await courierSetEta(orderId, kind, validation.minutes);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// En camino y Entregado (ENVIO-14 y 77). Al marcar En camino puede cargar cuánto tarda en llegar al
// cliente (ENVIO-157): el tiempo se guarda antes de cambiar el estado, así lo ve el cliente al instante.
export async function advanceOrderAction(
  orderId: string,
  status: "on_the_way" | "delivered",
  etaMinutes?: number,
  from?: string,
): Promise<CourierActionResult> {
  await requireCourier();

  if (status !== "on_the_way" && status !== "delivered") {
    return { ok: false, error: "Estado desconocido." };
  }

  if (etaMinutes !== undefined) {
    const validation = validateEta(etaMinutes);
    if (!validation.ok) return { ok: false, error: validation.error, fieldErrors: { minutes: validation.error } };

    const eta = await courierSetEta(orderId, "dropoff", validation.minutes);
    if ("error" in eta) return { ok: false, error: orderErrorMessage(eta.error) };
  }

  const result = await courierSetStatus(orderId, status, from);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

const ID = /^[0-9a-f-]{36}$/i;

// "La llevo" en Mis zonas (ENVIO-57): marca o desmarca una zona de la cobertura del repartidor. El
// repartidor sale de la sesión; la base solo deja tocar las filas propias (RLS).
export async function setZoneCoverageAction(zoneId: string, covered: boolean): Promise<CourierActionResult> {
  const { courierId } = await requireCourier();

  if (typeof zoneId !== "string" || !ID.test(zoneId)) {
    return { ok: false, error: GENERIC };
  }

  const result = await setZoneCoverage(courierId, zoneId, Boolean(covered));
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/repartidor/zonas");
  return { ok: true };
}

// Sus preferencias (ADMIN-REPARTIDOR-2): "Compro cosas en el camino", "Busco otros pedidos" y un texto corto. El
// repartidor sale de la sesión; el cliente las ve en el seguimiento solo cuando el pedido es de este repartidor.
export async function savePreferencesAction(input: CourierPreferences): Promise<CourierActionResult> {
  await requireCourier();

  const validation = validatePreferences(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const result = await saveCourierPreferences(validation.value);
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/repartidor/perfil");
  return { ok: true };
}

// Su vehículo (ENVIO-174): moto, auto o los dos, al menos uno. El repartidor sale de la sesión; la base vuelve a
// exigir lo mismo. No cambia el precio ni las zonas.
export async function saveVehiclesAction(input: CourierVehicles): Promise<CourierActionResult> {
  await requireCourier();

  const validation = validateVehicles(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const result = await saveCourierVehicles(validation.value);
  if ("error" in result) return { ok: false, error: GENERIC };

  revalidatePath("/repartidor/perfil");
  return { ok: true };
}

// El repartidor marca que rindió al local lo cobrado del pedido (ENVIO-39). La marca no se deshace.
export async function markSettledAction(orderId: string): Promise<CourierActionResult> {
  await requireCourier();

  const result = await courierMarkSettled(orderId);
  if ("error" in result) {
    return { ok: false, error: settlementErrorMessage(result.error) };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}
