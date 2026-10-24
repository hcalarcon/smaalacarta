import { createClient } from "@/lib/supabase-server";

// Zonas y precios propios de un negocio con envío propio (ENVIO-247). Corren con la sesión de quien llama: el RLS deja
// a los miembros del negocio y al superadmin leer y escribir las del negocio, y al repartidor propio solo leerlas.

type DbFailure = { error: { code?: string; message?: string } };

export type BusinessZone = {
  id: string;
  name: string;
  // Una zona sin precio no se ofrece en el menú.
  price: number | null;
  active: boolean;
  sort_order: number;
};

const COLUMNS = "id, name, price, active, sort_order";

const failure = (error: { code?: string; message?: string }): DbFailure => ({
  error: { code: error.code, message: error.message },
});

export async function listBusinessZones(businessId: string): Promise<BusinessZone[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_own_zones")
    .select(COLUMNS)
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((zone) => ({ ...zone, price: zone.price === null ? null : Number(zone.price) }));
}

// Alta al final de la lista.
export async function createBusinessZone(
  businessId: string,
  input: { name: string; price: number },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("business_own_zones")
    .select("sort_order")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("business_own_zones").insert({
    business_id: businessId,
    name: input.name,
    price: input.price,
    sort_order: (last?.sort_order ?? 0) + 1,
  });

  return error ? failure(error) : { ok: true };
}

// `businessId` además del id de la zona: una fila de otro negocio no se toca ni por error (el RLS lo exige igual).
export async function updateBusinessZone(
  businessId: string,
  zoneId: string,
  changes: { name?: string; price?: number; active?: boolean },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_own_zones")
    .update(changes)
    .eq("id", zoneId)
    .eq("business_id", businessId);

  return error ? failure(error) : { ok: true };
}

// Los pedidos ya hechos conservan el nombre y el precio de lista (la zona queda en `null` en el pedido).
export async function deleteBusinessZone(businessId: string, zoneId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.from("business_own_zones").delete().eq("id", zoneId).eq("business_id", businessId);

  return error ? failure(error) : { ok: true };
}

export async function saveBusinessZoneOrder(
  businessId: string,
  orderedIds: string[],
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("business_own_zones").update({ sort_order: index }).eq("id", id).eq("business_id", businessId),
    ),
  );

  const failed = results.find((result) => result.error);
  return failed?.error ? failure(failed.error) : { ok: true };
}
