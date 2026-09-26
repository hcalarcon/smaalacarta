import { createClient } from "@/lib/supabase-server";

// El nombre y el slug de `businesses`; el RLS ya deja a cualquier miembro
// editar su propio negocio (`businesses_update_member`).
export async function updateBusinessProfile(
  businessId: string,
  input: { name: string; slug: string },
): Promise<{ error?: { code?: string; message?: string } }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("businesses")
    .update({ name: input.name, slug: input.slug })
    .eq("id", businessId);

  if (error) {
    return { error: { code: error.code, message: error.message } };
  }

  return {};
}
