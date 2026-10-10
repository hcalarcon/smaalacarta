"use server";

import { revalidatePath } from "next/cache";

import { requireCourier } from "@/lib/auth/courier";
import { courierMarkSettled, createZone, courierSetStatus, deleteZone, listZones, saveZoneOrder, updateZone } from "@/lib/db/courier";
import { setOrderCourier } from "@/lib/db/orders";
import { orderErrorMessage, settlementErrorMessage } from "@/lib/orders/messages";
import { validateCourierResponse, type CourierResponseInput } from "@/lib/orders/courier";
import { validateZone } from "@/lib/courier/zones";

export type CourierActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

const GENERIC = "No pudimos guardar el cambio. Probá de nuevo.";

// Todas las acciones empiezan por `requireCourier()`: el repartidor sale de la sesión, nunca del
// navegador (ENVIO-3). La base vuelve a comprobar de quién es cada pedido y cada barrio.

// Aceptar (con nota y precio final; si cambia, motivo) o "No puedo" (ENVIO-32).
export async function respondOrderAction(
  orderId: string,
  action: "accept" | "reject",
  input: CourierResponseInput,
  currentFee: number,
): Promise<CourierActionResult> {
  await requireCourier();

  if (action !== "accept" && action !== "reject") {
    return { ok: false, error: "Acción desconocida." };
  }

  const validation = validateCourierResponse(
    // "No puedo" no cambia el precio.
    action === "accept" ? input : { ...input, fee: "", reason: "" },
    currentFee,
  );
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await setOrderCourier(orderId, {
    action,
    note: validation.note,
    fee: validation.fee,
    feeReason: validation.reason,
  });
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/repartidor");
  return { ok: true };
}

// En camino y Entregado (ENVIO-14 y 32).
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

function zoneError(error: { code?: string }) {
  if (error.code === "23505") {
    return { ok: false as const, error: "Ya existe un barrio con ese nombre.", fieldErrors: { name: "Ya existe un barrio con ese nombre." } };
  }
  return { ok: false as const, error: GENERIC };
}

// Alta de un barrio (ENVIO-36 y 37).
export async function createZoneAction(input: { name: string; price: string }): Promise<CourierActionResult> {
  const { courierId } = await requireCourier();

  const validation = validateZone(input, await listZones(courierId));
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await createZone(courierId, { name: validation.name, price: validation.price });
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/repartidor/zonas");
  return { ok: true };
}

// Cambia el nombre y el precio de un barrio. Un precio nuevo vale para los pedidos nuevos.
export async function updateZoneAction(
  zoneId: string,
  input: { name: string; price: string },
): Promise<CourierActionResult> {
  const { courierId } = await requireCourier();

  const validation = validateZone(input, await listZones(courierId), zoneId);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await updateZone(courierId, zoneId, { name: validation.name, price: validation.price });
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/repartidor/zonas");
  return { ok: true };
}

export async function setZoneActiveAction(zoneId: string, active: boolean): Promise<CourierActionResult> {
  const { courierId } = await requireCourier();

  const result = await updateZone(courierId, zoneId, { active: Boolean(active) });
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/repartidor/zonas");
  return { ok: true };
}

export async function deleteZoneAction(zoneId: string): Promise<CourierActionResult> {
  const { courierId } = await requireCourier();

  const result = await deleteZone(courierId, zoneId);
  if ("error" in result) return zoneError(result.error);

  revalidatePath("/repartidor/zonas");
  return { ok: true };
}

export async function reorderZonesAction(orderedIds: string[]): Promise<CourierActionResult> {
  const { courierId } = await requireCourier();

  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return { ok: false, error: GENERIC };
  }

  const result = await saveZoneOrder(courierId, orderedIds);
  if ("error" in result) return zoneError(result.error);

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
