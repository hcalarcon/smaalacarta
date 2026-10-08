import { createClient } from "@/lib/supabase-server";

// Las imágenes predeterminadas (ADMIN-SUPER-18 a 23). Corren con la sesión de quien llama: es el RLS de la
// base el que deja escribir solo al superadmin; las acciones además lo comprueban antes de llegar acá.
export type DefaultImage = {
  id: string;
  name: string;
  keywords: string[];
  image_url: string;
  priority: number;
  active: boolean;
  created_at: string;
};

export type DefaultImageFields = {
  name: string;
  keywords: string[];
  imageUrl: string;
  priority: number;
  active: boolean;
};

export type Match = {
  name: string;
  imageUrl: string;
  keyword: string;
  byCategory: boolean;
};

export type Unmatched = {
  normalizedName: string;
  exampleName: string;
  businessCount: number;
  productCount: number;
};

type DbError = { error?: { code?: string; message?: string } };

const COLUMNS = "id, name, keywords, image_url, priority, active, created_at";

// El superadmin ve todas, también las inactivas.
export async function listDefaultImages(): Promise<DefaultImage[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("default_images")
    .select(COLUMNS)
    .order("priority", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return data as DefaultImage[];
}

function row(fields: DefaultImageFields) {
  return {
    name: fields.name.trim(),
    keywords: fields.keywords,
    image_url: fields.imageUrl.trim(),
    priority: fields.priority,
    active: fields.active,
  };
}

export async function createDefaultImage(fields: DefaultImageFields): Promise<DbError> {
  const supabase = await createClient();
  const { error } = await supabase.from("default_images").insert(row(fields));
  return error ? { error: { code: error.code, message: error.message } } : {};
}

export async function updateDefaultImage(id: string, fields: DefaultImageFields): Promise<DbError> {
  const supabase = await createClient();
  const { error } = await supabase.from("default_images").update(row(fields)).eq("id", id);
  return error ? { error: { code: error.code, message: error.message } } : {};
}

export async function deleteDefaultImage(id: string): Promise<DbError> {
  const supabase = await createClient();
  const { error } = await supabase.from("default_images").delete().eq("id", id);
  return error ? { error: { code: error.code, message: error.message } } : {};
}

// La entrada que mejor coincide con un producto: la misma que usa el menú público, porque es la
// misma función de la base. Null si no hay coincidencia.
export async function suggestDefaultImage(
  name: string,
  category: string | null,
): Promise<Match | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("suggest_default_image", {
    p_name: name,
    ...(category ? { p_category: category } : {}),
  });

  if (error) throw new Error(error.message);

  const best = data?.[0];
  return best
    ? {
        name: best.name,
        imageUrl: best.image_url,
        keyword: best.keyword,
        byCategory: best.by_category,
      }
    : null;
}

// Productos publicados que no obtienen imagen propia ni sugerida (solo superadmin).
export async function listUnmatched(): Promise<Unmatched[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("default_images_unmatched");

  if (error) throw new Error(error.message);

  type Row = {
    normalized_name: string;
    example_name: string;
    business_count: number;
    product_count: number;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    normalizedName: r.normalized_name,
    exampleName: r.example_name,
    businessCount: Number(r.business_count),
    productCount: Number(r.product_count),
  }));
}
