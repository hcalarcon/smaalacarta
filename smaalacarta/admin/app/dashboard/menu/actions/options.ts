"use server";

import { revalidatePath } from "next/cache";

import {
  deleteOptionGroup,
  reorderOptionGroups,
  saveOptionGroup,
  setProductOptionGroups,
} from "@/lib/db/options";
import { requireBusiness } from "@/lib/get-current-business";
import {
  optionGroupErrorMessage,
  validateOptionGroup,
  validateProductGroupIds,
  type OptionGroupInput,
} from "@/lib/menu/options";
import { hasDigitalMenu } from "@/lib/plan-access";

export type SaveOptionGroupResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

export type SetProductGroupsResult = { ok: true } | { ok: false; error: string };

// Estas acciones reciben el negocio, pero lo comprueban contra la sesión
// (`requireBusiness`): un `businessId` que mande el navegador y no sea el propio se rechaza.
// El RLS de la base lo respalda. Sin menú digital no hay nada que configurar (ADMIN-OPCIONES-15).
async function ownBusiness(businessId: string) {
  const { business } = await requireBusiness();

  if (business.id !== businessId) {
    throw new Error("Negocio no válido");
  }

  const digital = hasDigitalMenu({
    planPdf: business.plan_pdf,
    planWeb: business.plan_web,
    planCompleto: business.plan_completo,
  });

  if (!digital) {
    throw new Error("El negocio no tiene menú digital");
  }

  return business;
}

export async function saveOptionGroupAction(
  businessId: string,
  input: OptionGroupInput & { id: string | null },
): Promise<SaveOptionGroupResult> {
  const business = await ownBusiness(businessId);

  const group = {
    ...input,
    name: input.name.trim(),
    options: input.options.map((option) => ({ ...option, name: option.name.trim() })),
  };

  const validation = validateOptionGroup(group);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const saved = await saveOptionGroup(business.id, group);

  if ("error" in saved) {
    return { ok: false, error: optionGroupErrorMessage(saved.error) };
  }

  revalidatePath("/dashboard/menu");
  return { ok: true, id: saved.id };
}

export async function deleteOptionGroupAction(businessId: string, id: string) {
  const business = await ownBusiness(businessId);
  await deleteOptionGroup(business.id, id);
  revalidatePath("/dashboard/menu");
}

// `orderedIds` son los grupos del negocio, en el orden nuevo.
export async function reorderOptionGroupsAction(businessId: string, orderedIds: string[]) {
  const business = await ownBusiness(businessId);
  await reorderOptionGroups(business.id, orderedIds);
}

export async function setProductOptionGroupsAction(
  businessId: string,
  productId: string,
  groupIds: string[],
): Promise<SetProductGroupsResult> {
  const business = await ownBusiness(businessId);

  const validation = validateProductGroupIds(groupIds);
  if (!validation.ok) {
    return { ok: false, error: validation.errors.groups ?? "Revisá los grupos." };
  }

  const saved = await setProductOptionGroups(business.id, productId, groupIds);

  if ("error" in saved) {
    return { ok: false, error: optionGroupErrorMessage(saved.error) };
  }

  revalidatePath("/dashboard/menu");
  return { ok: true };
}
