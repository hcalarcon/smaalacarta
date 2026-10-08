"use server";

import { suggestDefaultImage } from "@/lib/db/default-images";
import { requireBusiness } from "@/lib/get-current-business";
import type { Suggestion } from "@/lib/menu/default-image-hint";

// Qué ilustración le tocaría a un producto sin foto (ADMIN-CONFIG-32). Es la misma función de la base
// que usa el menú público; solo la puede pedir quien tiene un negocio.
export async function suggestProductImageAction(
  name: string,
  categoryName: string | null,
): Promise<{ ok: true; suggestion: Suggestion | null } | { ok: false }> {
  await requireBusiness();

  const clean = name.trim().slice(0, 200);
  if (!clean) return { ok: true, suggestion: null };

  try {
    const match = await suggestDefaultImage(clean, categoryName?.slice(0, 200) || null);
    return { ok: true, suggestion: match ? { name: match.name, imageUrl: match.imageUrl } : null };
  } catch {
    return { ok: false };
  }
}
