"use server";

import { revalidatePath } from "next/cache";

import { requireCourier } from "@/lib/auth/courier";
import { validateReturnReason } from "@/lib/courier/panel";
import {
  courierDeclineOrder,
  courierMarkSettled,
  courierReturnOrder,
  courierSetStatus,
  courierTakeOrder,
  setZoneCoverage,
} from "@/lib/db/courier";
import { orderErrorMessage, settlementErrorMessage } from "@/lib/orders/messages";
import { validateCourierResponse, type CourierResponseInput } from "@/lib/orders/courier";

export type CourierActionResult =
  | { ok: true }
  // `taken`: el pedido ya lo tomó otro repartidor o dejó de estar disponible (P0019): el panel lo saca.
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>>; taken?: boolean };

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";

// Todas las acciones empiezan por `requireCourier()`: el repartidor sale de la sesión, nunca del
// navegador (ENVIO-3). La base vuelve a comprobar de quién es cada pedido y cada barrio.

// Tomar un pedido disponible (con nota y precio final; si cambia, motivo): el primero se lo queda
// (ENVIO-63 y 64). Si ya lo tomó otro, la base da P0019 y la respuesta lleva `taken`.
export async function takeOrderAction(
  orderId: string,
  input: CourierResponseInput,
  currentFee: number,
): Promise<CourierActionResult> {
  await requireCourier();

  const validation = validateCourierResponse(input, currentFee);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await courierTakeOrder(orderId, {
    note: validation.note,
    fee: validation.fee,
    feeReason: validation.reason,
  });
  if ("error" in result) {
    return {
      ok: false,
      error: orderErrorMessage(result.error),
      ...(result.error.code === "P0019" ? { taken: true } : {}),
    };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// Rechazar un pedido disponible: deja de verlo (ENVIO-65).
export async function declineOrderAction(orderId: string): Promise<CourierActionResult> {
  await requireCourier();

  const result = await courierDeclineOrder(orderId);
  if ("error" in result) {
    return {
      ok: false,
      error: orderErrorMessage(result.error),
      ...(result.error.code === "P0019" ? { taken: true } : {}),
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
