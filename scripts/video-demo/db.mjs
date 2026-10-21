// Clientes de Supabase para el video demo. `supabase-js` vive en las dependencias del admin.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../smaalacarta/admin/package.json", import.meta.url));

const opciones = { auth: { persistSession: false, autoRefreshToken: false } };

// Se carga al crear el cliente, no al importar: el CI de la raíz no instala las dependencias del admin y los tests
// de este directorio importan módulos que pasan por acá sin crear ningún cliente.
const crear = (url, key) => require("@supabase/supabase-js").createClient(url, key, opciones);

export const clienteAnonimo = (url, key) => crear(url, key);
export const clienteServicio = (url, serviceKey) => crear(url, serviceKey);

// Devuelve { client, user } con la sesión de la cuenta, o lanza un mensaje claro.
export async function iniciarSesion(url, key, email, password, quien) {
  const client = clienteAnonimo(url, key);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`No pude iniciar sesión con la cuenta del ${quien} (${error?.message ?? "sin usuario"}).`);
  }
  return { client, user: data.user };
}
