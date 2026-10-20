// `npm run video-demo -- --borrar`: elimina solo los pedidos demo de Santa Julia.
// Un pedido es demo si es del negocio, tiene la nota [demo-video] y el teléfono demo. Las filas
// relacionadas (ítems, eventos, ofertas, rechazos) caen solas por ON DELETE CASCADE.
import { clienteServicio } from "./db.mjs";
import { BUSINESS_ID, DEMO_NOTE, DEMO_PHONE } from "./demo.mjs";
import { digits } from "./entorno.mjs";

export async function pedidosDemo(service) {
  const { data, error } = await service
    .from("orders")
    .select("id, order_number, customer_phone")
    .eq("business_id", BUSINESS_ID)
    .ilike("notes", `%${DEMO_NOTE}%`);
  if (error) throw new Error(`No pude buscar los pedidos demo: ${error.message}`);
  return (data ?? []).filter((order) => digits(order.customer_phone) === digits(DEMO_PHONE));
}

export async function borrarDemo({ url, serviceKey }) {
  const service = clienteServicio(url, serviceKey);
  const pedidos = await pedidosDemo(service);

  console.log(`Pedidos demo de Santa Julia a borrar: ${pedidos.length}`);
  if (pedidos.length === 0) return;

  const { error } = await service
    .from("orders")
    .delete()
    .eq("business_id", BUSINESS_ID)
    .in("id", pedidos.map((order) => order.id));
  if (error) throw new Error(`No pude borrar los pedidos demo: ${error.message}`);

  console.log(`Listo: ${pedidos.length} pedido(s) demo borrados, con sus ítems y eventos.`);
}
