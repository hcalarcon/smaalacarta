import { createClient } from "@/lib/supabase-server";

// ¿Está prendido el interruptor "Vehículo del repartidor"? (ENVIO-175). Lo pregunta cualquier pantalla con sesión
// (local, repartidor, superadmin) a la función de la base, la misma que usa el servidor para filtrar. Si la
// consulta falla, queda apagado: sin el dato, no se muestra ni se pide nada.
export async function isVehicleEnabled(): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("vehicle_enabled");

  return !error && data === true;
}
