"use server";

import { revalidatePath } from "next/cache";

import { createManualOrder, setOrderStatus } from "@/lib/db/orders";
import { requireBusiness } from "@/lib/get-current-business";
import { validateManualOrder, type ManualOrderInput } from "@/lib/orders/manual-order";
import { orderErrorMessage } from "@/lib/orders/messages";
import { STATUSES } from "@/lib/orders/status";

export type OrderActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

// Estas acciones exigen sesión con negocio (`requireBusiness`); el RLS y las
// funciones de la base hacen el resto: un pedido de otro negocio no se ve ni se cambia.
export async function setOrderStatusAction(
  orderId: string,
  status: string,
): Promise<OrderActionResult> {
  await requireBusiness();

  if (!(STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: "Estado desconocido." };
  }

  const result = await setOrderStatus(orderId, status);
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
