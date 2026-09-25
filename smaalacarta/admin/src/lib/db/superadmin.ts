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
  business_users: Member[];
};

const SELECT =
  "id, name, slug, whatsapp, created_at, business_users(user_id, role, profiles(email, full_name))";

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
