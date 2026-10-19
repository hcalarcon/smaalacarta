import { cache } from "react";

import {
  businessFromRow,
  isFreshActivity,
  statusFromRow,
  type AvailabilityStatus,
  type BusinessAvailability,
} from "@/lib/courier/availability";
import { createClient } from "@/lib/supabase-server";

// Disponibilidad de los repartidores (ENVIO-191 a 202). Todo corre con la sesión de quien llama: lo que ve y toca
// lo decide el RLS y las funciones de la base, y ninguna acción recibe el id del repartidor.

type DbFailure = { error: { code?: string; message?: string } };

// El estado del propio repartidor. Con `cache`, el layout y la página comparten una sola consulta.
export const getCourierAvailability = cache(async (): Promise<AvailabilityStatus> => {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("courier_availability_status");

  if (error) {
    throw new Error(error.message);
  }

  return statusFromRow(data);
});

export async function setCourierAvailable(available: boolean): Promise<{ ok: true } | DbFailure> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("courier_set_available", { p_available: available });

  return error ? { error: { code: error.code, message: error.message } } : { ok: true };
}

// Cuántos repartidores disponibles cubren las zonas del local y cuáles zonas están en 0. El negocio lo pone el
// servidor (`requireBusiness()`), nunca el navegador. Si falla, no se muestra nada: un aviso de más es peor que
// ninguno.
export async function getBusinessAvailability(businessId: string): Promise<BusinessAvailability> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_courier_availability", { p_business_id: businessId });

  return error ? { enabled: false, total: 0, emptyZoneIds: [] } : businessFromRow(data);
}

export type AvailableCourier = {
  id: string;
  name: string;
  since: string;
  zones: string[];
};

type AvailabilityRow = {
  courier_id: string;
  since: string | null;
  last_activity_at: string | null;
  couriers: {
    name: string;
    active: boolean;
    courier_zone_coverage: { delivery_zones: { name: string; active: boolean } | null }[];
  } | null;
};

// Para el superadmin (ENVIO-201): los disponibles ahora, con desde qué hora y qué zonas cubren. El RLS deja leer
// todas las filas solo al superadmin; para cualquier otro la lista vuelve vacía.
export async function listAvailableCouriers(now: Date = new Date()): Promise<AvailableCourier[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("courier_availability")
    .select(
      "courier_id, since, last_activity_at, couriers(name, active, courier_zone_coverage(delivery_zones(name, active)))",
    )
    .eq("available", true)
    .order("since", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = ((data ?? []) as unknown as AvailabilityRow[]).filter(
    (row) => row.couriers?.active && row.since && isFreshActivity(row.last_activity_at, now),
  );

  // Con "Exigir términos" prendido, la base no cuenta a quien no aceptó la versión vigente (ENVIO-196): acá tampoco.
  const accepted = await acceptedCurrentTerms(
    supabase,
    rows.map((row) => row.courier_id),
  );

  return rows
    .filter((row) => accepted === null || accepted.has(row.courier_id))
    .map((row) => ({
      id: row.courier_id,
      name: row.couriers!.name,
      since: row.since as string,
      zones: row.couriers!.courier_zone_coverage
        .map((coverage) => coverage.delivery_zones)
        .filter((zone): zone is { name: string; active: boolean } => !!zone && zone.active)
        .map((zone) => zone.name)
        .sort((a, b) => a.localeCompare(b, "es")),
    }));
}

// Los que aceptaron la versión vigente, o nulo si no se exigen los términos. El superadmin lee las dos tablas.
async function acceptedCurrentTerms(
  supabase: Awaited<ReturnType<typeof createClient>>,
  courierIds: string[],
): Promise<Set<string> | null> {
  const { data: settings } = await supabase
    .from("platform_settings")
    .select("courier_terms_required, courier_terms_version")
    .maybeSingle();

  if (settings?.courier_terms_required === false || courierIds.length === 0) return null;

  const { data } = await supabase
    .from("courier_terms_acceptances")
    .select("courier_id")
    .eq("version", settings?.courier_terms_version ?? 1)
    .in("courier_id", courierIds);

  return new Set((data ?? []).map((row) => row.courier_id));
}
