import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Postgres real en memoria (PGlite, WebAssembly) para probar las migraciones y
// las políticas de RLS sin Docker. Se arma como Supabase: esquema `auth`,
// `auth.uid()` leído del "JWT" de la sesión, y los roles `anon`/`authenticated`.
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  -- Storage: lo mínimo que usan las migraciones y las políticas de los buckets.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text,
    owner uuid
  );
  alter table storage.objects enable row level security;
  -- Como la de Supabase: las carpetas del nombre, sin el archivo.
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
`;

export type TestDb = PGlite;

export type QueryResult =
  | { ok: true; rows: Record<string, unknown>[]; affected: number }
  | { ok: false; error: string; code?: string };

// Aplica todas las migraciones de `supabase/migrations`, en orden, como lo hace
// `supabase db push`. Si una falla, el test falla con el nombre del archivo.
export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  const dir = join(process.cwd(), "supabase", "migrations");

  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migración ${file}: ${(error as Error).message}`);
    }
  }

  // Supabase da estos permisos por defecto; lo que limita es el RLS.
  await db.exec(
    "grant all on all tables in schema public to anon, authenticated; grant all on all tables in schema storage to anon, authenticated;",
  );

  return db;
}

// Ejecuta `sql` como si lo pidiera ese usuario a través de la API: rol
// `authenticated` con su id en el JWT, o `anon` si `userId` es null.
export async function asUser(
  db: TestDb,
  userId: string | null,
  sql: string,
): Promise<QueryResult> {
  await db.exec(
    `set role ${userId ? "authenticated" : "anon"};
     select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`,
  );

  try {
    const result = await db.query<Record<string, unknown>>(sql);
    return {
      ok: true,
      rows: result.rows,
      affected: result.affectedRows ?? result.rows.length,
    };
  } catch (error) {
    const e = error as Error & { code?: string };
    return { ok: false, error: e.message, code: e.code };
  } finally {
    await db.exec("reset role");
  }
}

export function createUser(
  db: TestDb,
  user: { id: string; email: string; fullName?: string },
) {
  // El trigger `on_auth_user_created` crea el perfil.
  return db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [user.id, user.email, JSON.stringify({ full_name: user.fullName ?? null })],
  );
}
