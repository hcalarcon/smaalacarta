"use server";

import { revalidatePath } from "next/cache";

import { requireSuperAdmin } from "@/lib/auth/superadmin";
import {
  createDefaultImage,
  deleteDefaultImage,
  suggestDefaultImage,
  updateDefaultImage,
  type Match,
} from "@/lib/db/default-images";
import { parseKeywords, validateDefaultImage } from "@/lib/superadmin/default-images";

export type SaveDefaultImageInput = {
  // Sin id se crea; con id se edita.
  id?: string;
  name: string;
  keywords: string;
  imageUrl: string;
  priority: number;
  active: boolean;
};

export type SaveDefaultImageResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Partial<Record<string, string>> };

const ID = /^[0-9a-f-]{36}$/i;

// Todas las acciones empiezan por comprobar que quien las pide es superadmin (ADMIN-SUPER-24); el RLS
// de la base lo vuelve a exigir.
export async function saveDefaultImageAction(
  input: SaveDefaultImageInput,
): Promise<SaveDefaultImageResult> {
  await requireSuperAdmin();

  const validation = validateDefaultImage(input);
  if (!validation.ok) {
    return { ok: false, error: "Revisá los datos marcados.", fieldErrors: validation.errors };
  }

  const fields = {
    name: input.name,
    keywords: parseKeywords(input.keywords),
    imageUrl: input.imageUrl,
    priority: input.priority,
    active: input.active,
  };

  if (input.id !== undefined && !ID.test(input.id)) {
    return { ok: false, error: "No encontramos esa imagen." };
  }

  const saved = input.id
    ? await updateDefaultImage(input.id, fields)
    : await createDefaultImage(fields);

  if (saved.error) {
    return { ok: false, error: "No pudimos guardar la imagen. Probá de nuevo." };
  }

  revalidatePath("/superadmin/imagenes");
  return { ok: true };
}

export async function deleteDefaultImageAction(id: string): Promise<{ ok: boolean }> {
  await requireSuperAdmin();

  if (!ID.test(id)) return { ok: false };

  const deleted = await deleteDefaultImage(id);
  if (deleted.error) return { ok: false };

  revalidatePath("/superadmin/imagenes");
  return { ok: true };
}

// El probador: la misma función de la base que usa el menú público.
export async function probeDefaultImageAction(
  name: string,
  category: string,
): Promise<{ ok: true; match: Match | null } | { ok: false }> {
  await requireSuperAdmin();

  try {
    return { ok: true, match: await suggestDefaultImage(name.slice(0, 200), category.slice(0, 200) || null) };
  } catch {
    return { ok: false };
  }
}
