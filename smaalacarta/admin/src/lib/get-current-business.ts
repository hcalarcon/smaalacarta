import { createClient } from "@/lib/supabase-server";

export async function getCurrentBusiness() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: businessUser, error } = await supabase
    .from("business_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!businessUser) {
    return null;
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessUser.business_id)
    .maybeSingle();

  return {
    user,
    role: businessUser.role,
    business,
  };
}
