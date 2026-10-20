// Clientes de Supabase para el video demo. `supabase-js` vive en las dependencias del admin.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../smaalacarta/admin/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

export const clienteAnonimo = (url, key) => createClient(url, key, opciones);
export const clienteServicio = (url, serviceKey) => createClient(url, serviceKey, opciones);

// Devuelve { client, user } con la sesión de la cuenta, o lanza un mensaje claro.
export async function iniciarSesion(url, key, email, password, quien) {
  const client = clienteAnonimo(url, key);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`No pude iniciar sesión con la cuenta del ${quien} (${error?.message ?? "sin usuario"}).`);
  }
  return { client, user: data.user };
}
