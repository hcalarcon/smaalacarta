import { createClient } from "@/lib/supabase-server";

// Zonas y precios propios de cada repartidor (ENVIO-221). Corren con la sesión de quien llama: el RLS deja al
// superadmin todo y al repartidor leer las suyas y editarlas solo con `can_edit_zones`.

type DbFailure = { error: { code?: string; message?: string } };

export type OwnZone = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
};

const COLUMNS = "id, name, price, active, sort_order";

const failure = (error: { code?: string; message?: string }): DbFailure => ({
  error: { code: error.code, message: error.message },
});

export async function listOwnZones(courierId: string): Promise<OwnZone[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courier_own_zones")
    .select(COLUMNS)
    .eq("courier_id", courierId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((zone) => ({ ...zone, price: Number(zone.price) }));
}

// ¿Puede este repartidor editar sus zonas? (el superadmin se lo da en su detalle).
export async function canEditOwnZones(courierId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data } = await supabase.from("couriers").select("can_edit_zones").eq("id", courierId).maybeSingle();

  return data?.can_edit_zones === true;
}

// Alta al final de la lista.
export async function createOwnZone(
  courierId: string,
  input: { name: string; price: number },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("courier_own_zones")
    .select("sort_order")
    .eq("courier_id", courierId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("courier_own_zones").insert({
    courier_id: courierId,
    name: input.name,
    price: input.price,
    sort_order: (last?.sort_order ?? 0) + 1,
  });

  return error ? failure(error) : { ok: true };
}

// `courierId` además del id de la zona: una fila de otro repartidor no se toca ni por error (el RLS lo exige igual).
export async function updateOwnZone(
  courierId: string,
  zoneId: string,
  changes: { name?: string; price?: number; active?: boolean },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("courier_own_zones")
    .update(changes)
    .eq("id", zoneId)
    .eq("courier_id", courierId);

  return error ? failure(error) : { ok: true };
}

// Los pedidos ya hechos conservan el nombre y el precio de lista (la zona queda en `null` en el pedido).
export async function deleteOwnZone(courierId: string, zoneId: string): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.from("courier_own_zones").delete().eq("id", zoneId).eq("courier_id", courierId);

  return error ? failure(error) : { ok: true };
}

export async function saveOwnZoneOrder(courierId: string, orderedIds: string[]): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("courier_own_zones").update({ sort_order: index }).eq("id", id).eq("courier_id", courierId),
    ),
  );

  const failed = results.find((result) => result.error);
  return failed?.error ? failure(failed.error) : { ok: true };
}

// Solo el superadmin (la base lo exige con el RLS de `couriers` y un trigger).
export async function setCanEditZones(courierId: string, canEdit: boolean): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.from("couriers").update({ can_edit_zones: canEdit }).eq("id", courierId);

  return error ? failure(error) : { ok: true };
}
