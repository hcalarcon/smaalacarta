import { createClient } from "@/lib/supabase-server";

// Los repartidores, para el superadmin (ENVIO-55). Corren con su sesión: es el RLS de la base
// (`couriers_all_super_admin`) el que se lo permite, no la app.

export type CourierSummary = {
  id: string;
  name: string;
  whatsapp: string | null;
  active: boolean;
  // Cuántas zonas cubre.
  zoneCount: number;
  // El email de su cuenta, si la tiene.
  email: string | null;
  // Moto y/o auto (ENVIO-174).
  moto: boolean;
  auto: boolean;
  // La última versión de los términos que aceptó y cuándo (ENVIO-185); nulo si nunca aceptó.
  terms: { version: number; acceptedAt: string } | null;
  // Libre (la red común) o propio de un negocio (ENVIO-246).
  courierType: "free" | "own";
  ownBusiness: { id: string; name: string } | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

type CourierRow = {
  id: string;
  name: string;
  whatsapp: string | null;
  active: boolean;
  moto: boolean;
  auto: boolean;
  courier_type: "free" | "own";
  own_business: { id: string; name: string } | null;
  courier_zone_coverage: { count: number }[];
  courier_users: { user_id: string }[];
};

const SELECT =
  "id, name, whatsapp, active, moto, auto, courier_type, own_business:businesses(id, name), courier_zone_coverage(count), courier_users(user_id)";

// `courier_users.user_id` apunta a `auth.users`, no a `profiles`: los emails se piden aparte.
async function withEmails(supabase: Supabase, rows: CourierRow[]): Promise<CourierSummary[]> {
  const userIds = rows.flatMap((row) => row.courier_users.map((user) => user.user_id));

  const emails = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, email").in("id", userIds);
    for (const profile of data ?? []) emails.set(profile.id, profile.email);
  }

  // El RLS deja al superadmin leer todas las aceptaciones: se queda con la última de cada repartidor.
  const terms = new Map<string, { version: number; acceptedAt: string }>();
  if (rows.length > 0) {
    const { data } = await supabase
      .from("courier_terms_acceptances")
      .select("courier_id, version, accepted_at")
      .in(
        "courier_id",
        rows.map((row) => row.id),
      )
      .order("version", { ascending: false });
    for (const item of data ?? []) {
      if (!terms.has(item.courier_id)) terms.set(item.courier_id, { version: item.version, acceptedAt: item.accepted_at });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    whatsapp: row.whatsapp,
    active: row.active,
    moto: row.moto,
    auto: row.auto,
    terms: terms.get(row.id) ?? null,
    courierType: row.courier_type,
    ownBusiness: row.courier_type === "own" ? row.own_business : null,
    zoneCount: row.courier_zone_coverage[0]?.count ?? 0,
    email: row.courier_users[0] ? (emails.get(row.courier_users[0].user_id) ?? null) : null,
  }));
}

export async function listCouriers(): Promise<CourierSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("couriers")
    .select(SELECT)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return withEmails(supabase, (data ?? []) as unknown as CourierRow[]);
}

// Solo el nombre, con la sesión de quien llama: el repartidor lee su propia fila (ENVIO-3).
export async function getCourierName(id: string): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase.from("couriers").select("name").eq("id", id).maybeSingle();

  return data?.name ?? null;
}

export async function getCourier(id: string): Promise<CourierSummary | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.from("couriers").select(SELECT).eq("id", id).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const [courier] = await withEmails(supabase, [data as unknown as CourierRow]);
  return courier;
}

export type CourierTypeChange = { courierType: "free" | "own"; ownBusinessId: string | null };

// Nombre, WhatsApp, si está activo y su tipo (libre o propio de un negocio, ENVIO-246). Si quien llama no es superadmin,
// el RLS no deja cambiar ninguna fila y se devuelve "no encontrado". Un negocio que ya tiene otro repartidor propio
// activo da `conflict` (índice único de la base).
export async function updateCourier(
  id: string,
  changes: { name: string; whatsapp: string; active: boolean } & Partial<CourierTypeChange>,
): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("couriers")
    .update({
      name: changes.name,
      whatsapp: changes.whatsapp,
      active: changes.active,
      ...(changes.courierType
        ? {
            courier_type: changes.courierType,
            own_business_id: changes.courierType === "own" ? changes.ownBusinessId : null,
          }
        : {}),
    })
    .eq("id", id)
    .select("id");

  if (error) {
    return { ok: false, error: error.message, conflict: error.code === "23505" };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "No encontramos al repartidor." };
  }

  return { ok: true };
}

// Solo el tipo, para un repartidor recién creado.
export async function setCourierType(
  id: string,
  change: CourierTypeChange,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("couriers")
    .update({
      courier_type: change.courierType,
      own_business_id: change.courierType === "own" ? change.ownBusinessId : null,
    })
    .eq("id", id)
    .select("id");

  if (error || !data || data.length === 0) return { ok: false, conflict: error?.code === "23505" };

  return { ok: true };
}

export type BusinessChoice = {
  id: string;
  name: string;
  slug: string;
  deliveryType: "free" | "own";
  // El repartidor propio activo que ya tiene, si lo hay.
  ownCourier: { id: string; name: string } | null;
};

// Los negocios entre los que se elige "propio de", y qué repartidor propio activo tiene ya cada uno.
export async function listBusinessChoices(): Promise<BusinessChoice[]> {
  const supabase = await createClient();

  const [{ data: businesses, error }, { data: own }] = await Promise.all([
    supabase.from("businesses").select("id, name, slug, delivery_type").order("name"),
    supabase.from("couriers").select("id, name, own_business_id").eq("courier_type", "own").eq("active", true),
  ]);

  if (error) throw new Error(error.message);

  const byBusiness = new Map((own ?? []).map((courier) => [courier.own_business_id, courier]));

  return (businesses ?? []).map((business) => {
    const courier = byBusiness.get(business.id);

    return {
      id: business.id,
      name: business.name,
      slug: business.slug,
      deliveryType: business.delivery_type as "free" | "own",
      ownCourier: courier ? { id: courier.id, name: courier.name } : null,
    };
  });
}
