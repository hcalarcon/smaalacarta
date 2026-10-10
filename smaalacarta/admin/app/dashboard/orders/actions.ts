"use server";

import { revalidatePath } from "next/cache";

import { confirmSettlement, createManualOrder, setOrderCourier, setOrderStatus } from "@/lib/db/orders";
import { requireBusiness } from "@/lib/get-current-business";
import { validateCourierResponse, type CourierResponseInput } from "@/lib/orders/courier";
import { validateManualOrder, type ManualOrderInput } from "@/lib/orders/manual-order";
import { orderErrorMessage, settlementErrorMessage } from "@/lib/orders/messages";
import { STATUSES } from "@/lib/orders/status";

export type OrderActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

// Estas acciones exigen sesión con negocio (`requireBusiness`); el RLS y las
// funciones de la base hacen el resto: un pedido de otro negocio no se ve ni se cambia.
export async function setOrderStatusAction(
  orderId: string,
  status: string,
  note?: string,
): Promise<OrderActionResult> {
  await requireBusiness();

  if (!(STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Estado desconocido." };
  }

  const result = await setOrderStatus(orderId, status, note);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

export async function createManualOrderAction(
  input: ManualOrderInput,
): Promise<OrderActionResult> {
  const { business } = await requireBusiness();

  const validation = validateManualOrder(input);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const result = await createManualOrder(business.id, input);
  if ("error" in result) {
    return { ok: false, error: orderErrorMessage(result.error) };
  }

  revalidatePath("/dashboard/orders");
  return { ok: true };
}

// Consulta o respuesta del repartidor (ENVIO-11 y 12). `currentFee` es el precio final que ve el
// local: un precio distinto exige motivo. La base vuelve a comprobar todo y quién es el que llama.
export async function setOrderCourierAction(
  orderId: string,
  action: "request" | "accept" | "reject",
  input: CourierResponseInput,
  currentFee: number,
): Promise<OrderActionResult> {
  await requireBusiness();

  if (!["request", "accept", "reject"].includes(action)) {
    return { ok: false, error: "Acción desconocida." };
  }

  const validation = validateCourierResponse(input, currentFee);
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
