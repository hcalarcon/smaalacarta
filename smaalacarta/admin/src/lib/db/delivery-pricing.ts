import { createClient } from "@/lib/supabase-server";
import type { DeliveryPricing } from "@/lib/delivery-pricing";

// Tipo de precio del envío de un negocio (ENVIO-219 a 227). Lo lee el local (Configuración → Envíos) y el
// superadmin (detalle del negocio); lo cambia solo el superadmin.

type DbFailure = { error: { code?: string; message?: string } };

export type BusinessDeliveryPricing = {
  pricing: DeliveryPricing;
  editable: boolean;
  offers_enabled: boolean;
  // El favorito guardado; `courier` es el efectivo, que sin uno guardado puede ser el repartidor por defecto.
  favorite_id: string | null;
  // El favorito efectivo y cuántas zonas propias tiene; nulo si no hay.
  courier: { id: string; name: string; active: boolean; zones: number } | null;
  courier_zones: { id: string; name: string; price: number; active: boolean }[];
  // Las zonas tildadas por el local, con el precio común y el del negocio (nulo si no cargó uno).
  zones: { id: string; name: string; common_price: number; business_price: number | null }[];
};

export async function getBusinessDeliveryPricing(businessId: string): Promise<BusinessDeliveryPricing | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_delivery_pricing", { p_business_id: businessId });

  if (error || !data) return null;

  return data as unknown as BusinessDeliveryPricing;
}

// Solo el superadmin: el trigger `businesses_guard_admin_columns` lo exige.
export async function updateDeliveryPricing(
  businessId: string,
  values: { pricing: DeliveryPricing; pricesEditable: boolean; offersEnabled: boolean },
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("businesses")
    .update({
      delivery_pricing: values.pricing,
      delivery_prices_editable: values.pricesEditable,
      delivery_offers_enabled: values.offersEnabled,
    })
    .eq("id", businessId);

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// El local carga el precio de cada zona (con permiso y tipo `business`; el RLS lo exige). Un precio en `null`
// borra la fila: la zona vuelve al precio común.
export async function saveBusinessZonePrices(
  businessId: string,
  prices: { zoneId: string; price: number | null }[],
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const toSave = prices.filter((p) => p.price !== null);
  const toClear = prices.filter((p) => p.price === null).map((p) => p.zoneId);

  if (toSave.length > 0) {
    const { error } = await supabase.from("business_zone_prices").upsert(
      toSave.map((p) => ({
        business_id: businessId,
        zone_id: p.zoneId,
        price: p.price as number,
        updated_at: new Date().toISOString(),
      })),
    );
    if (error) return { error: { code: error.code, message: error.message } };
  }

  if (toClear.length > 0) {
    const { error } = await supabase
      .from("business_zone_prices")
      .delete()
      .eq("business_id", businessId)
      .in("zone_id", toClear);
    if (error) return { error: { code: error.code, message: error.message } };
  }

  return { ok: true };
}

// Los repartidores que puede fijar el superadmin como favorito con el tipo `courier`: activos y con al menos una zona
// propia activa (ENVIO-229). Lo lee con sus permisos de superadmin.
export async function listCourierFavoriteCandidates(): Promise<{ id: string; name: string; zones: number }[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("couriers")
    .select("id, name, courier_own_zones(active)")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) return [];

  return (data ?? [])
    .map((courier) => ({
      id: courier.id,
      name: courier.name,
      zones: (courier.courier_own_zones ?? []).filter((zone) => zone.active).length,
    }))
    .filter((courier) => courier.zones > 0);
}

// Solo el superadmin (la función de la base lo exige). `null` es "Sin favorito": se pide a propósito con `p_clear`.
export async function setBusinessFavoriteCourier(
  businessId: string,
  courierId: string | null,
): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("superadmin_set_favorite_courier", {
    p_business_id: businessId,
    p_courier_id: courierId as string,
    p_clear: courierId === null,
  });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}
