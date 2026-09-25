"use server";

import { revalidatePath } from "next/cache";

import {
  deletePromotion,
  savePromotion,
  setPromotionActive,
} from "@/lib/db/promotions";
import { requireBusiness } from "@/lib/get-current-business";
import { promotionErrorMessage } from "@/lib/promotions/messages";
import {
  normalizePromotion,
  validatePromotion,
  type PromotionType,
} from "@/lib/promotions/validation";

export type SavePromotionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<string, string>>;
    };

// Estas acciones toman el negocio de la sesión (`requireBusiness`) y no de lo que
// mande el navegador; el RLS de la base lo respalda.
export async function savePromotionAction(input: {
  id: string | null;
  name: string;
  description: string;
  type: PromotionType;
  discountPercent: number;
  price: number | null;
  active: boolean;
  productIds: string[];
}): Promise<SavePromotionResult> {
  const { business } = await requireBusiness();

  const promotion = normalizePromotion(input);

  const validation = validatePromotion(promotion);
  if (!validation.ok) {
    return {
      ok: false,
      error: "Revisá los datos marcados.",
      fieldErrors: validation.errors,
    };
  }

  const saved = await savePromotion(business.id, { id: input.id, ...promotion });

  if ("error" in saved) {
    return { ok: false, error: promotionErrorMessage(saved.error) };
  }

  revalidatePath("/dashboard/promotions");
  return { ok: true };
}

export async function setPromotionActiveAction(id: string, active: boolean) {
  const { business } = await requireBusiness();
  await setPromotionActive(business.id, id, active);
  revalidatePath("/dashboard/promotions");
}

export async function deletePromotionAction(id: string) {
  const { business } = await requireBusiness();
  await deletePromotion(business.id, id);
  revalidatePath("/dashboard/promotions");
}
