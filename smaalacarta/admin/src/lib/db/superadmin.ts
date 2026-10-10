import { createClient } from "@/lib/supabase-server";

export type Member = {
  user_id: string;
  role: string;
  profiles: { email: string | null; full_name: string | null } | null;
};

export type BusinessWithMembers = {
  id: string;
  name: string;
  slug: string;
  whatsapp: string | null;
  created_at: string | null;
  plan_pdf: boolean;
  plan_web: boolean;
  plan_completo: boolean;
  active: boolean;
  courier_delivery: boolean;
  business_users: Member[];
};

const SELECT =
  "id, name, slug, whatsapp, created_at, plan_pdf, plan_web, plan_completo, active, courier_delivery, business_users(user_id, role, profiles(email, full_name))";

// Estas consultas corren con la sesión del superadmin: es el RLS de la base
// (políticas *_super_admin) el que le deja ver todos los negocios, no la app.
export async function listBusinesses(): Promise<BusinessWithMembers[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("businesses")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as BusinessWithMembers[];
}

export async function getBusinessWithMembers(
  id: string,
): Promise<BusinessWithMembers | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("businesses")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as BusinessWithMembers | null;
}

// El plan y el estado de pago de un negocio (ADMIN-SUPER-14 y 15). El trigger
// `businesses_guard_admin_columns` es quien realmente exige superadmin: acá solo
// se traduce el error de permiso a un mensaje.
export async function updateBusinessPlan(
  businessId: string,
  plan: {
    planPdf: boolean;
    planWeb: boolean;
    planCompleto: boolean;
    active: boolean;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("businesses")
    .update({
      plan_pdf: plan.planPdf,
      plan_web: plan.planWeb,
      plan_completo: plan.planCompleto,
      active: plan.active,
    })
    .eq("id", businessId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// El envío con Repartos al Toque de un negocio (ENVIO-2 y 18). Igual que el plan: el trigger
// `businesses_guard_admin_columns` es quien exige superadmin.
export async function updateCourierDelivery(
  businessId: string,
  courierDelivery: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("businesses")
    .update({ courier_delivery: courierDelivery })
    .eq("id", businessId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function removeMember(businessId: string, userId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_users")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}
