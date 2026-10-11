"use server";

import { revalidatePath } from "next/cache";

import { requireCourier } from "@/lib/auth/courier";
import { validateReturnReason } from "@/lib/courier/panel";
import {
  courierDeclineOrder,
  courierMakeOffer,
  courierMarkSettled,
  courierReturnOrder,
  courierSetStatus,
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

const isClosed = (code?: string) => code === "P0020" || code === "P0019";

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

// Devolver un pedido que había tomado, con motivo obligatorio (ENVIO-66).
export async function returnOrderAction(orderId: string, reason: string): Promise<CourierActionResult> {
  await requireCourier();

  const validation = validateReturnReason(reason);
  if (!validation.ok) {
    return { ok: false, error: validation.error, fieldErrors: { reason: validation.error } };
  }

  const result = await courierReturnOrder(orderId, validation.reason);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// En camino y Entregado (ENVIO-14 y 77).
export async function advanceOrderAction(
  orderId: string,
  status: "on_the_way" | "delivered",
): Promise<CourierActionResult> {
  await requireCourier();

  if (status !== "on_the_way" && status !== "delivered") {
    return { ok: false, error: "Estado desconocido." };
  }

  const result = await courierSetStatus(orderId, status);
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
