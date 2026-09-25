import { createClient } from "@/lib/supabase-server";

export async function getRecords<T>(table: string, businessId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as T[];
}

export async function getRecord<T>(
  table: string,
  businessId: string,
  id: string,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as T | null;
}

export async function insertRecord(
  table: string,
  payload: Record<string, unknown>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateRecord(
  table: string,
  id: string,
  businessId: string,
  payload: Record<string, unknown>,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteRecord(
  table: string,
  businessId: string,
  id: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("business_id", businessId)
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
