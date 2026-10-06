import { deleteRecord } from "@/lib/db/resources";
import { saveOrder } from "@/lib/db/ordering";
import { sortByOrder } from "@/lib/menu/ordering";
import type { OptionGroupInput } from "@/lib/menu/options";
import { createClient } from "@/lib/supabase-server";
import type { Database } from "@/types/database";

export type OptionRow = Database["public"]["Tables"]["options"]["Row"];
export type OptionGroup = Database["public"]["Tables"]["option_groups"]["Row"] & {
  options: OptionRow[];
};

type DbFailure = { error: { code?: string; message?: string } };

// Los grupos del negocio con sus opciones, cada lista en el orden que le dio el negocio.
export async function listOptionGroups(businessId: string): Promise<OptionGroup[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("option_groups")
    .select("*, options(*)")
    .eq("business_id", businessId);

  if (error) {
    throw new Error(error.message);
  }

  return sortByOrder(data ?? []).map((group) => ({
    ...group,
    options: [...(group.options ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
}

// Qué grupos tiene cada producto, en su orden (ADMIN-OPCIONES-6).
export async function listProductGroupLinks(businessId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_option_groups")
    .select("product_id, group_id, sort_order")
    .eq("business_id", businessId)
    .order("sort_order");

  if (error) {
    throw new Error(error.message);
  }

  const links: Record<string, string[]> = {};
  for (const row of data ?? []) {
    (links[row.product_id] ??= []).push(row.group_id);
  }

  return links;
}

// Los productos que forman parte de alguna promoción: no pueden tener un grupo obligatorio.
export async function listProductIdsInPromotions(businessId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("promotion_items")
    .select("product_id")
    .eq("business_id", businessId);

  if (error) {
    throw new Error(error.message);
  }

  return [...new Set((data ?? []).map((row) => row.product_id))];
}

// Los productos con algún grupo obligatorio (ADMIN-OPCIONES-14).
export async function listRequiredGroupProductIds(businessId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("option_groups")
    .select("id, product_option_groups(product_id)")
    .eq("business_id", businessId)
    .gte("min_select", 1);

  if (error) {
    throw new Error(error.message);
  }

  return new Set(
    (data ?? []).flatMap((group) =>
      (group.product_option_groups ?? []).map((link) => link.product_id),
    ),
  );
}

// Guarda el grupo con sus opciones en un solo paso (ADMIN-OPCIONES-3). Los errores de la
// base vuelven como `{ error }` para poder traducirlos.
export async function saveOptionGroup(
  businessId: string,
  input: OptionGroupInput & { id: string | null },
): Promise<{ id: string } | DbFailure> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("save_option_group", {
    p_id: input.id as string,
    p_business_id: businessId,
    p_name: input.name,
    p_min_select: input.minSelect,
    p_max_select: input.maxSelect,
    p_allow_repeat: input.allowRepeat,
    p_active: input.active,
    p_options: input.options.map((option) => ({
      ...(option.id ? { id: option.id } : {}),
      name: option.name,
      price_delta: option.priceDelta,
      active: option.active,
      sold_out: option.soldOut,
    })),
  });

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  return { id: data as string };
}

// Borrar un grupo se lleva sus opciones y sus asociaciones (ADMIN-OPCIONES-8).
export async function deleteOptionGroup(businessId: string, id: string) {
  await deleteRecord("option_groups", businessId, id);
}

// ADMIN-OPCIONES-9.
export async function reorderOptionGroups(businessId: string, orderedIds: string[]) {
  await saveOrder("option_groups", businessId, orderedIds);
}

// Deja en el producto exactamente estos grupos, en este orden (ADMIN-OPCIONES-6).
export async function setProductOptionGroups(
  businessId: string,
  productId: string,
  groupIds: string[],
): Promise<Record<string, never> | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_product_option_groups", {
    p_business_id: businessId,
    p_product_id: productId,
    p_group_ids: groupIds,
  });

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  return {};
}
