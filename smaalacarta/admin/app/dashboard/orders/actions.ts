"use server";

import { revalidatePath } from "next/cache";

import {
  assignCourier,
  confirmSettlement,
  createManualOrder,
  getOrderPrepState,
  selfDelivery,
  setDeliveryFee,
  setOrderNeedsCar,
  setOrderPrep,
  setOrderStatus,
} from "@/lib/db/orders";
import { requireBusiness } from "@/lib/get-current-business";
import { validateAssignNote } from "@/lib/orders/courier";
import { validateManualOrder, type ManualOrderInput } from "@/lib/orders/manual-order";
import { manualOrderErrorMessage, orderErrorMessage, settlementErrorMessage } from "@/lib/orders/messages";
import { acceptsPrepTime, adjustMinutes, isAdjustStep, isPrepReason, validatePrepMinutes } from "@/lib/orders/prep";
import { STATUSES } from "@/lib/orders/status";
import { parsePrice } from "@/lib/superadmin/zones";

export type OrderActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

// Estas acciones exigen sesión con negocio (`requireBusiness`); el RLS y las
// funciones de la base hacen el resto: un pedido de otro negocio no se ve ni se cambia.
export async function setOrderStatusAction(
  orderId: string,
  status: string,
  note?: string,
  from?: string,
): Promise<OrderActionResult> {
  await requireBusiness();

  if (!(STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Estado desconocido." };
  }

  if (from !== undefined && !(STATUSES as readonly string[]).includes(from)) {
    return { ok: false, error: "Estado desconocido." };
  }

  // `from` es el estado que el usuario veía: si el pedido ya cambió, la base no hace nada y no es un error.
  const result = await setOrderStatus(orderId, status, note, from);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

const NO_ORDER = "El pedido no existe.";

// El motivo de una demora: vacío es "sin motivo"; uno que no es de la lista se rechaza.
function cleanReason(reason: string | null | undefined): { ok: true; reason: string | null } | { ok: false } {
  const value = typeof reason === "string" ? reason.trim() : "";
  if (value === "") return { ok: true, reason: null };
  return isPrepReason(value) ? { ok: true, reason: value } : { ok: false };
}

// Aceptar un pedido con el tiempo que estima el local, o sin tiempo (`minutes` nulo) (ADMIN-PEDIDOS-31 y 33).
// El negocio sale de la sesión; el pedido tiene que ser suyo. Un pedido programado o anticipado ya tiene su
// hora: se confirma sin tiempo. Con `needsCar` el pedido pide auto (ENVIO-176): se carga antes de confirmar, para
// que la búsqueda nazca ya filtrada y nadie sin auto la vea ni un instante.
export async function acceptOrderAction(
  orderId: string,
  minutes: number | null,
  needsCar = false,
): Promise<OrderActionResult> {
  const { business } = await requireBusiness();

  if (minutes !== null) {
    const validation = validatePrepMinutes(minutes);
    if (!validation.ok) return { ok: false, error: validation.error };
  }

  const state = await getOrderPrepState(business.id, orderId);
  if ("error" in state) return { ok: false, error: orderErrorMessage(state.error) };
  if (!state.order) return { ok: false, error: NO_ORDER };

  // Idempotente (ADMIN-PEDIDOS-51): un segundo "aceptar" sobre un pedido que ya no está pendiente no cambia
  // nada ni le avisa al usuario.
  if (state.order.status !== "pending") return { ok: true };

  if (needsCar === true && state.order.courier_status !== null) {
    const car = await setOrderNeedsCar(orderId, true);
    if ("error" in car) return { ok: false, error: orderErrorMessage(car.error) };
  }

  const confirmed = await setOrderStatus(orderId, "confirmed", undefined, "pending");
  if ("error" in confirmed) {
    // Si otro pedido de aceptar llegó primero, el pedido ya quedó aceptado: no es un error del usuario.
    const after = await getOrderPrepState(business.id, orderId);
    if (!("error" in after) && after.order && after.order.status !== "pending") {
      revalidatePath("/dashboard/orders");
      return { ok: true };
    }

    // No se aceptó: el pedido no se queda pidiendo auto por algo que el local no llegó a confirmar.
    if (needsCar === true && state.order.courier_status !== null) await setOrderNeedsCar(orderId, false);

    return { ok: false, error: orderErrorMessage(confirmed.error) };
  }

  revalidatePath("/dashboard/orders");

  if (minutes !== null && acceptsPrepTime(state.order)) {
    const prep = await setOrderPrep(orderId, minutes, null);
    if ("error" in prep) {
      return {
        ok: false,
        error: "El pedido se aceptó, pero no pudimos guardar el tiempo. Cargalo desde la tarjeta del pedido.",
      };
    }
  }

  return { ok: true };
}

// Prender o apagar "Necesita auto" en un pedido que todavía no tiene repartidor (ENVIO-176). La base vuelve a
// comprobar que es del negocio y que sigue buscando.
export async function setNeedsCarAction(orderId: string, needsCar: boolean): Promise<OrderActionResult> {
  await requireBusiness();

  if (typeof orderId !== "string" || !ID.test(orderId) || typeof needsCar !== "boolean") {
    return { ok: false, error: NO_ORDER };
  }

  const result = await setOrderNeedsCar(orderId, needsCar);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// Cargar el tiempo de un pedido ya aceptado (ADMIN-PEDIDOS-31), p. ej. el que se aceptó sin tiempo.
export async function setPrepAction(
  orderId: string,
  minutes: number,
  reason: string | null,
): Promise<OrderActionResult> {
  await requireBusiness();

  const validation = validatePrepMinutes(minutes);
  if (!validation.ok) return { ok: false, error: validation.error };

  const cleaned = cleanReason(reason);
  if (!cleaned.ok) return { ok: false, error: "Elegí uno de los motivos de la lista." };

  const result = await setOrderPrep(orderId, validation.minutes, cleaned.reason);
  if ("error" in result) return { ok: false, error: orderErrorMessage(result.error) };

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// "Cambiar la demora" (ADMIN-PEDIDOS-35 y 52): suma o resta `delta` minutos a lo que falta, calculado con la
// hora marcada que guarda la base y no con el reloj del navegador. `delta` es uno de los saltos de la lista.
export async function adjustPrepAction(
  orderId: string,
  delta: number,
  reason: string | null,
): Promise<OrderActionResult> {
  const { business } = await requireBusiness();

  if (!isAdjustStep(delta)) return { ok: false, error: "Ese cambio de demora no es válido." };

  const cleaned = cleanReason(reason);
  if (!cleaned.ok) return { ok: false, error: "Elegí uno de los motivos de la lista." };

  const state = await getOrderPrepState(business.id, orderId);
  if ("error" in state) return { ok: false, error: orderErrorMessage(state.error) };
  if (!state.order) return { ok: false, error: NO_ORDER };

  const minutes = adjustMinutes(state.order.prep_ready_at, new Date(), delta);

  const result = await setOrderPrep(orderId, minutes, cleaned.reason);
  if ("error" in result) return { ok: false, error: orderErrorMessage(result.error) };

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

export type ManualOrderActionResult =
  | { ok: true; code: string; number: number; total: number }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

// Carga un pedido a mano (ADMIN-PEDIDOS-39 a 46). El negocio sale de la sesión; la base vuelve a validar
// todo (entrega y pago contra lo habilitado, barrio, teléfono) y calcula los precios.
export async function createManualOrderAction(input: ManualOrderInput): Promise<ManualOrderActionResult> {
  const { business } = await requireBusiness();
  const courier = business.courier_delivery === true;

  const validation = validateManualOrder(input, { courier });
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await createManualOrder(business.id, input, courier);
  if ("error" in result) {
    return { ok: false, error: manualOrderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true, code: result.code, number: result.number, total: result.total };
}

const ID = /^[0-9a-f-]{36}$/i;

// Asignar a mano un repartidor a un pedido que nadie tomó (ENVIO-67 y 81). La base vuelve a comprobar
// que el pedido es del negocio, que está buscando y que el repartidor cubre la zona.
export async function assignCourierAction(
  orderId: string,
  courierId: string,
  note: string,
): Promise<OrderActionResult> {
  await requireBusiness();

  if (typeof courierId !== "string" || !ID.test(courierId)) {
    return { ok: false, error: "Elegí un repartidor." };
  }

  const validation = validateAssignNote(note);
  if (!validation.ok) {
    return { ok: false, error: validation.error, fieldErrors: { note: validation.error } };
  }

  const result = await assignCourier(orderId, courierId, validation.note);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// "Lo llevo yo" (ENVIO-68 y 81): el local lleva el envío él mismo.
export async function selfDeliveryAction(orderId: string): Promise<OrderActionResult> {
  await requireBusiness();

  const result = await selfDelivery(orderId);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// El local carga el costo de un envío a coordinar con el cliente (ENVIO-252, 253 y 262). Acepta coma o punto
// decimal; la base vuelve a comprobar que el pedido es del negocio y que lleva un costo a coordinar.
export async function setDeliveryFeeAction(orderId: string, price: string): Promise<OrderActionResult> {
  await requireBusiness();

  if (typeof orderId !== "string" || !ID.test(orderId)) return { ok: false, error: "El pedido no existe." };

  const fee = parsePrice(typeof price === "string" ? price : "");
  if (fee === null) {
    return { ok: false, error: "Escribí un precio válido, de 0 en adelante.", fieldErrors: { fee: "Precio inválido." } };
  }

  const result = await setDeliveryFee(orderId, fee);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// El local confirma que recibió lo que el repartidor rindió (ENVIO-39). La marca no se deshace.
export async function confirmSettlementAction(orderId: string): Promise<OrderActionResult> {
  await requireBusiness();

  const result = await confirmSettlement(orderId);
  if ("error" in result) {
    return { ok: false, error: settlementErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}
