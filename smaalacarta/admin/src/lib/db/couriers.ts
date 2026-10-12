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
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

type CourierRow = {
  id: string;
  name: string;
  whatsapp: string | null;
  active: boolean;
  courier_zone_coverage: { count: number }[];
  courier_users: { user_id: string }[];
};

const SELECT = "id, name, whatsapp, active, courier_zone_coverage(count), courier_users(user_id)";

// `courier_users.user_id` apunta a `auth.users`, no a `profiles`: los emails se piden aparte.
async function withEmails(supabase: Supabase, rows: CourierRow[]): Promise<CourierSummary[]> {
  const userIds = rows.flatMap((row) => row.courier_users.map((user) => user.user_id));

  const emails = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data } = await supabase.from("profiles").select("id, email").in("id", userIds);
    for (const profile of data ?? []) emails.set(profile.id, profile.email);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    whatsapp: row.whatsapp,
    active: row.active,
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

// Nombre, WhatsApp y si está activo. Si quien llama no es superadmin, el RLS no deja cambiar ninguna
// fila y se devuelve "no encontrado".
export async function updateCourier(
  id: string,
  changes: { name: string; whatsapp: string; active: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("couriers")
    .update({ name: changes.name, whatsapp: changes.whatsapp, active: changes.active })
    .eq("id", id)
    .select("id");

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "No encontramos al repartidor." };
  }

  return { ok: true };
}
